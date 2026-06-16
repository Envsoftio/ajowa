import type { FlatDetail, FlatResidentRelationship } from '~/types/domain'
import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'

type FlatDetailRow = {
  id: string
  society_id: string
  block_id: string
  block_name: string
  flat_number: string
  floor_label: string | null
  unit_type: string
  area_sq_ft: string | null
  occupancy_status: string
  is_active: boolean
  created_at: string
  updated_at: string
  total_due_amount: string
  total_balance_amount: string
  open_due_count: string
  active_residents: string
  login_enabled_residents: string
  open_ticket_count: string
  closed_ticket_count: string
}

type RelationshipRow = {
  id: string
  flat_id: string
  user_id: string
  resident_name: string
  resident_email: string
  resident_mobile_number: string
  relationship_type: string
  is_primary_contact: boolean
  is_billing_contact: boolean
  can_login: boolean
  is_active: boolean
  ownership_start_date: string | null
  lease_start_date: string | null
  lease_end_date: string | null
  contract_start_date: string | null
  contract_end_date: string | null
  occupancy_status: string | null
  access_scope: string | null
  relationship_note: string | null
  created_at: string
  updated_at: string
}

const mapRelationship = (row: RelationshipRow): FlatResidentRelationship => ({
  id: row.id,
  flatId: row.flat_id,
  userId: row.user_id,
  residentName: row.resident_name,
  residentEmail: row.resident_email,
  residentMobileNumber: row.resident_mobile_number,
  relationshipType: row.relationship_type,
  isPrimaryContact: row.is_primary_contact,
  isBillingContact: row.is_billing_contact,
  canLogin: row.can_login,
  isActive: row.is_active,
  ownershipStartDate: row.ownership_start_date,
  leaseStartDate: row.lease_start_date,
  leaseEndDate: row.lease_end_date,
  contractStartDate: row.contract_start_date,
  contractEndDate: row.contract_end_date,
  occupancyStatus: row.occupancy_status,
  accessScope: row.access_scope,
  relationshipNote: row.relationship_note,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const pool = getDatabasePool()

  const [flatResult, relationshipsResult] = await Promise.all([
    pool.query<FlatDetailRow>(
      `
        select
          f.id,
          f.society_id,
          f.block_id,
          b.name as block_name,
          f.flat_number,
          f.floor_label,
          f.unit_type,
          f.area_sq_ft::text,
          f.occupancy_status::text,
          f.is_active,
          f.created_at::text,
          f.updated_at::text,
          coalesce(sum(md.total_amount), 0)::text as total_due_amount,
          coalesce(sum(md.balance_amount), 0)::text as total_balance_amount,
          count(*) filter (where md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE'))::text as open_due_count,
          count(distinct fr.user_id) filter (where fr.is_active = true)::text as active_residents,
          count(distinct fr.user_id) filter (where fr.is_active = true and fr.can_login = true)::text as login_enabled_residents,
          count(distinct sr.id) filter (where sr.status not in ('CLOSED', 'CANCELLED'))::text as open_ticket_count,
          count(distinct sr.id) filter (where sr.status = 'CLOSED')::text as closed_ticket_count
        from flats f
        inner join blocks b on b.id = f.block_id
        left join maintenance_dues md on md.flat_id = f.id
        left join flat_residents fr on fr.flat_id = f.id
        left join service_requests sr on sr.flat_id = f.id
        where f.id = $1 and f.society_id = $2
        group by f.id, b.id
      `,
      [id, authMe.user.societyId],
    ),
    pool.query<RelationshipRow>(
      `
        select
          fr.id,
          fr.flat_id,
          fr.user_id,
          u.full_name as resident_name,
          u.email as resident_email,
          u.mobile_number as resident_mobile_number,
          fr.relationship_type::text,
          fr.is_primary_contact,
          fr.is_billing_contact,
          fr.can_login,
          fr.is_active,
          fr.ownership_start_date::text,
          fr.lease_start_date::text,
          fr.lease_end_date::text,
          fr.contract_start_date::text,
          fr.contract_end_date::text,
          fr.occupancy_status::text,
          fr.access_scope::text,
          fr.relationship_note,
          fr.created_at::text,
          fr.updated_at::text
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        inner join flats f on f.id = fr.flat_id
        where fr.flat_id = $1 and f.society_id = $2
        order by fr.is_active desc, fr.is_primary_contact desc, u.full_name asc
      `,
      [id, authMe.user.societyId],
    ),
  ])

  const row = flatResult.rows[0]

  if (!row) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Flat not found.',
    })
  }
  const detail: FlatDetail = {
    id: row.id,
    societyId: row.society_id,
    blockId: row.block_id,
    blockName: row.block_name,
    flatNumber: row.flat_number,
    floorLabel: row.floor_label,
    unitType: row.unit_type,
    areaSqFt: row.area_sq_ft ? Number(row.area_sq_ft) : null,
    occupancyStatus: row.occupancy_status,
    isActive: row.is_active,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    duesSummary: {
      totalDueAmount: Number(row.total_due_amount),
      totalBalanceAmount: Number(row.total_balance_amount),
      openDueCount: Number(row.open_due_count),
    },
    accessSummary: {
      activeResidents: Number(row.active_residents),
      loginEnabledResidents: Number(row.login_enabled_residents),
    },
    ticketSummary: {
      openTicketCount: Number(row.open_ticket_count),
      closedTicketCount: Number(row.closed_ticket_count),
    },
    relationships: relationshipsResult.rows.map(mapRelationship),
  }

  return createApiSuccess(event, detail)
})
