import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'

type DgAdvanceRow = {
  flat_id: string
  flat_number: string
  block_name: string
  available_amount: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const accessibleFlatIds = authMe.flatAccess.map((flat) => flat.flatId)

  if (accessibleFlatIds.length === 0) {
    return createApiSuccess(event, { items: [], totalAvailable: 0 })
  }

  const result = await getDatabasePool().query<DgAdvanceRow>(
    `
      select
        f.id::text as flat_id,
        f.flat_number,
        b.name as block_name,
        coalesce(sum(rac.current_balance) filter (
          where rac.applicable_charge_type = 'DG_SET'
            and rac.status = 'ACTIVE'
            and rac.current_balance > 0
        ), 0)::text as available_amount
      from flats f
      inner join blocks b on b.id = f.block_id
      left join resident_advance_credits rac
        on rac.flat_id = f.id
        and rac.society_id = f.society_id
      where f.society_id = $1
        and f.id = any($2::uuid[])
      group by f.id, f.flat_number, b.name, b.sort_order
      order by b.sort_order asc, f.flat_number asc
    `,
    [authMe.user.societyId, accessibleFlatIds],
  )

  const items = result.rows.map((row) => ({
    flatId: row.flat_id,
    flatNumber: row.flat_number,
    blockName: row.block_name,
    availableAmount: Number(row.available_amount),
  }))

  return createApiSuccess(event, {
    items,
    totalAvailable: items.reduce((sum, item) => sum + item.availableAmount, 0),
  })
})
