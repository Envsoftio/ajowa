import { z } from 'zod'
import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  readUuidParam,
  validatePayload,
  writeMasterAudit,
} from '~/server/utils/master-data'
import { AppError } from '~/server/utils/errors'
import type { ChargeBreakdownItem } from '~/types/domain'

const variableChargesSchema = z.object({
  chargeName: z.string().trim().min(1).max(80).default('DG Set'),
  chargeType: z.enum(['CAM', 'DG_SET', 'OTHER']).optional(),
  chargeLabel: z.string().trim().min(1).max(200).optional(),
  source: z.string().trim().min(1).max(80).optional(),
  electricityType: z.string().trim().max(80).nullable().optional(),
  entries: z.array(
    z.object({
      flatId: z.string().uuid(),
      areaSqFt: z.coerce.number().min(0).nullable().optional(),
      ratePerSqFt: z.coerce.number().min(0).nullable().optional(),
      meterNo: z.string().trim().max(80).nullable().optional(),
      openingReading: z.coerce.number().min(0).nullable().optional(),
      closingReading: z.coerce.number().min(0).nullable().optional(),
      consumedUnits: z.coerce.number().min(0).nullable().optional(),
      ratePerUnit: z.coerce.number().min(0).nullable().optional(),
      connectionLoad: z.string().trim().max(80).nullable().optional(),
      previousOutstanding: z.coerce.number().min(0).nullable().optional(),
      interestAmount: z.coerce.number().min(0).nullable().optional(),
      cycleMultiplier: z.coerce.number().min(1).max(120).nullable().optional(),
      cycleLabel: z.string().trim().max(80).nullable().optional(),
      amount: z.coerce.number().min(0).nullable().optional(),
    }),
  ),
})

type VariableChargesInput = z.infer<typeof variableChargesSchema>

type NormalizedVariableChargeEntry = {
  flatId: string
  areaSqFt: number | null
  ratePerSqFt: number | null
  meterNo: string | null
  openingReading: number | null
  closingReading: number | null
  consumedUnits: number | null
  ratePerUnit: number | null
  connectionLoad: string | null
  previousOutstanding: number
  interestAmount: number
  cycleMultiplier: number | null
  cycleLabel: string | null
  amount: number
}

type PreviousChargeSummary = {
  charge_count: string
  total_amount: string | null
}

type VariableChargeConfig = {
  chargeType: NonNullable<ChargeBreakdownItem['chargeType']>
  chargeLabel: string
  source: string
  electricityType: string | null
}

const roundVariableChargeMoney = (value: number) =>
  Math.round(value * 100) / 100
const roundAreaRateChargeAmount = (
  areaSqFt: number,
  ratePerSqFt: number,
  cycleMultiplier = 1,
) => Math.ceil(areaSqFt * ratePerSqFt) * Math.max(1, cycleMultiplier)

const normalizeOptionalText = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized || null
}

const normalizeOptionalNumber = (value: number | null | undefined) => {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const inferVariableChargeType = (
  body: Pick<VariableChargesInput, 'chargeName' | 'chargeType'>,
): NonNullable<ChargeBreakdownItem['chargeType']> => {
  if (body.chargeType) return body.chargeType
  if (/^cam(?:\s+charges?)?$/i.test(body.chargeName.trim())) return 'CAM'
  if (
    /\b(dg\s*set|dgset|generator|power\s*back\s*up|power\s*backup)\b/i.test(
      body.chargeName,
    )
  ) {
    return 'DG_SET'
  }

  return 'OTHER'
}

const buildVariableChargeConfig = (
  body: VariableChargesInput,
): VariableChargeConfig => {
  const chargeType = inferVariableChargeType(body)

  return {
    chargeType,
    chargeLabel:
      body.chargeLabel?.trim() ??
      (chargeType === 'DG_SET' ? 'Power Back Up Charges' : body.chargeName),
    source:
      body.source?.trim() ??
      (chargeType === 'DG_SET'
        ? 'MONTHLY_DG_METER_CHARGE'
        : chargeType === 'CAM'
          ? 'CYCLE_CAM_FLAT_CHARGE'
          : 'CYCLE_VARIABLE_FLAT_CHARGE'),
    electricityType:
      normalizeOptionalText(body.electricityType) ??
      (chargeType === 'DG_SET' ? 'POWER BACK UP' : null),
  }
}

const normalizeVariableChargeEntry = (
  entry: VariableChargesInput['entries'][number],
  config: VariableChargeConfig,
  chargeName: string,
): NormalizedVariableChargeEntry => {
  const areaSqFt = normalizeOptionalNumber(entry.areaSqFt)
  const ratePerSqFt = normalizeOptionalNumber(entry.ratePerSqFt)
  const openingReading = normalizeOptionalNumber(entry.openingReading)
  const closingReading = normalizeOptionalNumber(entry.closingReading)

  if (
    openingReading != null &&
    closingReading != null &&
    closingReading < openingReading
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: `Closing ${chargeName} reading cannot be less than opening reading.`,
    })
  }

  const consumedUnits =
    openingReading != null && closingReading != null
      ? roundVariableChargeMoney(closingReading - openingReading)
      : normalizeOptionalNumber(entry.consumedUnits)
  const ratePerUnit = normalizeOptionalNumber(entry.ratePerUnit)
  const cycleMultiplier = normalizeOptionalNumber(entry.cycleMultiplier)
  const computedAmount =
    config.chargeType === 'CAM' &&
    areaSqFt != null &&
    areaSqFt > 0 &&
    ratePerSqFt != null
      ? roundAreaRateChargeAmount(areaSqFt, ratePerSqFt, cycleMultiplier ?? 1)
      : consumedUnits != null && ratePerUnit != null
        ? consumedUnits * ratePerUnit
        : (normalizeOptionalNumber(entry.amount) ?? 0)

  return {
    flatId: entry.flatId,
    areaSqFt,
    ratePerSqFt,
    meterNo: normalizeOptionalText(entry.meterNo),
    openingReading,
    closingReading,
    consumedUnits,
    ratePerUnit,
    connectionLoad: normalizeOptionalText(entry.connectionLoad),
    previousOutstanding: roundVariableChargeMoney(
      Number(entry.previousOutstanding ?? 0),
    ),
    interestAmount: roundVariableChargeMoney(Number(entry.interestAmount ?? 0)),
    cycleMultiplier,
    cycleLabel: normalizeOptionalText(entry.cycleLabel),
    amount: roundVariableChargeMoney(Math.max(0, computedAmount)),
  }
}

const buildVariableChargeBreakdown = (
  entry: NormalizedVariableChargeEntry,
  config: VariableChargeConfig,
): ChargeBreakdownItem[] => {
  const isAreaRateCam = config.chargeType === 'CAM' && entry.ratePerSqFt != null
  const item: ChargeBreakdownItem = {
    label: config.chargeLabel,
    amount: entry.amount,
    chargeType: config.chargeType,
    calculationMethod: isAreaRateCam ? 'AREA_RATE' : 'FIXED',
    source: config.source,
    meterNo: entry.meterNo,
    openingReading: entry.openingReading,
    closingReading: entry.closingReading,
    consumedUnits: entry.consumedUnits,
    ratePerUnit: entry.ratePerUnit,
    tariffRateLabel:
      entry.ratePerUnit != null ? `Rs.${entry.ratePerUnit}/Unit` : null,
    connectionLoad:
      entry.connectionLoad ??
      (config.chargeType === 'DG_SET' ? '4 KW (5KVA)' : null),
    state: config.chargeType === 'DG_SET' ? 'PUNJAB' : null,
    stateCode: config.chargeType === 'DG_SET' ? '03' : null,
    previousOutstanding: entry.previousOutstanding,
    interestAmount: entry.interestAmount,
  }

  if (isAreaRateCam && entry.ratePerSqFt != null) {
    item.ratePerSqFt = entry.ratePerSqFt
    if (entry.areaSqFt != null) {
      item.areaSqFt = entry.areaSqFt
    }
    item.tariffRateLabel = `Rs.${entry.ratePerSqFt}/sq ft/month`
  }

  if (entry.cycleMultiplier != null) {
    item.cycleMultiplier = entry.cycleMultiplier
    item.cycleLabel =
      entry.cycleLabel ??
      `${entry.cycleMultiplier} ${entry.cycleMultiplier === 1 ? 'month' : 'months'}`
  }

  if (config.electricityType) {
    item.electricityType = config.electricityType
  }

  return [item]
}

const hasVariableChargeData = (entry: NormalizedVariableChargeEntry) =>
  entry.amount > 0 ||
  entry.areaSqFt != null ||
  entry.ratePerSqFt != null ||
  entry.meterNo != null ||
  entry.openingReading != null ||
  entry.closingReading != null ||
  entry.consumedUnits != null ||
  entry.previousOutstanding > 0 ||
  entry.interestAmount > 0

const shouldPersistVariableCharge = (
  entry: NormalizedVariableChargeEntry,
  config: VariableChargeConfig,
) =>
  entry.amount > 0 ||
  (config.chargeType === 'DG_SET' && hasVariableChargeData(entry))

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const periodId = readUuidParam(event, 'id')
  const body = validatePayload<VariableChargesInput>(
    variableChargesSchema,
    await readJsonBody(event),
  )
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const periodResult = await client.query<{
      id: string
      label: string
      is_locked: boolean
    }>(
      `
        select id, label, is_locked
        from billing_periods
        where id = $1 and society_id = $2
        limit 1
      `,
      [periodId, authMe.user.societyId],
    )

    const period = periodResult.rows[0]
    if (!period) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Bill cycle not found.',
      })
    }

    if (period.is_locked) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Locked bill cycles cannot be edited.',
      })
    }

    const chargeConfig = buildVariableChargeConfig(body)
    const normalizedEntries = body.entries.map((entry) =>
      normalizeVariableChargeEntry(entry, chargeConfig, body.chargeName),
    )
    const flatIds = normalizedEntries.map((entry) => entry.flatId)
    const validFlats = flatIds.length
      ? await client.query<{ id: string }>(
          `
            select id
            from flats
            where society_id = $1
              and is_active = true
              and id = any($2::uuid[])
          `,
          [authMe.user.societyId, flatIds],
        )
      : { rows: [] }
    const validFlatIds = new Set(validFlats.rows.map((flat) => flat.id))
    const invalidFlat = flatIds.find((flatId) => !validFlatIds.has(flatId))

    if (invalidFlat) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'One or more flats do not belong to this society.',
      })
    }

    const beforeResult = await client.query<PreviousChargeSummary>(
      `
        select count(*)::text as charge_count, coalesce(sum(amount), 0)::text as total_amount
        from maintenance_charges
        where society_id = $1
          and billing_period_id = $2
          and charge_name = $3
          and is_active = true
      `,
      [authMe.user.societyId, periodId, body.chargeName],
    )
    const previousEntryCount = Number(beforeResult.rows[0]?.charge_count ?? 0)
    const previousTotalAmount = Number(beforeResult.rows[0]?.total_amount ?? 0)

    await client.query(
      `
        delete from maintenance_charges
        where society_id = $1
          and billing_period_id = $2
          and charge_name = $3
          and is_active = true
      `,
      [authMe.user.societyId, periodId, body.chargeName],
    )

    const persistedEntries = normalizedEntries.filter((entry) =>
      shouldPersistVariableCharge(entry, chargeConfig),
    )
    const insertPayload = persistedEntries.map((entry) => ({
      flat_id: entry.flatId,
      amount: entry.amount,
      calculation_method:
        chargeConfig.chargeType === 'CAM' && entry.ratePerSqFt != null
          ? 'AREA_RATE'
          : 'FIXED',
      rate_per_sq_ft:
        chargeConfig.chargeType === 'CAM' && entry.ratePerSqFt != null
          ? entry.ratePerSqFt
          : null,
      charge_breakdown: buildVariableChargeBreakdown(entry, chargeConfig),
    }))

    if (insertPayload.length > 0) {
      await client.query(
        `
          insert into maintenance_charges (
            society_id,
            billing_period_id,
            scope,
            flat_id,
            charge_name,
            amount,
            calculation_method,
            rate_per_sq_ft,
            charge_breakdown,
            is_active
          )
          select
            $1,
            $2,
            'FLAT',
            payload.flat_id,
            $3,
            payload.amount,
            payload.calculation_method::maintenance_charge_calculation_method,
            payload.rate_per_sq_ft,
            payload.charge_breakdown,
            true
          from jsonb_to_recordset($4::jsonb) as payload(
            flat_id uuid,
            amount numeric,
            calculation_method text,
            rate_per_sq_ft numeric,
            charge_breakdown jsonb
          )
        `,
        [
          authMe.user.societyId,
          periodId,
          body.chargeName,
          JSON.stringify(insertPayload),
        ],
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'billing_period_variable_charges.updated',
      beforeState: {
        chargeName: body.chargeName,
        chargeType: chargeConfig.chargeType,
        entryCount: previousEntryCount,
        totalAmount: previousTotalAmount,
      },
      afterState: {
        chargeName: body.chargeName,
        chargeType: chargeConfig.chargeType,
        entryCount: persistedEntries.length,
        totalAmount: persistedEntries.reduce(
          (sum, entry) => sum + entry.amount,
          0,
        ),
      },
      relatedEntities: [
        {
          entityTable: 'billing_periods',
          entityId: periodId,
          entityLabel: period.label,
        },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, {
      saved: persistedEntries.length,
      removed: Math.max(previousEntryCount - persistedEntries.length, 0),
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
