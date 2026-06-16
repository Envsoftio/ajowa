import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { mapAccountHeadRow, type AccountHeadRow } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const query = getQuerySafe(event)
  const search = String(query.search ?? '').trim()
  const headType = String(query.headType ?? '')
  const active = String(query.isActive ?? '')
  const pool = getDatabasePool()

  const result = await pool.query<AccountHeadRow>(
    `
      with recursive visible_accounts as (
        select
          ah.*,
          null::text as parent_name,
          0 as level,
          array[ah.head_type::text, ah.code] as sort_path
        from account_heads ah
        where (ah.society_id = $1 or ah.society_id is null)
          and ah.parent_id is null

        union all

        select
          child.*,
          parent.name as parent_name,
          parent.level + 1 as level,
          parent.sort_path || child.code as sort_path
        from account_heads child
        join visible_accounts parent on parent.id = child.parent_id
        where child.society_id = $1 or child.society_id is null
      ),
      account_tree as (
        select va.id as root_id, va.id as account_id
        from visible_accounts va

        union all

        select account_tree.root_id, child.id
        from account_tree
        join account_heads child on child.parent_id = account_tree.account_id
        where child.society_id = $1 or child.society_id is null
      ),
      balances as (
        select
          account_tree.root_id,
          coalesce(sum(
            case
              when je.id is null then 0
              when root.head_type in ('ASSET', 'EXPENSE') and jl.line_type = 'DEBIT' then jl.amount
              when root.head_type in ('ASSET', 'EXPENSE') and jl.line_type = 'CREDIT' then -jl.amount
              when root.head_type in ('LIABILITY', 'EQUITY', 'INCOME') and jl.line_type = 'CREDIT' then jl.amount
              else -jl.amount
            end
          ), 0)::text as balance
        from account_tree
        join account_heads root on root.id = account_tree.root_id
        left join journal_lines jl on jl.account_head_id = account_tree.account_id
        left join journal_entries je on je.id = jl.journal_entry_id
          and je.society_id = $1
          and je.status = 'POSTED'
        group by account_tree.root_id
      )
      select
        va.id,
        va.society_id,
        va.parent_id,
        va.parent_name,
        va.code,
        va.name,
        va.head_type::text,
        va.is_system,
        va.is_active,
        va.allows_manual_entries,
        va.created_at::text,
        va.updated_at::text,
        va.level,
        exists(select 1 from account_heads child where child.parent_id = va.id) as has_children,
        count(distinct ba.id)::text as mapped_bank_account_count,
        coalesce(balances.balance, '0') as balance
      from visible_accounts va
      left join society_bank_accounts ba on ba.account_head_id = va.id and ba.society_id = $1
      left join balances on balances.root_id = va.id
      where ($2 = '' or va.name ilike '%' || $2 || '%' or va.code ilike '%' || $2 || '%')
        and ($3 = '' or va.head_type::text = $3)
        and ($4 = '' or va.is_active = ($4 = 'true'))
      group by
        va.id,
        va.society_id,
        va.parent_id,
        va.parent_name,
        va.code,
        va.name,
        va.head_type,
        va.is_system,
        va.is_active,
        va.allows_manual_entries,
        va.created_at,
        va.updated_at,
        va.level,
        va.sort_path,
        balances.balance
      order by va.sort_path asc
    `,
    [authMe.user.societyId, search, headType, active],
  )

  return createApiSuccess(event, { items: result.rows.map(mapAccountHeadRow) })
})
