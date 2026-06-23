import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe, readUuidParam } from '~/server/utils/master-data'
import { AppError } from '~/server/utils/errors'

const querySchema = z.object({
  chargeName: z.string().trim().min(1).max(80).optional().default('DG Set'),
})

type FlatChargeRow = {
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  area_sq_ft: string | null
  cam_advance_paid_until: string | null
  cam_advance_note: string | null
  cam_advance_updated_at: string | null
  amount: string | null
  rate_per_sq_ft: string | null
  charge_breakdown: unknown
}

const readNumber = (source: Record<string, unknown>, key: string) => {
  const value = source[key]
  if (value == null) return null
  const numberValue = Number(value)
  return Number.isFinite(numberValue) ? numberValue : null
}

const readString = (source: Record<string, unknown>, key: string) => {
  const value = source[key]
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

const getChargeMetadata = (value: unknown) => {
  const firstItem = Array.isArray(value) ? value[0] : null
  return firstItem && typeof firstItem === 'object'
    ? (firstItem as Record<string, unknown>)
    : {}
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const periodId = readUuidParam(event, 'id')
  const query = validateInput(querySchema, getQuerySafe(event))
  const pool = getDatabasePool()

  const periodResult = await pool.query<{ id: string; label: string }>(
    `
      select id, label
      from billing_periods
      where id = $1 and society_id = $2
      limit 1
    `,
    [periodId, authMe.user.societyId],
  )

  if (!periodResult.rows[0]) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Bill cycle not found.',
    })
  }

  const result = await pool.query<FlatChargeRow>(
    `
      select
        f.id as flat_id,
        f.flat_number,
        b.name as block_name,
        f.unit_type,
        f.area_sq_ft::text as area_sq_ft,
        f.cam_advance_paid_until::text as cam_advance_paid_until,
        f.cam_advance_note,
        f.cam_advance_updated_at::text as cam_advance_updated_at,
        mc.amount::text,
        mc.rate_per_sq_ft::text,
        mc.charge_breakdown
      from flats f
      inner join blocks b on b.id = f.block_id
      left join maintenance_charges mc
        on mc.society_id = f.society_id
       and mc.billing_period_id = $2
       and mc.scope = 'FLAT'
       and mc.flat_id = f.id
       and mc.charge_name = $3
       and mc.is_active = true
      where f.society_id = $1
        and f.is_active = true
      order by
        b.sort_order asc,
        b.name asc,
        nullif(regexp_replace(coalesce(f.floor_label, ''), '\\D', '', 'g'), '')::integer asc nulls last,
        nullif(regexp_replace(f.flat_number, '\\D', '', 'g'), '')::integer asc nulls last,
        f.flat_number asc
    `,
    [authMe.user.societyId, periodId, query.chargeName],
  )

  return createApiSuccess(event, {
    billingPeriodId: periodId,
    chargeName: query.chargeName,
    items: result.rows.map((row) => {
      const metadata = getChargeMetadata(row.charge_breakdown)

      return {
        flatId: row.flat_id,
        flatNumber: row.flat_number,
        blockName: row.block_name,
        unitType: row.unit_type,
        areaSqFt: readNumber(metadata, 'areaSqFt') ?? (row.area_sq_ft == null ? null : Number(row.area_sq_ft)),
        camAdvancePaidUntil: row.cam_advance_paid_until,
        camAdvanceNote: row.cam_advance_note,
        camAdvanceUpdatedAt: row.cam_advance_updated_at,
        meterNo: readString(metadata, 'meterNo'),
        openingReading: readNumber(metadata, 'openingReading'),
        closingReading: readNumber(metadata, 'closingReading'),
        consumedUnits: readNumber(metadata, 'consumedUnits'),
        ratePerUnit: readNumber(metadata, 'ratePerUnit'),
        ratePerSqFt: readNumber(metadata, 'ratePerSqFt') ?? (row.rate_per_sq_ft == null ? null : Number(row.rate_per_sq_ft)),
        connectionLoad: readString(metadata, 'connectionLoad'),
        previousOutstanding: readNumber(metadata, 'previousOutstanding'),
        interestAmount: readNumber(metadata, 'interestAmount'),
        cycleMultiplier: readNumber(metadata, 'cycleMultiplier'),
        cycleLabel: readString(metadata, 'cycleLabel'),
        amount: row.amount == null ? readNumber(metadata, 'amount') : Number(row.amount),
      }
    }),
  })
})
