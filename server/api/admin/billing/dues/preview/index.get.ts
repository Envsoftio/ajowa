import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { hasUnresolvedAreaRateCharge, resolveChargeBreakdown } from '~/server/utils/billing'
import type { ChargeBreakdownItem, DueGenerationPreview } from '~/types/domain'
import { AppError } from '~/server/utils/errors'
import { getQuerySafe } from '~/server/utils/master-data'

type FlatTarget = {
  flatId: string
  flatNumber: string
  blockName: string
  unitType: string
  areaSqFt: string | null
}

type ChargeConfig = {
  scope: string
  flat_type: string | null
  flat_id: string | null
  charge_name: string
  amount: string
  calculation_method: 'FIXED' | 'AREA_RATE'
  rate_per_sq_ft: string | null
  charge_breakdown: ChargeBreakdownItem[]
}

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
    due_date: string
    is_locked: boolean
  }>(
    `
      select id, label, due_date::text, is_locked
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
          f.area_sq_ft::text as "areaSqFt"
        from flats f
        inner join blocks b on b.id = f.block_id
        where f.society_id = $1
          and f.is_active = true
          ${flatIds?.length ? 'and f.id = any($2::uuid[])' : ''}
        order by b.name, f.flat_number
      `,
      flatValues,
    ),
    pool.query<ChargeConfig>(
      `
        select scope::text, flat_type, flat_id, charge_name, amount::text, calculation_method::text, rate_per_sq_ft::text, charge_breakdown
        from maintenance_charges
        where society_id = $1 and is_active = true
        order by scope, flat_type
      `,
      [authMe.user.societyId],
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
  const defaultCharges: ChargeBreakdownItem[] = []
  const flatTypeCharges: { flatType: string; charges: ChargeBreakdownItem[] }[] = []
  const flatOverrideCharges: { flatId: string; charges: ChargeBreakdownItem[] }[] = []

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

    if (charge.scope === 'SOCIETY_DEFAULT') {
      defaultCharges.push(...items)
    } else if (charge.scope === 'FLAT_TYPE' && charge.flat_type) {
      flatTypeCharges.push({ flatType: charge.flat_type, charges: items })
    } else if (charge.scope === 'FLAT' && charge.flat_id) {
      flatOverrideCharges.push({ flatId: charge.flat_id, charges: items })
    }
  }

  const breakdownMap = new Map<
    string,
    { flatType: string; flatCount: number; totalAmount: number; chargeTemplate: ChargeBreakdownItem[] }
  >()
  const warnings: string[] = []
  let totalAmount = 0
  let skippedExisting = 0

  for (const flat of flatsResult.rows) {
    if (existingFlatIds.has(flat.flatId)) {
      skippedExisting += 1
      continue
    }

    const charges = resolveChargeBreakdown(
      defaultCharges,
      flatTypeCharges,
      flatOverrideCharges,
      flat.unitType,
      flat.flatId,
      flat.areaSqFt ? Number(flat.areaSqFt) : null,
    )
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

  const preview: DueGenerationPreview & { skippedExisting: number; isLocked: boolean } = {
    billingPeriodId: period.id,
    billingPeriodLabel: period.label,
    billingPeriodDueDate: period.due_date,
    totalFlats: flatsResult.rows.length - skippedExisting,
    totalAmount: Math.round(totalAmount * 100) / 100,
    flatTypeBreakdown: Array.from(breakdownMap.values()).map((item) => ({
      ...item,
      totalAmount: Math.round(item.totalAmount * 100) / 100,
    })),
    warnings,
    skippedExisting,
    isLocked: period.is_locked,
  }

  return createApiSuccess(event, preview)
})
