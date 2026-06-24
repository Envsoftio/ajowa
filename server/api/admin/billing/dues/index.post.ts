import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import {
  appendChargeLookup,
  applyCamAdvanceCoverageToChargeBreakdown,
  dueGenerationSchema,
  getBillingCycleLabel,
  getBillingCycleMultiplier,
  summarizeCamAdvanceCoverage,
  type CamAdvanceCoverageRange,
  type DueGenerationInput,
  hasUnresolvedAreaRateCharge,
  removeChargesOverriddenByPeriod,
  resolveChargeBreakdown,
} from '~/server/utils/billing'
import { AppError } from '~/server/utils/errors'
import { enqueueDueBillingContactNotifications } from '~/server/utils/notifications'
import { consumeAdvanceCreditsForDueWithClient } from '~/server/utils/payments'
import type { ChargeBreakdownItem } from '~/types/domain'

type FlatTarget = {
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
  blockId: string
  areaSqFt: string | null
  camAdvancePaidUntil: string | null
}

type ChargeConfig = {
  billing_period_id: string | null
  scope: string
  flat_type: string | null
  flat_id: string | null
  charge_name: string
  amount: string
  calculation_method: 'FIXED' | 'AREA_RATE'
  rate_per_sq_ft: string | null
  charge_breakdown: ChargeBreakdownItem[]
}

type ExistingDueRow = {
  id: string
  flat_id: string
}

type OverlappingCamDueRow = ExistingDueRow & {
  billing_period_label: string
}

type DueInsertPayload = {
  flatId: string
  baseAmount: number
  totalAmount: number
  chargeBreakdown: ChargeBreakdownItem[]
}

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const roundMoney = (value: number) => Math.round(value * 100) / 100

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const body = validatePayload<DueGenerationInput>(dueGenerationSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    // Verify period exists and is not locked
    const periodResult = await client.query<{
      id: string
      label: string
      frequency: string
      start_date: string
      end_date: string
      charge_type: string
      is_locked: boolean
      due_date: string
    }>(
      `
        select id, label, frequency::text, start_date::text, end_date::text, charge_type::text, is_locked, due_date::text
        from billing_periods
        where id = $1 and society_id = $2
        limit 1
      `,
      [body.billingPeriodId, authMe.user.societyId],
    )

    const period = periodResult.rows[0]
    if (!period) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Billing period not found.',
      })
    }

    if (period.is_locked) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Cannot generate dues for a locked billing period.',
      })
    }

    const periodDueDate = period.due_date
    const generatedAtDate = body.billDate ?? new Date().toISOString().slice(0, 10)
    const cycleMultiplier = getBillingCycleMultiplier(period)
    const cycleLabel = getBillingCycleLabel(cycleMultiplier)

    // Fetch active flats
    const flatsResult = await client.query<FlatTarget>(
      `
        select
          f.id as "flatId",
          f.flat_number as "flatNumber",
          b.name as "blockName",
          f.unit_type as "unitType",
          b.id as "blockId",
          f.area_sq_ft::text as "areaSqFt",
          f.cam_advance_paid_until::text as "camAdvancePaidUntil"
        from flats f
        inner join blocks b on b.id = f.block_id
        where f.society_id = $1
          and f.is_active = true
          ${body.flatIds ? `and f.id = any($2::uuid[])` : ''}
        order by b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc
      `,
      [authMe.user.societyId, ...(body.flatIds ? [body.flatIds] : [])],
    )

    if (flatsResult.rows.length === 0) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'No active flats found to generate dues for.',
      })
    }

    // Fetch charge configuration
    const chargesResult = await client.query<ChargeConfig>(
      `
        select billing_period_id::text, scope::text, flat_type, flat_id, charge_name, amount::text, calculation_method::text, rate_per_sq_ft::text, charge_breakdown
        from maintenance_charges
        where society_id = $1
          and is_active = true
          and (billing_period_id is null or billing_period_id = $2)
        order by scope, flat_type
      `,
      [authMe.user.societyId, body.billingPeriodId],
    )

    const defaultCharges: ChargeBreakdownItem[] = []
    const flatTypeCharges = new Map<string, ChargeBreakdownItem[]>()
    const flatOverrideCharges = new Map<string, ChargeBreakdownItem[]>()
    const periodDefaultCharges: ChargeBreakdownItem[] = []
    const periodFlatTypeCharges = new Map<string, ChargeBreakdownItem[]>()
    const periodFlatCharges = new Map<string, ChargeBreakdownItem[]>()

    for (const c of chargesResult.rows) {
      const fallbackRate = c.rate_per_sq_ft ? Number(c.rate_per_sq_ft) : Number(c.amount)
      const items = (Array.isArray(c.charge_breakdown) && c.charge_breakdown.length > 0
        ? c.charge_breakdown
        : [{ label: c.charge_name, amount: Number(c.amount) }]
      ).map((item) => ({
        ...item,
        calculationMethod: c.calculation_method,
        amount: c.calculation_method === 'AREA_RATE' ? fallbackRate : Number(item.amount),
        ...(c.calculation_method === 'AREA_RATE' ? { ratePerSqFt: fallbackRate } : {}),
      }))

      const isPeriodCharge = c.billing_period_id === body.billingPeriodId
      if (c.scope === 'SOCIETY_DEFAULT') {
        const target = isPeriodCharge ? periodDefaultCharges : defaultCharges
        target.push(...items)
      } else if (c.scope === 'FLAT_TYPE' && c.flat_type) {
        appendChargeLookup(
          isPeriodCharge ? periodFlatTypeCharges : flatTypeCharges,
          c.flat_type,
          items,
        )
      } else if (c.scope === 'FLAT' && c.flat_id) {
        appendChargeLookup(
          isPeriodCharge ? periodFlatCharges : flatOverrideCharges,
          c.flat_id,
          items,
        )
      }
    }

    const flatOrder = new Map(flatsResult.rows.map((flat, index) => [flat.flatId, index]))
    const existingResult = await client.query<ExistingDueRow>(
      `
        select id, flat_id
        from maintenance_dues
        where billing_period_id = $1
          and flat_id = any($2::uuid[])
      `,
      [body.billingPeriodId, flatsResult.rows.map((flat) => flat.flatId)],
    )
    const isCamPeriod = period.charge_type === 'CAM'
    const advanceCoverageResult = isCamPeriod
      ? await client.query<{ flat_id: string; covered_from: string; covered_until: string }>(
          `
            select flat_id, covered_from::text, covered_until::text
            from cam_advance_coverages
            where society_id = $1
              and flat_id = any($2::uuid[])
              and is_active = true
              and covered_until >= $3::date
              and covered_from <= $4::date
            order by flat_id, covered_from asc, covered_until asc
          `,
          [
            authMe.user.societyId,
            flatsResult.rows.map((flat) => flat.flatId),
            period.start_date,
            period.end_date,
          ],
        )
      : { rows: [] }
    const existingByFlatId = new Map(existingResult.rows.map((row) => [row.flat_id, row.id]))
    const advanceCoverageByFlatId = new Map<string, CamAdvanceCoverageRange[]>()
    for (const row of advanceCoverageResult.rows) {
      const coverages = advanceCoverageByFlatId.get(row.flat_id) ?? []
      coverages.push({
        coveredFrom: row.covered_from,
        coveredUntil: row.covered_until,
      })
      advanceCoverageByFlatId.set(row.flat_id, coverages)
    }
    const advanceCoverageSummaryByFlatId = new Map(
      flatsResult.rows
        .map((flat) => {
          const coverages = advanceCoverageByFlatId.get(flat.flatId) ?? []
          if (coverages.length === 0) {
            return null
          }
          return [
            flat.flatId,
            summarizeCamAdvanceCoverage(period.start_date, period.end_date, coverages),
          ] as const
        })
        .filter((entry): entry is readonly [string, ReturnType<typeof summarizeCamAdvanceCoverage>] =>
          Boolean(entry),
        ),
    )
    const overlappingCamResult = isCamPeriod
      ? await client.query<OverlappingCamDueRow>(
          `
            select distinct on (md.flat_id)
              md.id,
              md.flat_id,
              bp.label as billing_period_label
            from maintenance_dues md
            inner join billing_periods bp on bp.id = md.billing_period_id
            where md.society_id = $1
              and md.flat_id = any($2::uuid[])
              and md.billing_period_id <> $3
              and bp.charge_type = 'CAM'
              and md.status <> 'CANCELLED'
              and daterange(bp.start_date, bp.end_date, '[]') && daterange($4::date, $5::date, '[]')
            order by md.flat_id, bp.start_date asc, md.created_at asc
          `,
          [
            authMe.user.societyId,
            flatsResult.rows.map((flat) => flat.flatId),
            body.billingPeriodId,
            period.start_date,
            period.end_date,
          ],
        )
      : { rows: [] }
    const overlappingCamByFlatId = new Map(overlappingCamResult.rows.map((row) => [row.flat_id, row]))
    const insertPayload: DueInsertPayload[] = []

    // Generate dues
    let advanceAppliedCount = 0
    let advanceAppliedAmount = 0
    let advanceCoveredCount = 0
    let advanceProratedCount = 0
    let advanceProratedAmount = 0
    let overlapSkippedCount = 0

    for (const flat of flatsResult.rows) {
      if (overlappingCamByFlatId.has(flat.flatId)) {
        overlapSkippedCount += 1
        continue
      }

      if (existingByFlatId.has(flat.flatId)) {
        continue
      }

      const coverageSummary = advanceCoverageSummaryByFlatId.get(flat.flatId)
      const flatAreaSqFt = flat.areaSqFt ? Number(flat.areaSqFt) : null
      const baseBreakdown = resolveChargeBreakdown(
        defaultCharges,
        flatTypeCharges,
        flatOverrideCharges,
        flat.unitType,
        flat.flatId,
        flatAreaSqFt,
        { cycleMultiplier },
      )
      const periodBreakdown = resolveChargeBreakdown(
        periodDefaultCharges,
        periodFlatTypeCharges,
        periodFlatCharges,
        flat.unitType,
        flat.flatId,
        flatAreaSqFt,
        { cycleMultiplier },
      )
      let breakdown = [
        ...removeChargesOverriddenByPeriod(baseBreakdown, periodBreakdown),
        ...periodBreakdown,
      ]

      if (breakdown.length === 0) {
        // No charges configured — create a default entry
        const defaultAmount = 2000 // fallback
        breakdown = [{
          label: 'Maintenance Charges',
          amount: defaultAmount,
          ...(isCamPeriod ? { chargeType: 'CAM' as const } : {}),
        }]
      }

      const originalBase = roundMoney(breakdown.reduce((sum, item) => sum + item.amount, 0))
      const adjustedBreakdown = isCamPeriod && coverageSummary?.coveredMonths
        ? applyCamAdvanceCoverageToChargeBreakdown(breakdown, coverageSummary, {
            flatAreaSqFt,
            treatUnclassifiedChargesAsCam: true,
          })
        : breakdown
      const totalBase = roundMoney(adjustedBreakdown.reduce((sum, item) => sum + item.amount, 0))
      const advanceReduction = roundMoney(originalBase - totalBase)

      if (adjustedBreakdown.length === 0 || totalBase <= 0) {
        if (coverageSummary?.isFullyCovered || advanceReduction > 0) {
          advanceCoveredCount += 1
        }
        continue
      }

      if (advanceReduction > 0) {
        advanceProratedCount += 1
        advanceProratedAmount = roundMoney(advanceProratedAmount + advanceReduction)
      }

      if (hasUnresolvedAreaRateCharge(adjustedBreakdown)) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `${flat.blockName} ${flat.flatNumber} is missing area, so area-based CAM cannot be generated.`,
        })
      }

      const lateFee = 0
      const totalAmount = roundMoney(totalBase + lateFee)

      insertPayload.push({
        flatId: flat.flatId,
        baseAmount: totalBase,
        totalAmount,
        chargeBreakdown: adjustedBreakdown,
      })
    }

    const insertResult = insertPayload.length
        ? await client.query<{ id: string; flat_id: string }>(
            `
            insert into maintenance_dues (
              society_id, billing_period_id, flat_id, due_date, generated_at,
              base_amount, late_fee_amount, waived_amount, paid_amount,
              total_amount, balance_amount, status, charge_breakdown
            )
            select
              $1,
              $2,
              payload.flat_id,
              $3::date,
              $4::date,
              payload.base_amount,
              0,
              0,
              0,
              payload.total_amount,
              payload.total_amount,
              'OPEN',
              payload.charge_breakdown
            from jsonb_to_recordset($5::jsonb) as payload(
              flat_id uuid,
              base_amount numeric,
              total_amount numeric,
              charge_breakdown jsonb
            )
            on conflict (billing_period_id, flat_id) do nothing
            returning id, flat_id
          `,
          [
            authMe.user.societyId,
            body.billingPeriodId,
            periodDueDate,
            generatedAtDate,
            JSON.stringify(insertPayload.map((payload) => ({
              flat_id: payload.flatId,
              base_amount: payload.baseAmount,
              total_amount: payload.totalAmount,
              charge_breakdown: payload.chargeBreakdown,
            }))),
          ],
        )
      : { rows: [] }

    const generatedDues = insertResult.rows
      .map((row) => ({
        dueId: row.id,
        flatId: row.flat_id,
      }))
      .sort((a, b) => (flatOrder.get(a.flatId) ?? 0) - (flatOrder.get(b.flatId) ?? 0))
    const generatedDueIds = generatedDues.map((due) => due.dueId)
    const generatedFlatIds = new Set(generatedDues.map((due) => due.flatId))
    const racedFlatIds = insertPayload
      .map((payload) => payload.flatId)
      .filter((flatId) => !generatedFlatIds.has(flatId))

    if (racedFlatIds.length > 0) {
      const racedResult = await client.query<ExistingDueRow>(
        `
          select id, flat_id
          from maintenance_dues
          where billing_period_id = $1
            and flat_id = any($2::uuid[])
        `,
        [body.billingPeriodId, racedFlatIds],
      )

      for (const row of racedResult.rows) {
        existingByFlatId.set(row.flat_id, row.id)
      }
    }

    const skippedDues = flatsResult.rows
      .map((flat) => {
        if (
          advanceCoverageSummaryByFlatId.get(flat.flatId)?.isFullyCovered ||
          overlappingCamByFlatId.has(flat.flatId)
        ) {
          return null
        }
        const dueId = existingByFlatId.get(flat.flatId)
        return dueId ? { dueId, flatId: flat.flatId } : null
      })
      .filter((due): due is { dueId: string; flatId: string } => Boolean(due))
    const generated = generatedDues.length
    const skipped = skippedDues.length + advanceCoveredCount + overlapSkippedCount

    if (generatedDues.length > 0) {
      const advanceCreditResult = await client.query<{ flat_id: string }>(
        `
          select distinct flat_id
          from resident_advance_credits
          where society_id = $1
            and flat_id = any($2::uuid[])
            and status = 'ACTIVE'
            and current_balance > 0
        `,
        [authMe.user.societyId, generatedDues.map((due) => due.flatId)],
      )
      const flatIdsWithAdvanceCredit = new Set(advanceCreditResult.rows.map((row) => row.flat_id))

      for (const due of generatedDues) {
        if (!flatIdsWithAdvanceCredit.has(due.flatId)) {
          continue
        }

        const advanceResult = await consumeAdvanceCreditsForDueWithClient(client, due.dueId)
        if (advanceResult.consumedAmount > 0) {
          advanceAppliedCount += 1
          advanceAppliedAmount = roundMoney(advanceAppliedAmount + advanceResult.consumedAmount)
        }
      }
    }

    if (generated > 0) {
      const queued = await enqueueDueBillingContactNotifications(client, {
        societyId: authMe.user.societyId,
        dueIds: generatedDueIds,
        eventKey: 'maintenance_due.created',
        title: 'Maintenance due generated',
        bodyPrefix: 'A new maintenance due has been generated for',
        triggeredByUserId: authMe.user.id,
      })

      await writeMasterAudit({
        client,
        event,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'CREATED',
        eventKey: 'maintenance_dues.generated',
        metadata: {
          billingPeriodId: body.billingPeriodId,
          cycleMultiplier,
          cycleLabel,
          generatedCount: generated,
          skippedCount: skipped,
          advanceCoveredCount,
          advanceProratedCount,
          advanceProratedAmount,
          overlapSkippedCount,
          advanceAppliedCount,
          advanceAppliedAmount,
          flatIds: body.flatIds,
          notificationEventCount: queued.eventCount,
          notificationAudienceCount: queued.audienceCount,
          notificationJobCount: queued.jobCount,
        },
        relatedEntities: [
          { entityTable: 'billing_periods', entityId: body.billingPeriodId, entityLabel: period.label },
        ],
      })
    }

    await client.query('commit')
    return createApiSuccess(event, {
      generated,
      skipped,
      advanceCoveredCount,
      advanceProratedCount,
      advanceProratedAmount,
      overlapSkippedCount,
      advanceAppliedCount,
      advanceAppliedAmount,
      dueIds: generatedDueIds,
      generatedDues,
      skippedDues,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
