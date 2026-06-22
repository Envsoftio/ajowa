import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import {
  appendChargeLookup,
  dueGenerationSchema,
  getBillingCycleLabel,
  getBillingCycleMultiplier,
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

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

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
      is_locked: boolean
      due_date: string
    }>(
      `
        select id, label, frequency::text, start_date::text, end_date::text, is_locked, due_date::text
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
          f.area_sq_ft::text as "areaSqFt"
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

    // Generate dues
    let generated = 0
    let skipped = 0
    let advanceAppliedCount = 0
    let advanceAppliedAmount = 0
    const generatedDueIds: string[] = []
    const generatedDues: Array<{ dueId: string; flatId: string }> = []
    const skippedDues: Array<{ dueId: string; flatId: string }> = []

    for (const flat of flatsResult.rows) {
      // Check if due already exists for this flat + period
      const existingDue = await client.query<{ id: string }>(
        `select id from maintenance_dues where billing_period_id = $1 and flat_id = $2 limit 1`,
        [body.billingPeriodId, flat.flatId],
      )

      if (existingDue.rows[0]) {
        skippedDues.push({
          dueId: existingDue.rows[0].id,
          flatId: flat.flatId,
        })
        skipped++
        continue
      }

      const baseBreakdown = resolveChargeBreakdown(
        defaultCharges,
        flatTypeCharges,
        flatOverrideCharges,
        flat.unitType,
        flat.flatId,
        flat.areaSqFt ? Number(flat.areaSqFt) : null,
        { cycleMultiplier },
      )
      const periodBreakdown = resolveChargeBreakdown(
        periodDefaultCharges,
        periodFlatTypeCharges,
        periodFlatCharges,
        flat.unitType,
        flat.flatId,
        flat.areaSqFt ? Number(flat.areaSqFt) : null,
        { cycleMultiplier },
      )
      const breakdown = [
        ...removeChargesOverriddenByPeriod(baseBreakdown, periodBreakdown),
        ...periodBreakdown,
      ]

      if (breakdown.length === 0) {
        // No charges configured — create a default entry
        const defaultAmount = 2000 // fallback
        const insertResult = await client.query<{ id: string }>(
          `
            insert into maintenance_dues (
              society_id, billing_period_id, flat_id, due_date,
              base_amount, late_fee_amount, waived_amount, paid_amount,
              total_amount, balance_amount, status, charge_breakdown
            )
            values ($1, $2, $3, $4, $5, 0, 0, 0, $5, $5, 'OPEN', $6)
            returning id
          `,
          [
            authMe.user.societyId,
            body.billingPeriodId,
            flat.flatId,
            periodDueDate,
            defaultAmount,
            JSON.stringify([{ label: 'Maintenance Charges', amount: defaultAmount }]),
          ],
        )
        if (insertResult.rows[0]?.id) {
          generatedDueIds.push(insertResult.rows[0].id)
          generatedDues.push({
            dueId: insertResult.rows[0].id,
            flatId: flat.flatId,
          })
          const advanceResult = await consumeAdvanceCreditsForDueWithClient(client, insertResult.rows[0].id)
          if (advanceResult.consumedAmount > 0) {
            advanceAppliedCount += 1
            advanceAppliedAmount = Math.round((advanceAppliedAmount + advanceResult.consumedAmount) * 100) / 100
          }
        }
      } else {
        if (hasUnresolvedAreaRateCharge(breakdown)) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message: `${flat.blockName} ${flat.flatNumber} is missing area, so area-based CAM cannot be generated.`,
          })
        }

        const totalBase = breakdown.reduce((sum, item) => sum + item.amount, 0)
        const lateFee = 0
        const totalAmount = Math.round((totalBase + lateFee) * 100) / 100

        const insertResult = await client.query<{ id: string }>(
          `
            insert into maintenance_dues (
              society_id, billing_period_id, flat_id, due_date,
              base_amount, late_fee_amount, waived_amount, paid_amount,
              total_amount, balance_amount, status, charge_breakdown
            )
            values ($1, $2, $3, $4, $5, $6, 0, 0, $7, $7, 'OPEN', $8)
            returning id
          `,
          [
            authMe.user.societyId,
            body.billingPeriodId,
            flat.flatId,
            periodDueDate,
            totalBase,
            lateFee,
            totalAmount,
            JSON.stringify(breakdown),
          ],
        )
        if (insertResult.rows[0]?.id) {
          generatedDueIds.push(insertResult.rows[0].id)
          generatedDues.push({
            dueId: insertResult.rows[0].id,
            flatId: flat.flatId,
          })
          const advanceResult = await consumeAdvanceCreditsForDueWithClient(client, insertResult.rows[0].id)
          if (advanceResult.consumedAmount > 0) {
            advanceAppliedCount += 1
            advanceAppliedAmount = Math.round((advanceAppliedAmount + advanceResult.consumedAmount) * 100) / 100
          }
        }
      }

      generated++
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
