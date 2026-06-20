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

const variableChargesSchema = z.object({
  chargeName: z.string().trim().min(1).max(80).default('DG Set'),
  entries: z.array(
    z.object({
      flatId: z.string().uuid(),
      meterNo: z.string().trim().max(80).nullable().optional(),
      openingReading: z.coerce.number().min(0).nullable().optional(),
      closingReading: z.coerce.number().min(0).nullable().optional(),
      consumedUnits: z.coerce.number().min(0).nullable().optional(),
      ratePerUnit: z.coerce.number().min(0).nullable().optional(),
      connectionLoad: z.string().trim().max(80).nullable().optional(),
      previousOutstanding: z.coerce.number().min(0).nullable().optional(),
      interestAmount: z.coerce.number().min(0).nullable().optional(),
      amount: z.coerce.number().min(0).nullable().optional(),
    }),
  ),
})

type VariableChargesInput = z.infer<typeof variableChargesSchema>

type NormalizedVariableChargeEntry = {
  flatId: string
  meterNo: string | null
  openingReading: number | null
  closingReading: number | null
  consumedUnits: number | null
  ratePerUnit: number | null
  connectionLoad: string | null
  previousOutstanding: number
  interestAmount: number
  amount: number
}

const roundVariableChargeMoney = (value: number) => Math.round(value * 100) / 100

const normalizeOptionalText = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized || null
}

const normalizeOptionalNumber = (value: number | null | undefined) => {
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const normalizeVariableChargeEntry = (
  entry: VariableChargesInput['entries'][number],
): NormalizedVariableChargeEntry => {
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
      message: 'Closing DG reading cannot be less than opening reading.',
    })
  }

  const consumedUnits = openingReading != null && closingReading != null
    ? roundVariableChargeMoney(closingReading - openingReading)
    : normalizeOptionalNumber(entry.consumedUnits)
  const ratePerUnit = normalizeOptionalNumber(entry.ratePerUnit)
  const computedAmount = consumedUnits != null && ratePerUnit != null
    ? consumedUnits * ratePerUnit
    : normalizeOptionalNumber(entry.amount) ?? 0

  return {
    flatId: entry.flatId,
    meterNo: normalizeOptionalText(entry.meterNo),
    openingReading,
    closingReading,
    consumedUnits,
    ratePerUnit,
    connectionLoad: normalizeOptionalText(entry.connectionLoad),
    previousOutstanding: roundVariableChargeMoney(Number(entry.previousOutstanding ?? 0)),
    interestAmount: roundVariableChargeMoney(Number(entry.interestAmount ?? 0)),
    amount: roundVariableChargeMoney(Math.max(0, computedAmount)),
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
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

    const normalizedEntries = body.entries.map(normalizeVariableChargeEntry)
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

    const beforeResult = await client.query(
      `
        select flat_id, charge_name, amount::text, charge_breakdown
        from maintenance_charges
        where society_id = $1
          and billing_period_id = $2
          and charge_name = $3
          and is_active = true
        order by flat_id
      `,
      [authMe.user.societyId, periodId, body.chargeName],
    )

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

    const positiveEntries = normalizedEntries.filter((entry) => entry.amount > 0)

    for (const entry of positiveEntries) {
      const breakdown = [
        {
          label: 'Power Back Up Charges',
          amount: entry.amount,
          chargeType: 'DG_SET',
          calculationMethod: 'FIXED',
          source: 'MONTHLY_DG_METER_CHARGE',
          electricityType: 'POWER BACK UP',
          meterNo: entry.meterNo,
          openingReading: entry.openingReading,
          closingReading: entry.closingReading,
          consumedUnits: entry.consumedUnits,
          ratePerUnit: entry.ratePerUnit,
          tariffRateLabel: entry.ratePerUnit != null
            ? `Rs.${entry.ratePerUnit}/Unit`
            : null,
          connectionLoad: entry.connectionLoad ?? '4 KW (5KVA)',
          state: 'PUNJAB',
          stateCode: '03',
          previousOutstanding: entry.previousOutstanding,
          interestAmount: entry.interestAmount,
        },
      ]

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
            charge_breakdown,
            is_active
          )
          values ($1, $2, 'FLAT', $3, $4, $5, 'FIXED', $6, true)
        `,
        [
          authMe.user.societyId,
          periodId,
          entry.flatId,
          body.chargeName,
          entry.amount,
          JSON.stringify(breakdown),
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
        entries: beforeResult.rows,
      },
      afterState: {
        chargeName: body.chargeName,
        entryCount: positiveEntries.length,
        totalAmount: positiveEntries.reduce(
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
      saved: positiveEntries.length,
      removed: Math.max(beforeResult.rows.length - positiveEntries.length, 0),
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
