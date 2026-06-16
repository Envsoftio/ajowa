import { createApiSuccess } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { mapCategoryRow, type CategoryRow } from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const query = getQuerySafe(event)
  const transactionType = String(query.transactionType ?? '')
  const active = String(query.isActive ?? 'true')
  const search = String(query.search ?? '').trim()

  const result = await getDatabasePool().query<CategoryRow>(
    `
      select
        tc.id,
        tc.society_id,
        tc.code,
        tc.name,
        tc.transaction_type::text,
        tc.category_group,
        tc.account_head_id,
        ah.code as account_head_code,
        ah.name as account_head_name,
        ah.head_type::text as account_head_type,
        count(distinct t.id)::text as transaction_count,
        tc.requires_attachment,
        tc.is_system,
        tc.is_active,
        tc.created_at::text,
        tc.updated_at::text
      from transaction_categories tc
      left join account_heads ah on ah.id = tc.account_head_id
      left join transactions t on t.category_id = tc.id and t.society_id = $1
      where (tc.society_id = $1 or tc.society_id is null)
        and ($2 = '' or tc.transaction_type::text = $2)
        and ($3 = '' or tc.is_active = ($3 = 'true'))
        and ($4 = '' or tc.name ilike '%' || $4 || '%' or tc.code ilike '%' || $4 || '%' or tc.category_group ilike '%' || $4 || '%')
      group by
        tc.id,
        tc.society_id,
        tc.code,
        tc.name,
        tc.transaction_type,
        tc.category_group,
        tc.account_head_id,
        ah.code,
        ah.name,
        ah.head_type,
        tc.requires_attachment,
        tc.is_system,
        tc.is_active,
        tc.created_at,
        tc.updated_at
      order by tc.transaction_type asc, tc.category_group asc, tc.name asc
    `,
    [authMe.user.societyId, transactionType, active, search],
  )

  return createApiSuccess(event, { items: result.rows.map(mapCategoryRow) })
})
