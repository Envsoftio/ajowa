import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { todayDate } from '~/server/utils/billing'
import { getDatabasePool } from '~/server/utils/database'
import { listDefaulters } from '~/server/utils/defaulters'

type DashboardStatsRow = {
  block_count: string
  active_block_count: string
  flat_count: string
  active_flat_count: string
  vacant_flat_count: string
  tenanted_flat_count: string
  self_occupied_flat_count: string
  tenant_relationship_count: string
  owner_relationship_count: string
  resident_count: string
  active_resident_count: string
  outstanding_due_count: string
  overdue_due_count: string
}

const toNumber = (value: string | number | null | undefined) =>
  Number(value ?? 0)

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()
  const today = todayDate()

  const [statsResult, defaulters] = await Promise.all([
    pool.query<DashboardStatsRow>(
      `
        select
          (
            select count(*)::text
            from blocks b
            where b.society_id = $1
          ) as block_count,
          (
            select count(*)::text
            from blocks b
            where b.society_id = $1 and b.is_active = true
          ) as active_block_count,
          (
            select count(*)::text
            from flats f
            where f.society_id = $1
          ) as flat_count,
          (
            select count(*)::text
            from flats f
            where f.society_id = $1 and f.is_active = true
          ) as active_flat_count,
          (
            select count(*)::text
            from flats f
            where f.society_id = $1
              and f.is_active = true
              and f.occupancy_status = 'VACANT'
          ) as vacant_flat_count,
          (
            select count(*)::text
            from flats f
            where f.society_id = $1
              and f.is_active = true
              and f.occupancy_status = 'TENANTED'
          ) as tenanted_flat_count,
          (
            select count(*)::text
            from flats f
            where f.society_id = $1
              and f.is_active = true
              and f.occupancy_status = 'SELF_OCCUPIED'
          ) as self_occupied_flat_count,
          (
            select count(*)::text
            from flat_residents fr
            inner join flats f on f.id = fr.flat_id
            where f.society_id = $1
              and f.is_active = true
              and fr.is_active = true
              and fr.relationship_type = 'TENANT'
          ) as tenant_relationship_count,
          (
            select count(*)::text
            from flat_residents fr
            inner join flats f on f.id = fr.flat_id
            where f.society_id = $1
              and f.is_active = true
              and fr.is_active = true
              and fr.relationship_type = 'OWNER'
          ) as owner_relationship_count,
          (
            select count(*)::text
            from users u
            where u.society_id = $1 and u.role = 'RESIDENT'
          ) as resident_count,
          (
            select count(*)::text
            from users u
            where u.society_id = $1
              and u.role = 'RESIDENT'
              and u.is_active = true
          ) as active_resident_count,
          (
            select count(*)::text
            from maintenance_dues md
            where md.society_id = $1
              and md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
              and md.balance_amount > 0
          ) as outstanding_due_count,
          (
            select count(*)::text
            from maintenance_dues md
            inner join billing_periods bp on bp.id = md.billing_period_id
            inner join society_profile sp_due on sp_due.id = md.society_id
            where md.society_id = $1
              and md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
              and md.balance_amount > 0
              and coalesce(
                md.late_fee_starts_on,
                (
                  md.due_date
                  + (
                    (
                      coalesce(nullif(sp_due.settings->>'graceDays', '')::integer, 0)
                      + 1
                    ) * interval '1 day'
                  )
                )::date
              ) <= $2::date
              and not exists (
                select 1
                from jsonb_array_elements(
                  case
                    when jsonb_typeof(md.charge_breakdown) = 'array'
                      then md.charge_breakdown
                    else '[]'::jsonb
                  end
                ) item
                where bp.charge_type = 'CAM'
                  and coalesce(item->>'camAdvanceAdjustmentAmount', '') ~ '^[0-9]+([.][0-9]+)?$'
                  and coalesce(item->>'camAdvanceCoveredMonths', '') ~ '^[0-9]+$'
                  and (item->>'camAdvanceAdjustmentAmount')::numeric > 0
                  and (item->>'camAdvanceCoveredMonths')::integer > 0
                  and $2::date < greatest(
                    md.due_date,
                    (
                      bp.start_date
                      + ((item->>'camAdvanceCoveredMonths')::integer * interval '1 month')
                    )::date
                  )
              )
          ) as overdue_due_count
      `,
      [authMe.user.societyId, today],
    ),
    listDefaulters({ societyId: authMe.user.societyId }),
  ])

  const stats = statsResult.rows[0]
  const outstandingDues = toNumber(stats?.outstanding_due_count)
  const overdueDues = toNumber(stats?.overdue_due_count)
  const outstandingBalance = defaulters.reduce(
    (sum, row) => sum + row.totalBalance,
    0,
  )
  const unpaidFlatCount = defaulters.reduce(
    (sum, row) => sum + row.flatCount,
    0,
  )

  return createApiSuccess(event, {
    stats: {
      blocks: toNumber(stats?.block_count),
      activeBlocks: toNumber(stats?.active_block_count),
      flats: toNumber(stats?.flat_count),
      activeFlats: toNumber(stats?.active_flat_count),
      vacantFlats: toNumber(stats?.vacant_flat_count),
      tenantedFlats: toNumber(stats?.tenanted_flat_count),
      selfOccupiedFlats: toNumber(stats?.self_occupied_flat_count),
      tenantRelationships: toNumber(stats?.tenant_relationship_count),
      ownerRelationships: toNumber(stats?.owner_relationship_count),
      residents: toNumber(stats?.resident_count),
      activeResidents: toNumber(stats?.active_resident_count),
      outstandingDues,
      overdueDues,
      unpaidOwners: defaulters.length,
      unpaidFlats: unpaidFlatCount,
      outstandingBalance,
      riskPercent:
        outstandingDues > 0
          ? Math.round((overdueDues / outstandingDues) * 100)
          : 0,
    },
    topDefaulters: defaulters.slice(0, 5),
  })
})
