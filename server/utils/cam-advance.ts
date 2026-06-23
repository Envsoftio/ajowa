import type { PoolClient } from 'pg'
import { z } from 'zod'

export const camAdvanceCoverageSources = [
  'MANUAL',
  'PAYMENT',
  'IMPORT',
  'OPENING_BALANCE',
  'LEGACY_MARKER',
] as const

export const camAdvanceCoverageSourceSchema = z.enum(camAdvanceCoverageSources)

const normalizeOptionalText = (value: string | null | undefined) => {
  const normalized = value?.trim()
  return normalized || null
}

export const camAdvanceCoverageSchema = z
  .object({
    flatId: z.string().uuid(),
    coveredFrom: z.string().date(),
    coveredUntil: z.string().date(),
    amount: z.coerce.number().nonnegative().nullable().optional(),
    source: camAdvanceCoverageSourceSchema.default('MANUAL'),
    reference: z.string().trim().max(160).nullable().optional(),
    notes: z.string().trim().max(500).nullable().optional(),
    isActive: z.boolean().default(true),
  })
  .superRefine((coverage, ctx) => {
    if (coverage.coveredUntil < coverage.coveredFrom) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['coveredUntil'],
        message: 'Covered until date cannot be before covered from date.',
      })
    }
  })

export type CamAdvanceCoverageInput = z.infer<typeof camAdvanceCoverageSchema>

export const camAdvanceCoverageExistsSql = (flatAlias = 'f', periodAlias = 'bp') => `
  exists (
    select 1
    from cam_advance_coverages coverage
    where coverage.society_id = ${periodAlias}.society_id
      and coverage.flat_id = ${flatAlias}.id
      and coverage.is_active = true
      and coverage.covered_from <= ${periodAlias}.start_date
      and coverage.covered_until >= ${periodAlias}.end_date
  )
`

export const camAdvanceCoverageLateralSql = (flatAlias = 'f', periodAlias = 'bp') => `
  select
    coverage.id,
    coverage.covered_from,
    coverage.covered_until,
    coverage.amount,
    coverage.source,
    coverage.reference,
    coverage.notes,
    coverage.created_at,
    coverage.updated_at
  from cam_advance_coverages coverage
  where coverage.society_id = ${periodAlias}.society_id
    and coverage.flat_id = ${flatAlias}.id
    and coverage.is_active = true
    and coverage.covered_from <= ${periodAlias}.start_date
    and coverage.covered_until >= ${periodAlias}.end_date
  order by coverage.covered_until desc, coverage.updated_at desc, coverage.created_at desc
  limit 1
`

export const setCamAdvanceCoverageForPeriod = async (
  client: PoolClient,
  input: {
    societyId: string
    flatId: string
    coveredFrom: string
    coveredUntil: string | null
    source: z.infer<typeof camAdvanceCoverageSourceSchema>
    reference: string | null
    notes: string | null
    amount?: number | null
    actorUserId: string | null
  },
) => {
  const reference = normalizeOptionalText(input.reference)
  const notes = normalizeOptionalText(input.notes)

  if (!input.coveredUntil) {
    await client.query(
      `
        update cam_advance_coverages
        set
          is_active = false,
          updated_by_user_id = $5,
          updated_at = now()
        where society_id = $1
          and flat_id = $2
          and is_active = true
          and source = $3
          and reference is not distinct from $4
      `,
      [input.societyId, input.flatId, input.source, reference, input.actorUserId],
    )
    return null
  }

  const existing = await client.query<{ id: string }>(
    `
      update cam_advance_coverages
      set
        covered_from = $5::date,
        covered_until = $6::date,
        amount = $7,
        notes = $8,
        is_active = true,
        updated_by_user_id = $9,
        updated_at = now()
      where society_id = $1
        and flat_id = $2
        and source = $3
        and reference is not distinct from $4
      returning id
    `,
    [
      input.societyId,
      input.flatId,
      input.source,
      reference,
      input.coveredFrom,
      input.coveredUntil,
      input.amount ?? null,
      notes,
      input.actorUserId,
    ],
  )

  if (existing.rows[0]) {
    return existing.rows[0].id
  }

  const inserted = await client.query<{ id: string }>(
    `
      insert into cam_advance_coverages (
        society_id,
        flat_id,
        covered_from,
        covered_until,
        amount,
        source,
        reference,
        notes,
        created_by_user_id,
        updated_by_user_id
      )
      values ($1, $2, $3::date, $4::date, $5, $6, $7, $8, $9, $9)
      returning id
    `,
    [
      input.societyId,
      input.flatId,
      input.coveredFrom,
      input.coveredUntil,
      input.amount ?? null,
      input.source,
      reference,
      notes,
      input.actorUserId,
    ],
  )

  return inserted.rows[0]?.id ?? null
}

export const deactivateCamAdvanceCoverageForPeriod = async (
  client: PoolClient,
  input: {
    societyId: string
    flatId: string
    periodStartDate: string
    periodEndDate: string
    actorUserId: string | null
  },
) => {
  await client.query(
    `
      update cam_advance_coverages
      set
        is_active = false,
        updated_by_user_id = $5,
        updated_at = now()
      where society_id = $1
        and flat_id = $2
        and is_active = true
        and covered_from <= $4::date
        and covered_until >= $3::date
    `,
    [
      input.societyId,
      input.flatId,
      input.periodStartDate,
      input.periodEndDate,
      input.actorUserId,
    ],
  )
}
