import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { setEventHeader } from '~/server/utils/http-event'
import { readUuidParam } from '~/server/utils/master-data'
import { getCurrentBillingPeriodId } from '~/server/utils/qr-access'

type ResidentRow = {
  id: string
  full_name: string
}

type QrStatusRow = {
  billing_period_id: string
  billing_period_label: string
  billing_period_start_date: string
  billing_period_end_date: string
  is_access_granted: boolean | null
  access_basis: string | null
  unpaid_flat_numbers: string[] | null
  total_flats: number | null
  total_paid_flats: number | null
  total_unpaid_flats: number | null
  total_due_all_flats: string | null
  total_paid_all_flats: string | null
  total_balance_all_flats: string | null
  override_state: string | null
  override_reason: string | null
  override_expires_at: string | null
  computed_at: string | null
  token_state: 'ACTIVE' | 'REVOKED' | 'EXPIRED' | 'NOT_ISSUED'
  token_generated_at: string | null
  token_valid_until: string | null
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const residentId = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    const residentResult = await client.query<ResidentRow>(
      `
        select u.id, u.full_name
        from users u
        where u.id = $1
          and u.society_id = $2
          and u.role = 'RESIDENT'
        limit 1
      `,
      [residentId, authMe.user.societyId],
    )
    const resident = residentResult.rows[0]

    if (!resident) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Resident not found.',
      })
    }

    const billingPeriodId = await getCurrentBillingPeriodId(
      client,
      authMe.user.societyId,
    )

    setEventHeader(event, 'cache-control', 'private, no-store')

    if (!billingPeriodId) {
      return createApiSuccess(event, {
        resident: { id: resident.id, name: resident.full_name },
        period: null,
        access: null,
        qr: {
          state: 'NOT_ISSUED' as const,
          generatedAt: null,
          validUntil: null,
        },
        checkedAt: new Date().toISOString(),
      })
    }

    const statusResult = await client.query<QrStatusRow>(
      `
        select
          bp.id as billing_period_id,
          bp.label as billing_period_label,
          bp.start_date::text as billing_period_start_date,
          bp.end_date::text as billing_period_end_date,
          uas.is_access_granted,
          uas.access_basis::text,
          uas.unpaid_flat_numbers,
          uas.total_flats,
          uas.total_paid_flats,
          uas.total_unpaid_flats,
          uas.total_due_all_flats::text,
          uas.total_paid_all_flats::text,
          uas.total_balance_all_flats::text,
          uas.override_state,
          uas.override_reason,
          uas.override_expires_at::text,
          uas.computed_at::text,
          case
            when latest_token.id is null then 'NOT_ISSUED'
            when latest_token.status = 'REVOKED' or latest_token.is_valid = false then 'REVOKED'
            when latest_token.status = 'EXPIRED'
              or coalesce(latest_token.expires_at, latest_token.valid_until) <= now() then 'EXPIRED'
            else 'ACTIVE'
          end as token_state,
          latest_token.generated_at::text as token_generated_at,
          coalesce(latest_token.expires_at, latest_token.valid_until)::text as token_valid_until
        from billing_periods bp
        left join user_access_status uas
          on uas.billing_period_id = bp.id
          and uas.user_id = $1
          and uas.society_id = $2
        left join lateral (
          select
            access_token.id,
            access_token.status,
            access_token.is_valid,
            access_token.generated_at,
            access_token.expires_at,
            access_token.valid_until
          from access_tokens access_token
          where access_token.user_id = $1
            and access_token.billing_period_id = bp.id
            and access_token.society_id = $2
          order by access_token.generated_at desc
          limit 1
        ) latest_token on true
        where bp.id = $3
          and bp.society_id = $2
        limit 1
      `,
      [residentId, authMe.user.societyId, billingPeriodId],
    )
    const row = statusResult.rows[0]

    if (!row) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Current QR billing period not found.',
      })
    }

    return createApiSuccess(event, {
      resident: { id: resident.id, name: resident.full_name },
      period: {
        id: row.billing_period_id,
        label: row.billing_period_label,
        startDate: row.billing_period_start_date,
        endDate: row.billing_period_end_date,
      },
      access: row.computed_at
        ? {
            state: row.is_access_granted
              ? ('ALLOWED' as const)
              : ('BLOCKED' as const),
            basis: row.access_basis,
            unpaidFlats: row.unpaid_flat_numbers ?? [],
            totalFlats: Number(row.total_flats ?? 0),
            totalPaidFlats: Number(row.total_paid_flats ?? 0),
            totalUnpaidFlats: Number(row.total_unpaid_flats ?? 0),
            totalDue: Number(row.total_due_all_flats ?? 0),
            totalPaid: Number(row.total_paid_all_flats ?? 0),
            totalBalance: Number(row.total_balance_all_flats ?? 0),
            overrideState: row.override_state,
            overrideReason: row.override_reason,
            overrideExpiresAt: row.override_expires_at,
            computedAt: row.computed_at,
          }
        : null,
      qr: {
        state: row.token_state,
        generatedAt: row.token_generated_at,
        validUntil: row.token_valid_until,
      },
      checkedAt: new Date().toISOString(),
    })
  } finally {
    client.release()
  }
})
