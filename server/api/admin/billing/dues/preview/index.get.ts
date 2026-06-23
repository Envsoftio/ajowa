import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  appendChargeLookup,
  getBillingCycleLabel,
  getBillingCycleMultiplier,
  hasUnresolvedAreaRateCharge,
  removeChargesOverriddenByPeriod,
  resolveChargeBreakdown,
} from '~/server/utils/billing'
import type { ChargeBreakdownItem, DueGenerationPreview } from '~/types/domain'
import { AppError } from '~/server/utils/errors'
import { getQuerySafe } from '~/server/utils/master-data'

type FlatTarget = {
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
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

const flatNumberSortExpression =
  "coalesce(nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer, 2147483647)"

const previewQuerySchema = z.object({
  billingPeriodId: z.string().uuid(),
  flatIds: z.string().trim().optional(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = validateInput(previewQuerySchema, getQuerySafe(event))
  const flatIds = query.flatIds
    ?.split(',')
    .map((item) => item.trim())
    .filter(Boolean)

  if (flatIds?.some((id) => !z.string().uuid().safeParse(id).success)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'One or more flat identifiers are invalid.',
    })
  }

  const pool = getDatabasePool()
  const periodResult = await pool.query<{
    id: string
    label: string
    frequency: string
    start_date: string
    end_date: string
    due_date: string
    charge_type: string
    is_locked: boolean
  }>(
    `
      select id, label, frequency::text, start_date::text, end_date::text, due_date::text, charge_type::text, is_locked
      from billing_periods
      where id = $1 and society_id = $2
      limit 1
    `,
    [query.billingPeriodId, authMe.user.societyId],
  )

  const period = periodResult.rows[0]
  if (!period) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Billing period not found.',
    })
  }
  const cycleMultiplier = getBillingCycleMultiplier(period)
  const cycleLabel = getBillingCycleLabel(cycleMultiplier)

  const flatValues: unknown[] = [authMe.user.societyId]
  if (flatIds?.length) {
    flatValues.push(flatIds)
  }

  const [flatsResult, chargesResult, existingResult] = await Promise.all([
    pool.query<FlatTarget>(
      `
        select
          f.id as "flatId",
          f.flat_number as "flatNumber",
          b.name as "blockName",
          f.unit_type as "unitType",
          f.area_sq_ft::text as "areaSqFt",
          f.cam_advance_paid_until::text as "camAdvancePaidUntil"
        from flats f
        inner join blocks b on b.id = f.block_id
        where f.society_id = $1
          and f.is_active = true
          ${flatIds?.length ? 'and f.id = any($2::uuid[])' : ''}
        order by b.sort_order asc, ${flatNumberSortExpression} asc, f.flat_number asc
      `,
      flatValues,
    ),
    pool.query<ChargeConfig>(
      `
        select billing_period_id::text, scope::text, flat_type, flat_id, charge_name, amount::text, calculation_method::text, rate_per_sq_ft::text, charge_breakdown
        from maintenance_charges
        where society_id = $1
          and is_active = true
          and (billing_period_id is null or billing_period_id = $2)
        order by scope, flat_type
      `,
      [authMe.user.societyId, query.billingPeriodId],
    ),
    pool.query<{ flat_id: string }>(
      `
        select flat_id
        from maintenance_dues
        where society_id = $1 and billing_period_id = $2
      `,
      [authMe.user.societyId, query.billingPeriodId],
    ),
  ])

  const existingFlatIds = new Set(existingResult.rows.map((row) => row.flat_id))
  const isCamPeriod = period.charge_type === 'CAM'
  const advanceCoverageResult = isCamPeriod && flatsResult.rows.length
    ? await pool.query<{ flat_id: string }>(
        `
          select distinct flat_id
          from cam_advance_coverages
          where society_id = $1
            and flat_id = any($2::uuid[])
            and is_active = true
            and covered_from <= $3::date
            and covered_until >= $4::date
        `,
        [
          authMe.user.societyId,
          flatsResult.rows.map((flat) => flat.flatId),
          period.start_date,
          period.end_date,
        ],
      )
    : { rows: [] }
  const advanceCoveredFlatIds = new Set(advanceCoverageResult.rows.map((row) => row.flat_id))
  const overlappingCamResult = isCamPeriod && flatsResult.rows.length
    ? await pool.query<{ flat_id: string }>(
        `
          select distinct md.flat_id
          from maintenance_dues md
          inner join billing_periods bp on bp.id = md.billing_period_id
          where md.society_id = $1
            and md.flat_id = any($2::uuid[])
            and md.billing_period_id <> $3
            and bp.charge_type = 'CAM'
            and md.status <> 'CANCELLED'
            and daterange(bp.start_date, bp.end_date, '[]') && daterange($4::date, $5::date, '[]')
        `,
        [
          authMe.user.societyId,
          flatsResult.rows.map((flat) => flat.flatId),
          period.id,
          period.start_date,
          period.end_date,
        ],
      )
    : { rows: [] }
  const overlappingCamFlatIds = new Set(overlappingCamResult.rows.map((row) => row.flat_id))
  const defaultCharges: ChargeBreakdownItem[] = []
  const flatTypeCharges = new Map<string, ChargeBreakdownItem[]>()
  const flatOverrideCharges = new Map<string, ChargeBreakdownItem[]>()
  const periodDefaultCharges: ChargeBreakdownItem[] = []
  const periodFlatTypeCharges = new Map<string, ChargeBreakdownItem[]>()
  const periodFlatCharges = new Map<string, ChargeBreakdownItem[]>()

  for (const charge of chargesResult.rows) {
    const fallbackRate = charge.rate_per_sq_ft ? Number(charge.rate_per_sq_ft) : Number(charge.amount)
    const items = (Array.isArray(charge.charge_breakdown) && charge.charge_breakdown.length > 0
      ? charge.charge_breakdown
      : [{ label: charge.charge_name, amount: Number(charge.amount) }]
    ).map((item) => ({
      ...item,
      calculationMethod: charge.calculation_method,
      amount: charge.calculation_method === 'AREA_RATE' ? fallbackRate : Number(item.amount),
      ...(charge.calculation_method === 'AREA_RATE' ? { ratePerSqFt: fallbackRate } : {}),
    }))

    const isPeriodCharge = charge.billing_period_id === period.id
    if (charge.scope === 'SOCIETY_DEFAULT') {
      const target = isPeriodCharge ? periodDefaultCharges : defaultCharges
      target.push(...items)
    } else if (charge.scope === 'FLAT_TYPE' && charge.flat_type) {
      appendChargeLookup(
        isPeriodCharge ? periodFlatTypeCharges : flatTypeCharges,
        charge.flat_type,
        items,
      )
    } else if (charge.scope === 'FLAT' && charge.flat_id) {
      appendChargeLookup(
        isPeriodCharge ? periodFlatCharges : flatOverrideCharges,
        charge.flat_id,
        items,
      )
    }
  }

  const breakdownMap = new Map<
    string,
    { flatType: string; flatCount: number; totalAmount: number; chargeTemplate: ChargeBreakdownItem[] }
  >()
  const warnings: string[] = []
  let totalAmount = 0
  let skippedExisting = 0
  let skippedAdvanceCovered = 0
  let skippedOverlappingCam = 0

  for (const flat of flatsResult.rows) {
    if (advanceCoveredFlatIds.has(flat.flatId)) {
      skippedAdvanceCovered += 1
      continue
    }
    if (overlappingCamFlatIds.has(flat.flatId)) {
      skippedOverlappingCam += 1
      continue
    }
    if (existingFlatIds.has(flat.flatId)) {
      skippedExisting += 1
      continue
    }

    const baseCharges = resolveChargeBreakdown(
      defaultCharges,
      flatTypeCharges,
      flatOverrideCharges,
      flat.unitType,
      flat.flatId,
      flat.areaSqFt ? Number(flat.areaSqFt) : null,
      { cycleMultiplier },
    )
    const periodCharges = resolveChargeBreakdown(
      periodDefaultCharges,
      periodFlatTypeCharges,
      periodFlatCharges,
      flat.unitType,
      flat.flatId,
      flat.areaSqFt ? Number(flat.areaSqFt) : null,
      { cycleMultiplier },
    )
    const charges = [
      ...removeChargesOverriddenByPeriod(baseCharges, periodCharges),
      ...periodCharges,
    ]
    const effectiveCharges =
      charges.length > 0 ? charges : [{ label: 'Maintenance Charges', amount: 2000 }]

    if (hasUnresolvedAreaRateCharge(effectiveCharges)) {
      warnings.push(`${flat.blockName} ${flat.flatNumber} is missing area; area-based CAM cannot be generated.`)
    }

    const flatAmount = effectiveCharges.reduce((sum, item) => sum + item.amount, 0)
    const current = breakdownMap.get(flat.unitType)

    if (charges.length === 0) {
      warnings.push(`${flat.blockName} ${flat.flatNumber} has no configured charge; fallback amount will be used.`)
    }

    totalAmount += flatAmount
    if (current) {
      current.flatCount += 1
      current.totalAmount += flatAmount
    } else {
      breakdownMap.set(flat.unitType, {
        flatType: flat.unitType,
        flatCount: 1,
        totalAmount: flatAmount,
        chargeTemplate: effectiveCharges,
      })
    }
  }

  if (period.is_locked) {
    warnings.unshift('This billing period is locked; due generation is blocked.')
  }

  if (skippedExisting > 0) {
    warnings.push(`${skippedExisting} flat${skippedExisting === 1 ? '' : 's'} already have dues for this period and will be skipped.`)
  }
  if (skippedAdvanceCovered > 0) {
    warnings.push(`${skippedAdvanceCovered} CAM advance-paid flat${skippedAdvanceCovered === 1 ? '' : 's'} will be skipped.`)
  }
  if (skippedOverlappingCam > 0) {
    warnings.push(`${skippedOverlappingCam} flat${skippedOverlappingCam === 1 ? '' : 's'} already have overlapping CAM dues and will be skipped.`)
  }

  const preview: DueGenerationPreview & { skippedExisting: number; isLocked: boolean } = {
    billingPeriodId: period.id,
    billingPeriodLabel: period.label,
    billingPeriodDueDate: period.due_date,
    billingPeriodChargeType: period.charge_type as NonNullable<DueGenerationPreview['billingPeriodChargeType']>,
    cycleMultiplier,
    cycleLabel,
    totalFlats: flatsResult.rows.length - skippedExisting - skippedAdvanceCovered - skippedOverlappingCam,
    totalAmount: Math.round(totalAmount * 100) / 100,
    flatTypeBreakdown: Array.from(breakdownMap.values()).map((item) => ({
      ...item,
      totalAmount: Math.round(item.totalAmount * 100) / 100,
    })),
    warnings,
    skippedExisting,
    skippedAdvanceCovered,
    skippedOverlappingCam,
    isLocked: period.is_locked,
  }

  return createApiSuccess(event, preview)
})
