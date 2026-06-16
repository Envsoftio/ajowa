import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  mapReconciliationAccountRow,
  type ReconciliationAccountRow,
} from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()

  const accounts = await pool.query<ReconciliationAccountRow>(
    `
      select
        ah.id as account_head_id,
        ah.code,
        ah.name,
        ah.head_type::text,
        coalesce(sum(case when jl.line_type = 'DEBIT' and je.status = 'POSTED' then jl.amount else 0 end), 0)::text as debit_total,
        coalesce(sum(case when jl.line_type = 'CREDIT' and je.status = 'POSTED' then jl.amount else 0 end), 0)::text as credit_total,
        coalesce(sum(case
          when je.status <> 'POSTED' or je.id is null then 0
          when ah.head_type in ('ASSET', 'EXPENSE') and jl.line_type = 'DEBIT' then jl.amount
          when ah.head_type in ('ASSET', 'EXPENSE') and jl.line_type = 'CREDIT' then -jl.amount
          when ah.head_type in ('LIABILITY', 'EQUITY', 'INCOME') and jl.line_type = 'CREDIT' then jl.amount
          else -jl.amount
        end), 0)::text as balance
      from account_heads ah
      left join journal_lines jl on jl.account_head_id = ah.id
      left join journal_entries je on je.id = jl.journal_entry_id and je.society_id = $1
      where ah.society_id = $1 or ah.society_id is null
      group by ah.id
      order by ah.head_type asc, ah.code asc
    `,
    [authMe.user.societyId],
  )

  const health = await pool.query<{
    unbalanced_posted: string
    transactions_without_journal: string
    payments_without_journal: string
  }>(
    `
      with posted_totals as (
        select
          je.id,
          coalesce(sum(case when jl.line_type = 'DEBIT' then jl.amount else 0 end), 0) as debits,
          coalesce(sum(case when jl.line_type = 'CREDIT' then jl.amount else 0 end), 0) as credits
        from journal_entries je
        left join journal_lines jl on jl.journal_entry_id = je.id
        where je.society_id = $1 and je.status = 'POSTED'
        group by je.id
      )
      select
        (select count(*)::text from posted_totals where debits <> credits or debits = 0) as unbalanced_posted,
        (
          select count(*)::text
          from transactions t
          left join journal_entries je on je.transaction_id = t.id and je.status = 'POSTED'
          where t.society_id = $1 and t.status = 'POSTED' and je.id is null
        ) as transactions_without_journal,
        (
          select count(*)::text
          from payments p
          left join journal_entries je on je.payment_id = p.id and je.status = 'POSTED'
          where p.society_id = $1 and p.status = 'VERIFIED' and je.id is null
        ) as payments_without_journal
    `,
    [authMe.user.societyId],
  )

  const healthRow = health.rows[0]
  return createApiSuccess(event, {
    accounts: accounts.rows.map(mapReconciliationAccountRow),
    health: {
      unbalancedPosted: Number(healthRow?.unbalanced_posted ?? 0),
      transactionsWithoutJournal: Number(healthRow?.transactions_without_journal ?? 0),
      paymentsWithoutJournal: Number(healthRow?.payments_without_journal ?? 0),
    },
  })
})
