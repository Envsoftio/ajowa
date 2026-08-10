import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.view')
  const result = await getDatabasePool().query<{
    flat_resident_id: string
    tenant_user_id: string
    tenant_name: string
    flat_id: string
    flat_label: string
    lease_start_date: string | null
    lease_end_date: string | null
  }>(
    `
      select
        fr.id as flat_resident_id,
        fr.user_id as tenant_user_id,
        u.full_name as tenant_name,
        fr.flat_id,
        concat(b.name, ' ', f.flat_number) as flat_label,
        fr.lease_start_date::text,
        fr.lease_end_date::text
      from flat_residents fr
      join users u on u.id = fr.user_id
      join flats f on f.id = fr.flat_id
      join blocks b on b.id = f.block_id
      where u.society_id = $1
        and f.society_id = $1
        and fr.relationship_type = 'TENANT'
        and fr.is_active = true
        and u.is_active = true
        and not exists (
          select 1
          from tenant_move_cases active_case
          where active_case.flat_resident_id = fr.id
            and active_case.status not in ('CLOSED', 'CANCELLED')
        )
      order by b.name, f.flat_number, u.full_name
    `,
    [authMe.user.societyId],
  )

  return createApiSuccess(event, {
    tenantRelationships: result.rows.map((row) => ({
      flatResidentId: row.flat_resident_id,
      tenantUserId: row.tenant_user_id,
      tenantName: row.tenant_name,
      flatId: row.flat_id,
      flatLabel: row.flat_label,
      leaseStartDate: row.lease_start_date,
      leaseEndDate: row.lease_end_date,
    })),
  })
})
