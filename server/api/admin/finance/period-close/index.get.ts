import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { mapPeriodCloseRow, type PeriodCloseRow } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const result = await getDatabasePool().query<PeriodCloseRow>(
    `
      select
        pc.id,
        pc.society_id,
        pc.start_date::text,
        pc.end_date::text,
        pc.notes,
        pc.opening_balance::text,
        pc.income_total::text,
        pc.expense_total::text,
        pc.closing_balance::text,
        pc.validation_snapshot,
        pc.closed_at::text,
        pc.closed_by_user_id,
        closer.full_name as closed_by_name,
        pc.is_reopened,
        pc.reopened_at::text,
        pc.reopened_by_user_id,
        reopener.full_name as reopened_by_name,
        pc.reopen_reason,
        pc.created_at::text,
        pc.updated_at::text
      from financial_period_close pc
      left join users closer on closer.id = pc.closed_by_user_id
      left join users reopener on reopener.id = pc.reopened_by_user_id
      where pc.society_id = $1
      order by pc.start_date desc
    `,
    [authMe.user.societyId],
  )

  return createApiSuccess(event, { items: result.rows.map(mapPeriodCloseRow) })
})
