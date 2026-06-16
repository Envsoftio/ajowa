import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { mapBankAccountRow, type BankAccountRow } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const search = String(query.search ?? '').trim()
  const active = String(query.isActive ?? '')
  const pool = getDatabasePool()

  const result = await pool.query<BankAccountRow>(
    `
      select
        ba.id,
        ba.society_id,
        ba.account_head_id,
        ah.code as account_head_code,
        ah.name as account_head_name,
        ba.bank_name,
        ba.account_name,
        ba.account_number,
        ba.ifsc_code,
        ba.account_type,
        ba.branch_name,
        ba.upi_id,
        ba.is_default,
        ba.is_active,
        ba.created_at::text,
        ba.updated_at::text,
        coalesce(sum(
          case
            when je.id is null then 0
            when jl.line_type = 'DEBIT' then jl.amount
            else -jl.amount
          end
        ), 0)::text as balance
      from society_bank_accounts ba
      join account_heads ah on ah.id = ba.account_head_id
      left join journal_lines jl on jl.account_head_id = ba.account_head_id
      left join journal_entries je on je.id = jl.journal_entry_id
        and je.society_id = ba.society_id
        and je.status = 'POSTED'
      where ba.society_id = $1
        and ($2 = '' or ba.bank_name ilike '%' || $2 || '%' or ba.account_name ilike '%' || $2 || '%' or ba.ifsc_code ilike '%' || $2 || '%')
        and ($3 = '' or ba.is_active = ($3 = 'true'))
      group by ba.id, ah.id
      order by ba.is_default desc, ba.bank_name asc, ba.account_name asc
    `,
    [authMe.user.societyId, search, active],
  )

  return createApiSuccess(event, { items: result.rows.map(mapBankAccountRow) })
})
