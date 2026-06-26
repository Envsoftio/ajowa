import { AppError } from '~/server/utils/errors'
import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { recomputeUserAccessForPairs } from '~/server/utils/qr-access'
import {
  applyCamAdvanceCoverageToChargeBreakdown,
  appendChargeLookup,
  camDueRecomputeSchema,
  computeDueAmounts,
  getBillingCycleMultiplier,
  hasUnresolvedAreaRateCharge,
  normalizeSocietySettings,
  removeChargesOverriddenByPeriod,
  resolveChargeBreakdown,
  summarizeCamAdvanceCoverage,
  todayDate,
  type CamAdvanceCoverageRange,
  type CamDueRecomputeInput,
  type ChargeBreakdownItem,
} from '~/server/utils/billing'
import { validatePayload, writeMasterAudit } from '~/server/utils/master-data'

type BillingPeriodRow = {
  id: string
  label: string
  frequency: string
  start_date: string
  end_date: string
  charge_type: string
  is_locked: boolean
}

type DueRow = {
  id: string
  flat_id: string
  due_date: string
  unit_type: string
  flat_number: string
  block_name: string
  area_sq_ft: string | null
  base_amount: string
  paid_amount: string
  waived_amount: string
  status: string
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

type DueUpdatePayload = {
  dueId: string
  baseAmount: number
  lateFeeAmount: number
  totalAmount: number
  balanceAmount: number
  status: string
  chargeBreakdown: ChargeBreakdownItem[]
}

type ChargeLookups = {
  defaultCharges: ChargeBreakdownItem[]
  flatTypeCharges: Map<string, ChargeBreakdownItem[]>
  flatOverrideCharges: Map<string, ChargeBreakdownItem[]>
  periodDefaultCharges: ChargeBreakdownItem[]
  periodFlatTypeCharges: Map<string, ChargeBreakdownItem[]>
  periodFlatCharges: Map<string, ChargeBreakdownItem[]>
}

const roundMoney = (value: number) => Math.round(value * 100) / 100

const sumChargeAmount = (items: ChargeBreakdownItem[]) =>
  roundMoney(items.reduce((sum, item) => sum + Number(item.amount ?? 0), 0))

const buildChargeLookups = (
  charges: ChargeConfig[],
  periodId: string,
  periodIsCam: boolean,
): ChargeLookups => {
  const defaultCharges: ChargeBreakdownItem[] = []
  const flatTypeCharges = new Map<string, ChargeBreakdownItem[]>()
  const flatOverrideCharges = new Map<string, ChargeBreakdownItem[]>()
  const periodDefaultCharges: ChargeBreakdownItem[] = []
  const periodFlatTypeCharges = new Map<string, ChargeBreakdownItem[]>()
  const periodFlatCharges = new Map<string, ChargeBreakdownItem[]>()

  for (const charge of charges) {
    const fallbackRate = charge.rate_per_sq_ft ? Number(charge.rate_per_sq_ft) : Number(charge.amount)
    const items = (Array.isArray(charge.charge_breakdown) && charge.charge_breakdown.length > 0
      ? charge.charge_breakdown
      : [{ label: charge.charge_name, amount: Number(charge.amount) }]
    ).map((item) => ({
      ...item,
      calculationMethod: charge.calculation_method,
      amount: charge.calculation_method === 'AREA_RATE' ? fallbackRate : Number(item.amount),
      ...(charge.calculation_method === 'AREA_RATE' ? { ratePerSqFt: fallbackRate } : {}),
      ...(charge.charge_name.match(/^cam(?:\s+charges?)?$/i)
        ? { chargeType: periodIsCam ? 'CAM' : undefined }
        : {}),
    }))

    const isPeriodCharge = charge.billing_period_id === periodId
    if (charge.scope === 'SOCIETY_DEFAULT') {
      const target = isPeriodCharge ? periodDefaultCharges : defaultCharges
      target.push(...items)
    } else if (charge.scope === 'FLAT_TYPE' && charge.flat_type) {
      appendChargeLookup(isPeriodCharge ? periodFlatTypeCharges : flatTypeCharges, charge.flat_type, items)
    } else if (charge.scope === 'FLAT' && charge.flat_id) {
      appendChargeLookup(isPeriodCharge ? periodFlatCharges : flatOverrideCharges, charge.flat_id, items)
    }
  }

  return {
    defaultCharges,
    flatTypeCharges,
    flatOverrideCharges,
    periodDefaultCharges,
    periodFlatTypeCharges,
    periodFlatCharges,
  }
}

const buildCamBreakdownForFlat = (
  due: DueRow,
  lookups: ChargeLookups,
  cycleMultiplier: number,
  coverageSummary: ReturnType<typeof summarizeCamAdvanceCoverage> | undefined,
): { breakdown: ChargeBreakdownItem[]; totalAmount: number } => {
  const flatAreaSqFt = due.area_sq_ft ? Number(due.area_sq_ft) : null
  const baseBreakdown = resolveChargeBreakdown(
    lookups.defaultCharges,
    lookups.flatTypeCharges,
    lookups.flatOverrideCharges,
    due.unit_type,
    due.flat_id,
    flatAreaSqFt,
    { cycleMultiplier },
  )
  const periodBreakdown = resolveChargeBreakdown(
    lookups.periodDefaultCharges,
    lookups.periodFlatTypeCharges,
    lookups.periodFlatCharges,
    due.unit_type,
    due.flat_id,
    flatAreaSqFt,
    { cycleMultiplier },
  )
  const configuredBreakdown = [
    ...removeChargesOverriddenByPeriod(baseBreakdown, periodBreakdown),
    ...periodBreakdown,
  ]
  const resolvedBreakdown =
    configuredBreakdown.length > 0
      ? configuredBreakdown
      : [{
          label: 'Maintenance Charges',
          amount: 2000,
          chargeType: 'CAM',
          calculationMethod: 'FIXED',
        }]
  const hasCoverage = (coverageSummary?.coveredMonths ?? 0) > 0
  const effectiveBreakdown =
    cycleMultiplier > 0 && hasCoverage && coverageSummary
      ? applyCamAdvanceCoverageToChargeBreakdown(
          resolvedBreakdown,
          coverageSummary,
          {
            flatAreaSqFt,
            treatUnclassifiedChargesAsCam: true,
          },
        )
      : resolvedBreakdown

  return {
    breakdown: effectiveBreakdown,
    totalAmount: sumChargeAmount(effectiveBreakdown),
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload<CamDueRecomputeInput>(
    camDueRecomputeSchema,
    await readJsonBody(event),
  )
  const flatIds = body.flatIds ? Array.from(new Set(body.flatIds)) : []
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const periodResult = await client.query<BillingPeriodRow>(
      `
        select id, label, frequency, start_date::text, end_date::text, charge_type::text, is_locked
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

    if (period.charge_type !== 'CAM') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'CAM recomputation endpoint is only valid for CAM billing periods.',
      })
    }

    if (period.is_locked) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Cannot recompute dues for a locked billing period.',
      })
    }

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )
    const settings = normalizeSocietySettings(settingsResult.rows[0]?.settings)

    const flatFilterClause = flatIds.length ? 'and md.flat_id = any($3::uuid[])' : ''
    const dueResult = await client.query<DueRow>(
      `
        select
          md.id,
          md.flat_id,
          md.due_date::text,
          f.unit_type,
          f.flat_number,
          b.name as block_name,
          f.area_sq_ft::text as area_sq_ft,
          md.base_amount::text,
          md.paid_amount::text,
          md.waived_amount::text,
          md.status::text
        from maintenance_dues md
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        where md.society_id = $1
          and md.billing_period_id = $2
          and md.status not in ('PAID', 'WAIVED', 'CANCELLED')
          ${flatFilterClause}
        order by b.sort_order asc, md.flat_id asc
      `,
      flatIds.length ? [authMe.user.societyId, body.billingPeriodId, flatIds] : [authMe.user.societyId, body.billingPeriodId],
    )

    const dueRows = dueResult.rows
    if (dueRows.length === 0) {
      await client.query('commit')
      return createApiSuccess(event, {
        billingPeriodId: period.id,
        billingPeriodLabel: period.label,
        requested: dueRows.length,
        recalculated: 0,
        accessRecomputed: 0,
        accessRevoked: 0,
      })
    }

    const selectedFlatIds = dueRows.map((due) => due.flat_id)
    const chargesResult = await client.query<ChargeConfig>(
      `
        select
          billing_period_id::text,
          scope::text,
          flat_type,
          flat_id,
          charge_name,
          amount::text,
          calculation_method::text,
          rate_per_sq_ft::text,
          charge_breakdown
        from maintenance_charges
        where society_id = $1
          and is_active = true
          and (billing_period_id is null or billing_period_id = $2)
        order by scope, flat_type
      `,
      [authMe.user.societyId, period.id],
    )

    const chargeLookups = buildChargeLookups(chargesResult.rows, period.id, true)
    const cycleMultiplier = getBillingCycleMultiplier(period)
    const coverageResult = await client.query<{ flat_id: string; covered_from: string; covered_until: string }>(
      `
        select flat_id, covered_from::text as covered_from, covered_until::text as covered_until
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
        selectedFlatIds,
        period.start_date,
        period.end_date,
      ],
    )

    const coveragesByFlatId = new Map<string, CamAdvanceCoverageRange[]>()
    for (const coverage of coverageResult.rows) {
      const mapped = coveragesByFlatId.get(coverage.flat_id) ?? []
      mapped.push({ coveredFrom: coverage.covered_from, coveredUntil: coverage.covered_until })
      coveragesByFlatId.set(coverage.flat_id, mapped)
    }
    const coverageSummaryByFlatId = new Map<string, ReturnType<typeof summarizeCamAdvanceCoverage>>()
    for (const due of dueRows) {
      const coverages = coveragesByFlatId.get(due.flat_id)
      if (!coverages?.length) {
        continue
      }
      coverageSummaryByFlatId.set(
        due.flat_id,
        summarizeCamAdvanceCoverage(period.start_date, period.end_date, coverages),
      )
    }

    const today = todayDate()
    const updatePayload: DueUpdatePayload[] = []

    for (const due of dueRows) {
      const coverageSummary = coverageSummaryByFlatId.get(due.flat_id)
      const breakdownResult = buildCamBreakdownForFlat(
        due,
        chargeLookups,
        cycleMultiplier,
        coverageSummary,
      )

      if (hasUnresolvedAreaRateCharge(breakdownResult.breakdown)) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message: `${due.block_name} ${due.flat_number} is missing area, so area-based CAM cannot be recomputed.`,
        })
      }

      const nextBaseAmount = breakdownResult.totalAmount
      const isFullyCovered = nextBaseAmount <= 0
      const paidAmount = Number(due.paid_amount)
      const waivedAmount = Number(due.waived_amount)
      const computed = computeDueAmounts(
        {
          dueDate: due.due_date,
          baseAmount: nextBaseAmount,
          paidAmount,
          waivedAmount,
          storedStatus: due.status,
        },
        today,
        settings.graceDays,
        isFullyCovered ? 0 : settings.lateFeePerDay,
      )

      updatePayload.push({
        dueId: due.id,
        baseAmount: nextBaseAmount,
        lateFeeAmount: computed.lateFeeAmount,
        totalAmount: computed.totalAmount,
        balanceAmount: computed.balanceAmount,
        status: computed.status,
        chargeBreakdown: breakdownResult.breakdown,
      })
    }

    if (updatePayload.length > 0) {
      await client.query(
        `
          update maintenance_dues md
          set
            base_amount = payload.base_amount,
            late_fee_amount = payload.late_fee_amount,
            total_amount = payload.total_amount,
            balance_amount = payload.balance_amount,
            status = payload.status::due_status,
            charge_breakdown = payload.charge_breakdown,
            updated_at = now()
          from jsonb_to_recordset($1::jsonb) as payload(
            due_id uuid,
            base_amount numeric,
            late_fee_amount numeric,
            total_amount numeric,
            balance_amount numeric,
            status text,
            charge_breakdown jsonb
          )
          where md.id = payload.due_id
            and md.society_id = $2
        `,
        [
          JSON.stringify(updatePayload.map((due) => ({
            due_id: due.dueId,
            base_amount: due.baseAmount,
            late_fee_amount: due.lateFeeAmount,
            total_amount: due.totalAmount,
            balance_amount: due.balanceAmount,
            status: due.status,
            charge_breakdown: due.chargeBreakdown,
          }))),
          authMe.user.societyId,
        ],
      )
    }

    const dueIdsToRecomputeAccess = updatePayload.map((due) => due.dueId)
    const affectedUsers = dueIdsToRecomputeAccess.length
      ? await client.query<{ user_id: string; billing_period_id: string }>(
          `
            select distinct fr.user_id, md.billing_period_id
            from maintenance_dues md
            inner join flat_residents fr on fr.flat_id = md.flat_id
            where md.id = any($1::uuid[])
              and md.society_id = $2
              and fr.is_active = true
          `,
          [dueIdsToRecomputeAccess, authMe.user.societyId],
        )
      : { rows: [] as Array<{ user_id: string; billing_period_id: string }> }

    const accessResult = await recomputeUserAccessForPairs(
      client,
      affectedUsers.rows.map((user) => ({
        userId: user.user_id,
        billingPeriodId: user.billing_period_id,
      })),
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'maintenance_due.cam_recomputed',
      beforeState: {
        billingPeriodId: period.id,
        requestedDueCount: dueRows.length,
      },
      afterState: {
        recalculatedDueCount: updatePayload.length,
      },
      metadata: {
        billingPeriodId: period.id,
        billingPeriodLabel: period.label,
        requestedDueCount: dueRows.length,
        recalculatedDueCount: updatePayload.length,
        accessRecomputed: accessResult.recomputed,
        accessRevoked: accessResult.revoked,
      },
      relatedEntities: [{ entityTable: 'billing_periods', entityId: period.id, entityLabel: period.label }],
    })

    await client.query('commit')

    return createApiSuccess(event, {
      billingPeriodId: period.id,
      billingPeriodLabel: period.label,
      requested: dueRows.length,
      recalculated: updatePayload.length,
      accessRecomputed: accessResult.recomputed,
      accessRevoked: accessResult.revoked,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
