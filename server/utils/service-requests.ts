import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool } from './database'
import { parseListQuery } from './master-data'
import {
  dispatchNotificationJobs,
  enqueueNotificationForUsers,
  resolveNotificationAudience,
  type NotificationUser,
} from './notifications'
import { createStorageObjectKey, downloadPrivateFile, uploadPrivateFile } from './storage'
import type { AuthMe } from '~/types/auth'
import type {
  ServiceRequestAttachment,
  ServiceCommentVisibility,
  ServiceDepartment,
  ServiceLocationType,
  ServicePriority,
  ServiceRequestComment,
  ServiceRequestDetail,
  ServiceRequestEvent,
  ServiceRequestQueueSummary,
  ServiceRequestStatus,
  ServiceRequestSummary,
} from '~/types/domain'
import {
  activeTicketStatuses,
  closedTicketStatuses,
  servicePriorities,
  serviceRequestStatuses,
} from '~/shared/service-requests'

const serviceLocationTypes = ['FLAT', 'COMMON_AREA', 'SOCIETY_ASSET'] as const
const serviceSources = ['RESIDENT_REQUEST', 'ADMIN_CREATED', 'COMMON_AREA_REPORT', 'STAFF_REPORTED'] as const
const commentVisibilities = ['INTERNAL_NOTE', 'RESIDENT_VISIBLE'] as const

type TicketScope = 'admin' | 'resident' | 'service'

type ServiceAttachmentUploadInput = {
  fileName: string
  mimeType: string
  sizeBytes: number
  body: Buffer
}

type DepartmentRow = {
  id: string
  society_id: string
  code: string
  name: string
  description: string | null
  is_active: boolean
  allows_queue_visibility: boolean
  created_at: string
  updated_at: string
  staff_count: string
  open_ticket_count: string
}

type StaffAssignmentRow = {
  id: string
  department_id: string
  user_id: string
  full_name: string
  email: string
  is_primary: boolean
  is_active: boolean
}

type TicketRow = {
  id: string
  society_id: string
  request_number: string
  requester_user_id: string | null
  requester_name: string | null
  requester_mobile_number: string | null
  flat_id: string | null
  flat_label: string | null
  block_name: string | null
  department_id: string | null
  department_name: string | null
  assignee_user_id: string | null
  assignee_name: string | null
  category: string
  title: string
  description: string
  source_type: string
  location_type: string
  area_name: string | null
  asset_reference: string | null
  priority: string
  status: string
  visibility: 'RESIDENT_VISIBLE' | 'INTERNAL_ONLY'
  first_response_due_at: string | null
  due_by_at: string | null
  first_responded_at: string | null
  acknowledged_at: string | null
  resolved_at: string | null
  closed_at: string | null
  reopened_at: string | null
  escalation_level: number
  is_sla_breached: boolean
  created_at: string
  updated_at: string
  age_minutes: string
  is_overdue: boolean
}

type EventRow = {
  id: string
  service_request_id: string
  event_type: string
  actor_user_id: string | null
  actor_name: string | null
  visibility: ServiceCommentVisibility
  from_status: ServiceRequestStatus | null
  to_status: ServiceRequestStatus | null
  metadata: Record<string, unknown>
  occurred_at: string
}

type CommentRow = {
  id: string
  service_request_id: string
  author_user_id: string | null
  author_name: string | null
  visibility: ServiceCommentVisibility
  comment_body: string
  created_at: string
}

type AttachmentRow = {
  id: string
  service_request_id: string
  uploaded_by_user_id: string | null
  uploaded_by_name: string | null
  file_name: string
  file_path: string
  mime_type: string
  size_bytes: number
  checksum: string | null
  created_at: string
}

type TicketNotificationRow = {
  id: string
  society_id: string
  requester_user_id: string | null
  flat_id: string | null
  request_number: string
  title: string
  status: string
  priority: string
}

type ManagerTicketNotificationRow = TicketNotificationRow & {
  requester_name: string | null
  flat_label: string | null
}

export const serviceDepartmentSchema = z.object({
  code: z.string().trim().min(2).max(40).transform((value) => value.toUpperCase().replace(/\s+/g, '_')),
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(300).nullable().optional(),
  isActive: z.boolean().default(true),
  allowsQueueVisibility: z.boolean().default(true),
  staffAssignments: z.array(z.object({
    userId: z.string().uuid(),
    isPrimary: z.boolean().default(false),
    isActive: z.boolean().default(true),
  })).default([]),
})

export const serviceRequestCreateSchema = z.object({
  requesterUserId: z.string().uuid().nullable().optional(),
  flatId: z.string().uuid().nullable().optional(),
  departmentId: z.string().uuid().nullable().optional(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  category: z.string().trim().min(2).max(80),
  title: z.string().trim().min(3).max(160),
  description: z.string().trim().min(10).max(4000),
  sourceType: z.enum(serviceSources).default('RESIDENT_REQUEST'),
  locationType: z.enum(serviceLocationTypes),
  areaName: z.string().trim().max(160).nullable().optional(),
  assetReference: z.string().trim().max(160).nullable().optional(),
  priority: z.enum(servicePriorities).default('MEDIUM'),
  preferredVisitTime: z.string().trim().max(120).nullable().optional(),
  emergencyConfirmed: z.boolean().default(false),
})

export const serviceRequestAssignSchema = z.object({
  departmentId: z.string().uuid(),
  assigneeUserId: z.string().uuid().nullable().optional(),
  reason: z.string().trim().min(3).max(500).optional(),
})

export const serviceRequestCommentSchema = z.object({
  visibility: z.enum(commentVisibilities).default('RESIDENT_VISIBLE'),
  commentBody: z.string().trim().min(2).max(3000),
})

export const serviceRequestStatusSchema = z.object({
  status: z.enum(serviceRequestStatuses),
  comment: z.string().trim().max(3000).nullable().optional(),
  reason: z.string().trim().max(500).nullable().optional(),
})

export const serviceRequestAttachmentSchema = z.object({
  fileName: z.string().trim().min(1).max(240),
  filePath: z.string().trim().min(1).max(500),
  mimeType: z.string().trim().min(3).max(120),
  sizeBytes: z.coerce.number().int().positive().max(10 * 1024 * 1024),
  checksum: z.string().trim().max(160).nullable().optional(),
})

const ticketAttachmentDownloadUrl = (scope: TicketScope, ticketId: string, attachmentId: string) => {
  if (scope === 'admin') return `/api/admin/service-requests/${ticketId}/attachments/${attachmentId}/download`
  if (scope === 'service') return `/api/service/tickets/${ticketId}/attachments/${attachmentId}/download`
  return `/api/my/service-requests/${ticketId}/attachments/${attachmentId}/download`
}

const mapDepartment = (row: DepartmentRow, assignments: StaffAssignmentRow[] = []): ServiceDepartment => ({
  id: row.id,
  societyId: row.society_id,
  code: row.code,
  name: row.name,
  description: row.description,
  isActive: row.is_active,
  allowsQueueVisibility: row.allows_queue_visibility,
  staffCount: Number(row.staff_count),
  openTicketCount: Number(row.open_ticket_count),
  staffAssignments: assignments.map((assignment) => ({
    id: assignment.id,
    departmentId: assignment.department_id,
    userId: assignment.user_id,
    fullName: assignment.full_name,
    email: assignment.email,
    isPrimary: assignment.is_primary,
    isActive: assignment.is_active,
  })),
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const mapTicket = (row: TicketRow): ServiceRequestSummary => ({
  id: row.id,
  societyId: row.society_id,
  requestNumber: row.request_number,
  requesterUserId: row.requester_user_id,
  requesterName: row.requester_name,
  requesterMobileNumber: row.requester_mobile_number,
  flatId: row.flat_id,
  flatLabel: row.flat_label,
  blockName: row.block_name,
  departmentId: row.department_id,
  departmentName: row.department_name,
  assigneeUserId: row.assignee_user_id,
  assigneeName: row.assignee_name,
  category: row.category,
  title: row.title,
  description: row.description,
  sourceType: row.source_type as ServiceRequestSummary['sourceType'],
  locationType: row.location_type as ServiceLocationType,
  areaName: row.area_name,
  assetReference: row.asset_reference,
  priority: row.priority as ServicePriority,
  status: row.status as ServiceRequestStatus,
  visibility: row.visibility,
  firstResponseDueAt: row.first_response_due_at,
  dueByAt: row.due_by_at,
  firstRespondedAt: row.first_responded_at,
  acknowledgedAt: row.acknowledged_at,
  resolvedAt: row.resolved_at,
  closedAt: row.closed_at,
  reopenedAt: row.reopened_at,
  escalationLevel: row.escalation_level,
  isSlaBreached: row.is_sla_breached,
  ageMinutes: Number(row.age_minutes),
  isOverdue: row.is_overdue,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const ticketSelectSql = `
  select
    sr.id,
    sr.society_id,
    sr.request_number,
    sr.requester_user_id,
    requester.full_name as requester_name,
    requester.mobile_number as requester_mobile_number,
    sr.flat_id,
    case when f.id is not null then concat(b.name, ' ', f.flat_number) else null end as flat_label,
    b.name as block_name,
    sr.department_id,
    sd.name as department_name,
    sr.assignee_user_id,
    assignee.full_name as assignee_name,
    sr.category,
    sr.title,
    sr.description,
    sr.source_type::text,
    sr.location_type::text,
    sr.area_name,
    sr.asset_reference,
    sr.priority::text,
    sr.status::text,
    sr.visibility::text as visibility,
    sr.first_response_due_at::text,
    sr.due_by_at::text,
    sr.first_responded_at::text,
    sr.acknowledged_at::text,
    sr.resolved_at::text,
    sr.closed_at::text,
    sr.reopened_at::text,
    sr.escalation_level,
    sr.is_sla_breached,
    sr.created_at::text,
    sr.updated_at::text,
    floor(extract(epoch from now() - sr.created_at) / 60)::text as age_minutes,
    (
      sr.due_by_at is not null
      and sr.due_by_at < now()
      and sr.status not in ('RESOLVED', 'CLOSED', 'CANCELLED')
    ) as is_overdue
  from service_requests sr
  left join users requester on requester.id = sr.requester_user_id
  left join flats f on f.id = sr.flat_id
  left join blocks b on b.id = f.block_id
  left join service_departments sd on sd.id = sr.department_id
  left join users assignee on assignee.id = sr.assignee_user_id
`

const sortColumns: Record<string, string> = {
  requestNumber: 'sr.request_number',
  createdAt: 'sr.created_at',
  updatedAt: 'sr.updated_at',
  priority: 'sr.priority',
  status: 'sr.status',
  dueByAt: 'sr.due_by_at',
  title: 'sr.title',
}

const scopeWhere = (scope: TicketScope, authMe: AuthMe, values: unknown[], alias = 'sr') => {
  const clauses = [`${alias}.society_id = $1`]

  if (scope === 'resident') {
    const flatIds = authMe.flatAccess.map((item) => item.flatId)
    values.push(authMe.user.id)
    const requesterParam = values.length

    if (flatIds.length > 0) {
      values.push(flatIds)
      clauses.push(`(${alias}.visibility = 'RESIDENT_VISIBLE' and (${alias}.requester_user_id = $${requesterParam} or ${alias}.flat_id = any($${values.length}::uuid[])))`)
    } else {
      clauses.push(`(${alias}.visibility = 'RESIDENT_VISIBLE' and ${alias}.requester_user_id = $${requesterParam})`)
    }
  }

  if (scope === 'service') {
    const departmentIds = authMe.departmentAssignments.map((item) => item.departmentId)
    values.push(authMe.user.id)
    const userParam = values.length
    values.push(departmentIds)
    clauses.push(`(
      ${alias}.assignee_user_id = $${userParam}
      or (
        ${alias}.assignee_user_id is null
        and ${alias}.department_id = any($${values.length}::uuid[])
        and exists (
          select 1 from service_departments sd_scope
          where sd_scope.id = ${alias}.department_id
            and sd_scope.allows_queue_visibility = true
        )
      )
    )`)
  }

  return clauses
}

const applyTicketFilters = (filters: Record<string, string[]>, where: string[], values: unknown[]) => {
  const simpleFilters: Record<string, string> = {
    status: 'sr.status::text',
    priority: 'sr.priority::text',
    departmentId: 'sr.department_id',
    assigneeUserId: 'sr.assignee_user_id',
    requesterUserId: 'sr.requester_user_id',
    flatId: 'sr.flat_id',
    locationType: 'sr.location_type::text',
    category: 'upper(sr.category)',
  }

  for (const [key, column] of Object.entries(simpleFilters)) {
    const value = filters[key]?.[0]
    if (value) {
      values.push(key === 'category' ? value.toUpperCase() : value)
      where.push(`${column} = $${values.length}`)
    }
  }

  if (filters.unassigned?.[0] === 'true') {
    where.push('sr.assignee_user_id is null')
  }

  if (filters.reopened?.[0] === 'true') {
    where.push("sr.status = 'REOPENED'")
  }

  if (filters.commonArea?.[0] === 'true') {
    where.push("sr.location_type = 'COMMON_AREA'")
  }

  if (filters.overdue?.[0] === 'true') {
    where.push("sr.due_by_at < now() and sr.status not in ('RESOLVED', 'CLOSED', 'CANCELLED')")
  }

  if (filters.closedOnly?.[0] === 'true') {
    values.push(closedTicketStatuses)
    where.push(`sr.status = any($${values.length}::service_request_status[])`)
  }

  if (filters.activeOnly?.[0] === 'true') {
    values.push(activeTicketStatuses)
    where.push(`sr.status = any($${values.length}::service_request_status[])`)
  }
}

export const listServiceDepartments = async (authMe: AuthMe, includeInactive = true) => {
  const pool = getDatabasePool()
  const values: unknown[] = [authMe.user.societyId]
  const activeSql = includeInactive ? '' : 'and sd.is_active = true'

  const [departmentResult, assignmentResult] = await Promise.all([
    pool.query<DepartmentRow>(
      `
        select
          sd.id,
          sd.society_id,
          sd.code,
          sd.name,
          sd.description,
          sd.is_active,
          sd.allows_queue_visibility,
          sd.created_at::text,
          sd.updated_at::text,
          count(distinct ssa.id) filter (where ssa.is_active = true)::text as staff_count,
          count(distinct sr.id) filter (where sr.status not in ('RESOLVED', 'CLOSED', 'CANCELLED'))::text as open_ticket_count
        from service_departments sd
        left join service_staff_assignments ssa on ssa.department_id = sd.id
        left join service_requests sr on sr.department_id = sd.id
        where sd.society_id = $1 ${activeSql}
        group by sd.id
        order by sd.name asc
      `,
      values,
    ),
    pool.query<StaffAssignmentRow>(
      `
        select
          ssa.id,
          ssa.department_id,
          ssa.user_id,
          u.full_name,
          u.email::text,
          ssa.is_primary,
          ssa.is_active
        from service_staff_assignments ssa
        inner join users u on u.id = ssa.user_id
        inner join service_departments sd on sd.id = ssa.department_id
        where sd.society_id = $1
        order by u.full_name asc
      `,
      values,
    ),
  ])

  return departmentResult.rows.map((department) =>
    mapDepartment(
      department,
      assignmentResult.rows.filter((assignment) => assignment.department_id === department.id),
    ),
  )
}

export const upsertServiceDepartment = async (
  authMe: AuthMe,
  input: z.infer<typeof serviceDepartmentSchema>,
  departmentId?: string,
) => {
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const department = departmentId
      ? await client.query<{ id: string }>(
          `
            update service_departments
            set code = $3,
                name = $4,
                description = $5,
                is_active = $6,
                allows_queue_visibility = $7
            where id = $1 and society_id = $2
            returning id
          `,
          [
            departmentId,
            authMe.user.societyId,
            input.code,
            input.name,
            input.description ?? null,
            input.isActive,
            input.allowsQueueVisibility,
          ],
        )
      : await client.query<{ id: string }>(
          `
            insert into service_departments (
              society_id,
              code,
              name,
              description,
              is_active,
              allows_queue_visibility
            )
            values ($1, $2, $3, $4, $5, $6)
            returning id
          `,
          [
            authMe.user.societyId,
            input.code,
            input.name,
            input.description ?? null,
            input.isActive,
            input.allowsQueueVisibility,
          ],
        )

    const id = department.rows[0]?.id
    if (!id) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: departmentId ? 404 : 500,
        message: departmentId ? 'Department not found.' : 'Department creation failed.',
      })
    }

    for (const assignment of input.staffAssignments) {
      await client.query(
        `
          insert into service_staff_assignments (department_id, user_id, is_primary, is_active, ended_at)
          values ($1, $2, $3, $4, case when $4 = false then now() else null end)
          on conflict (department_id, user_id) do update
            set is_primary = excluded.is_primary,
                is_active = excluded.is_active,
                ended_at = case when excluded.is_active = false then coalesce(service_staff_assignments.ended_at, now()) else null end,
                updated_at = now()
        `,
        [id, assignment.userId, assignment.isPrimary, assignment.isActive],
      )
    }

    await client.query('commit')
    return id
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const listServiceStaffOptions = async (authMe: AuthMe, departmentId?: string) => {
  const values: unknown[] = [authMe.user.societyId]
  const where = ['u.society_id = $1', "u.role = 'SERVICE_STAFF'", 'u.is_active = true']

  if (departmentId) {
    values.push(departmentId)
    where.push(`exists (
      select 1 from service_staff_assignments ssa
      where ssa.user_id = u.id
        and ssa.department_id = $${values.length}
        and ssa.is_active = true
    )`)
  }

  const result = await getDatabasePool().query<{
    id: string
    full_name: string
    email: string
  }>(
    `
      select u.id, u.full_name, u.email::text
      from users u
      where ${where.join(' and ')}
      order by u.full_name asc
    `,
    values,
  )

  return result.rows.map((row) => ({
    id: row.id,
    fullName: row.full_name,
    email: row.email,
  }))
}

const resolveRoute = async (
  client: PoolClient,
  societyId: string,
  category: string,
  locationType: ServiceLocationType,
) => {
  const route = await client.query<{
    department_id: string
    default_priority: ServicePriority | null
  }>(
    `
      select department_id, default_priority::text
      from service_category_routes
      where society_id = $1
        and upper(category_key) = upper($2)
        and is_active = true
        and (location_type = $3 or location_type is null)
      order by case when location_type = $3 then 0 else 1 end
      limit 1
    `,
    [societyId, category, locationType],
  )

  return route.rows[0] ?? null
}

const resolveSla = async (
  client: PoolClient,
  societyId: string,
  priority: ServicePriority,
  departmentId?: string | null,
) => {
  const result = await client.query<{
    acknowledge_within_minutes: number
    resolve_within_minutes: number
  }>(
    `
      select acknowledge_within_minutes, resolve_within_minutes
      from service_sla_rules
      where society_id = $1
        and priority = $2
        and is_active = true
        and (department_id = $3 or department_id is null)
      order by case when department_id = $3 then 0 else 1 end
      limit 1
    `,
    [societyId, priority, departmentId ?? null],
  )

  return result.rows[0] ?? null
}

const assertFlatAccessForResident = async (client: PoolClient, authMe: AuthMe, flatId: string) => {
  if (authMe.flatAccess.some((flat) => flat.flatId === flatId)) {
    return
  }

  const result = await client.query<{ id: string }>(
    `
      select id
      from flat_residents
      where flat_id = $1
        and user_id = $2
        and is_active = true
      limit 1
    `,
    [flatId, authMe.user.id],
  )

  if (!result.rows[0]) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You cannot raise a ticket for this flat.',
    })
  }
}

const assertAssigneeInDepartment = async (
  client: PoolClient,
  societyId: string,
  departmentId: string,
  assigneeUserId?: string | null,
) => {
  if (!assigneeUserId) {
    return
  }

  const result = await client.query<{ id: string }>(
    `
      select u.id
      from users u
      inner join service_staff_assignments ssa on ssa.user_id = u.id
      where u.id = $1
        and u.society_id = $2
        and u.role = 'SERVICE_STAFF'
        and u.is_active = true
        and ssa.department_id = $3
        and ssa.is_active = true
      limit 1
    `,
    [assigneeUserId, societyId, departmentId],
  )

  if (!result.rows[0]) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The assignee must be active service staff in the selected department.',
    })
  }
}

const warnNotificationFailure = (serviceRequestId: string, error: unknown) => {
  const message = error instanceof Error ? error.message : 'Service request notification enqueue failed.'
  console.warn(JSON.stringify({ level: 'warn', message, serviceRequestId }))
}

const logServiceRequestNotificationQueueResult = (
  serviceRequestId: string,
  scope: 'resident' | 'manager',
  result: { eventId: string | null, audienceCount: number, jobCount: number },
) => {
  if (result.eventId && result.jobCount > 0) {
    return
  }

  console.warn(JSON.stringify({
    level: 'warn',
    message: 'Service request notification queued zero jobs.',
    serviceRequestId,
    notificationScope: scope,
    eventId: result.eventId,
    audienceCount: result.audienceCount,
    jobCount: result.jobCount,
  }))
}

type ServiceRequestNotificationQueueResult = {
  eventId: string | null
  audienceCount: number
  jobCount: number
}

const processImmediateServiceRequestNotifications = async (
  client: PoolClient,
  serviceRequestId: string,
  results: PromiseSettledResult<ServiceRequestNotificationQueueResult>[],
) => {
  const eventIds = new Set<string>()

  for (const result of results) {
    if (result.status === 'rejected') {
      warnNotificationFailure(serviceRequestId, result.reason)
      continue
    }

    if (result.value.eventId && result.value.jobCount > 0) {
      eventIds.add(result.value.eventId)
    }
  }

  if (eventIds.size === 0) {
    return
  }

  const allowedEvents = await client.query<{ id: string }>(
    `
      select id
      from notification_events
      where id = any($1::uuid[])
        and event_key = 'service_request.updated'
        and source_table = 'service_requests'
        and source_id = $2
    `,
    [[...eventIds], serviceRequestId],
  )
  const allowedEventIds = new Set(allowedEvents.rows.map((row) => row.id))

  for (const eventId of eventIds) {
    if (!allowedEventIds.has(eventId)) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Skipped immediate notification dispatch for non-service-request event.',
        serviceRequestId,
        eventId,
      }))
      continue
    }

    try {
      const dispatchResult = await dispatchNotificationJobs(client, {
        eventId,
        limit: 50,
        lockTimeoutMinutes: 1,
      })

      if (dispatchResult.failed > 0 || dispatchResult.retried > 0 || dispatchResult.claimed === 0) {
        console.warn(JSON.stringify({
          level: 'warn',
          message: 'Service request notification dispatch completed with pending or failed jobs.',
          serviceRequestId,
          eventId,
          ...dispatchResult,
        }))
      }
    } catch (error) {
      warnNotificationFailure(serviceRequestId, error)
    }
  }
}

const mergeNotificationUsers = (groups: NotificationUser[][]) => {
  const usersById = new Map<string, NotificationUser>()

  for (const group of groups) {
    for (const user of group) {
      const existing = usersById.get(user.id)

      if (!existing) {
        usersById.set(user.id, user)
        continue
      }

      usersById.set(user.id, {
        ...existing,
        email: existing.email ?? user.email,
        mobileNumber: existing.mobileNumber ?? user.mobileNumber,
        whatsappNumber: existing.whatsappNumber ?? user.whatsappNumber,
        pushEnabled: existing.pushEnabled || user.pushEnabled,
        emailEnabled: existing.emailEnabled || user.emailEnabled,
        whatsappEnabled: existing.whatsappEnabled || user.whatsappEnabled,
        inAppEnabled: existing.inAppEnabled || user.inAppEnabled,
        isActive: existing.isActive ?? user.isActive ?? true,
      })
    }
  }

  return [...usersById.values()]
}

const resolveServiceRequestResidentAudience = async (
  client: PoolClient,
  ticket: TicketNotificationRow,
) => {
  const audienceGroups: NotificationUser[][] = []

  if (ticket.flat_id) {
    audienceGroups.push(
      await resolveNotificationAudience(client, ticket.society_id, {
        scope: 'FLATS',
        flatIds: [ticket.flat_id],
      }),
    )
  }

  if (ticket.requester_user_id) {
    audienceGroups.push(
      await resolveNotificationAudience(client, ticket.society_id, {
        scope: 'USERS',
        userIds: [ticket.requester_user_id],
      }),
    )
  }

  return mergeNotificationUsers(audienceGroups)
}

const resolveActivePushSubscriberIds = async (
  client: PoolClient,
  users: NotificationUser[],
) => {
  if (users.length === 0) {
    return new Set<string>()
  }

  const result = await client.query<{ user_id: string }>(
    `
      select distinct user_id
      from push_subscriptions
      where user_id = any($1::uuid[])
        and status = 'ACTIVE'
    `,
    [users.map((user) => user.id)],
  )

  return new Set(result.rows.map((row) => row.user_id))
}

const markPushUnavailableWithoutSubscription = async (
  client: PoolClient,
  users: NotificationUser[],
) => {
  const activePushSubscriberIds = await resolveActivePushSubscriberIds(client, users)

  return users.map((user) => ({
    ...user,
    pushEnabled: user.pushEnabled && activePushSubscriberIds.has(user.id),
  }))
}

const enqueueServiceRequestNotification = async (
  serviceRequestId: string,
  input: {
    title: string
    body: string
    idempotencyKey: string
    triggeredByUserId?: string
  },
  options?: {
    dbClient?: PoolClient
  },
) => {
  const client = options?.dbClient ?? await getDatabasePool().connect()
  const shouldReleaseClient = !options?.dbClient

  try {
    const result = await client.query<TicketNotificationRow>(
      `
        select
          id,
          society_id,
          requester_user_id,
          flat_id,
          request_number,
          title,
          status::text,
          priority::text
        from service_requests
        where id = $1
        limit 1
      `,
      [serviceRequestId],
    )
    const ticket = result.rows[0]

    if (!ticket) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Service request notification skipped because ticket was not found.',
        serviceRequestId,
        notificationScope: 'resident',
      }))
      return { eventId: null, audienceCount: 0, jobCount: 0 }
    }

    const users = await markPushUnavailableWithoutSubscription(
      client,
      (await resolveServiceRequestResidentAudience(client, ticket))
        .filter((user) => user.id !== input.triggeredByUserId),
    )

    if (users.length === 0) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Service request notification skipped because no resident recipients were resolved.',
        serviceRequestId,
        notificationScope: 'resident',
        flatId: ticket.flat_id,
        requesterUserId: ticket.requester_user_id,
        triggeredByUserId: input.triggeredByUserId ?? null,
      }))
      return { eventId: null, audienceCount: 0, jobCount: 0 }
    }

    const queued = await enqueueNotificationForUsers(client, {
      societyId: ticket.society_id,
      eventKey: 'service_request.updated',
      category: 'SERVICE_REQUESTS',
      sourceTable: 'service_requests',
      sourceId: ticket.id,
      priority: ticket.priority === 'EMERGENCY' ? 'HIGH' : 'MEDIUM',
      title: input.title,
      body: input.body,
      payload: {
        serviceRequestId: ticket.id,
        requestNumber: ticket.request_number,
        ticketNumber: ticket.request_number,
        status: ticket.status,
        ticketTitle: ticket.title,
        deepLinkUrl: `/my/service-requests/${ticket.id}`,
      },
      idempotencyKey: input.idempotencyKey,
      idempotencyWindowSeconds: 31536000,
      ...(input.triggeredByUserId ? { triggeredByUserId: input.triggeredByUserId } : {}),
      users,
      channels: ['PUSH', 'EMAIL', 'IN_APP'],
      audienceLabel: 'Service request flat owners and requester',
      audienceSnapshot: {
        eventKey: 'service_request.updated',
        serviceRequestId: ticket.id,
        recipientScope: ticket.flat_id ? 'FLAT_RESIDENTS_AND_REQUESTER' : 'REQUESTER',
      },
    })

    logServiceRequestNotificationQueueResult(serviceRequestId, 'resident', queued)
    return queued
  } finally {
    if (shouldReleaseClient) {
      client.release()
    }
  }
}

const enqueueServiceRequestManagerNotification = async (
  serviceRequestId: string,
  input?: {
    title: string
    body: string
    idempotencyKey: string
    triggeredByUserId?: string
  },
  options?: {
    dbClient?: PoolClient
  },
) => {
  const client = options?.dbClient ?? await getDatabasePool().connect()
  const shouldReleaseClient = !options?.dbClient

  try {
    const result = await client.query<ManagerTicketNotificationRow>(
      `
        select
          sr.id,
          sr.society_id,
          sr.requester_user_id,
          sr.flat_id,
          sr.request_number,
          sr.title,
          sr.status::text,
          sr.priority::text,
          requester.full_name as requester_name,
          case when f.id is not null then concat(b.name, ' ', f.flat_number) else null end as flat_label
        from service_requests sr
        left join users requester on requester.id = sr.requester_user_id
        left join flats f on f.id = sr.flat_id
        left join blocks b on b.id = f.block_id
        where sr.id = $1
        limit 1
      `,
      [serviceRequestId],
    )
    const ticket = result.rows[0]

    if (!ticket) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Service request notification skipped because ticket was not found.',
        serviceRequestId,
        notificationScope: 'manager',
      }))
      return { eventId: null, audienceCount: 0, jobCount: 0 }
    }

    const managerResult = await client.query<{ id: string }>(
      `
        select id
        from users
        where society_id = $1
          and role in ('ADMIN', 'MANAGER', 'SERVICE_STAFF')
          and is_active = true
          and can_login = true
          and deleted_at is null
          and (
            role = 'ADMIN'
            or cardinality(staff_permissions) = 0
            or 'service-requests.manage' = any(staff_permissions)
          )
          and ($2::uuid is null or id <> $2::uuid)
        order by role asc, full_name asc
      `,
      [ticket.society_id, input?.triggeredByUserId ?? null],
    )
    const managerIds = managerResult.rows.map((row) => row.id)

    if (managerIds.length === 0) {
      console.warn(JSON.stringify({
        level: 'warn',
        message: 'Service request notification skipped because no manager recipients were resolved.',
        serviceRequestId,
        notificationScope: 'manager',
        triggeredByUserId: input?.triggeredByUserId ?? null,
      }))
      return { eventId: null, audienceCount: 0, jobCount: 0 }
    }

    const users = await markPushUnavailableWithoutSubscription(
      client,
      await resolveNotificationAudience(client, ticket.society_id, {
        scope: 'USERS',
        userIds: managerIds,
      }),
    )
    const requesterLabel = ticket.requester_name ?? 'A resident'
    const locationLabel = ticket.flat_label ? ` for ${ticket.flat_label}` : ''
    const title = input?.title ?? 'New service request'
    const body =
      input?.body ??
      `${requesterLabel} raised ${ticket.request_number}${locationLabel}: ${ticket.title}.`

    const queued = await enqueueNotificationForUsers(client, {
      societyId: ticket.society_id,
      eventKey: 'service_request.updated',
      category: 'SERVICE_REQUESTS',
      sourceTable: 'service_requests',
      sourceId: ticket.id,
      priority: ticket.priority === 'EMERGENCY' ? 'HIGH' : 'MEDIUM',
      title,
      body,
      payload: {
        serviceRequestId: ticket.id,
        requestNumber: ticket.request_number,
        ticketNumber: ticket.request_number,
        status: ticket.status,
        ticketTitle: ticket.title,
        deepLinkUrl: `/admin/service-requests/${ticket.id}`,
        actionLabel: 'Open service request',
      },
      idempotencyKey: input?.idempotencyKey ?? `service_request.manager.created:${ticket.id}`,
      idempotencyWindowSeconds: 31536000,
      ...(input?.triggeredByUserId ? { triggeredByUserId: input.triggeredByUserId } : {}),
      users,
      channels: ['PUSH', 'EMAIL', 'IN_APP'],
      audienceLabel: 'Service request managers',
      audienceSnapshot: {
        eventKey: 'service_request.updated',
        serviceRequestId: ticket.id,
        recipientScope: 'ADMIN_AND_MANAGER',
      },
    })

    logServiceRequestNotificationQueueResult(serviceRequestId, 'manager', queued)
    return queued
  } finally {
    if (shouldReleaseClient) {
      client.release()
    }
  }
}

export const createServiceRequest = async (
  authMe: AuthMe,
  input: z.infer<typeof serviceRequestCreateSchema>,
  mode: 'resident' | 'admin' | 'service',
) => {
  if (input.priority === 'EMERGENCY' && !input.emergencyConfirmed) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Emergency priority must be confirmed before creating the ticket.',
    })
  }

  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const flatId = input.locationType === 'FLAT' ? input.flatId : null
    if (input.locationType === 'FLAT' && !flatId) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Choose a flat for flat-linked tickets.',
      })
    }

    if (mode === 'resident' && flatId) {
      await assertFlatAccessForResident(client, authMe, flatId)
    }

    if (input.locationType !== 'FLAT' && !input.areaName && !input.assetReference) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Add area or asset details for non-flat tickets.',
      })
    }

    const route = await resolveRoute(client, authMe.user.societyId, input.category, input.locationType)
    const departmentId = input.departmentId ?? route?.department_id ?? null
    const priority = input.priority ?? route?.default_priority ?? 'MEDIUM'
    await assertAssigneeInDepartment(client, authMe.user.societyId, departmentId ?? '', input.assigneeUserId)

    const sla = await resolveSla(client, authMe.user.societyId, priority, departmentId)
    const year = new Date().getFullYear()
    const sequence = await client.query<{ value: string }>(
      `select next_yearly_sequence('SERVICE_REQUEST', $1)::text as value`,
      [year],
    )
    const requestNumber = `SR-${year}-${String(sequence.rows[0]?.value ?? '1').padStart(5, '0')}`
    const status: ServiceRequestStatus = input.assigneeUserId ? 'ASSIGNED' : 'OPEN'
    const sourceType =
      mode === 'resident'
        ? 'RESIDENT_REQUEST'
        : mode === 'service'
          ? 'STAFF_REPORTED'
          : input.sourceType
    const visibility = sourceType === 'ADMIN_CREATED' ? 'INTERNAL_ONLY' : 'RESIDENT_VISIBLE'

    const ticket = await client.query<{ id: string }>(
      `
        insert into service_requests (
          society_id,
          request_number,
          requester_user_id,
          flat_id,
          department_id,
          assignee_user_id,
          category,
          title,
          description,
          source_type,
          location_type,
          area_name,
          asset_reference,
          priority,
          status,
          visibility,
          first_response_due_at,
          due_by_at
        )
        values (
          $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15,
          $16,
          case when $17::integer is null then null else now() + make_interval(mins => $17::integer) end,
          case when $18::integer is null then null else now() + make_interval(mins => $18::integer) end
        )
        returning id
      `,
      [
        authMe.user.societyId,
        requestNumber,
        input.requesterUserId ?? authMe.user.id,
        flatId,
        departmentId,
        input.assigneeUserId ?? null,
        input.category,
        input.title,
        input.description,
        sourceType,
        input.locationType,
        input.areaName ?? null,
        input.assetReference ?? null,
        priority,
        status,
        visibility,
        sla?.acknowledge_within_minutes ?? null,
        sla?.resolve_within_minutes ?? null,
      ],
    )

    const id = ticket.rows[0]?.id
    if (!id) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'Ticket creation failed.',
      })
    }

    await client.query(
      `
        insert into service_request_events (
          service_request_id,
          event_type,
          actor_user_id,
          visibility,
          to_status,
          metadata
        )
        values ($1, 'CREATED', $2, 'RESIDENT_VISIBLE', $3, $4)
      `,
      [
        id,
        authMe.user.id,
        status,
        {
          requestNumber,
          preferredVisitTime: input.preferredVisitTime ?? null,
          sourceType,
        },
      ],
    )

    if (departmentId) {
      await client.query(
        `
          insert into service_request_assignments (
            service_request_id,
            department_id,
            assignee_user_id,
            assigned_by_user_id,
            notes
          )
          values ($1, $2, $3, $4, $5)
        `,
        [id, departmentId, input.assigneeUserId ?? null, authMe.user.id, 'Initial routing'],
      )
    }

    await client.query('commit')
    try {
      const notifications = await Promise.allSettled([
        enqueueServiceRequestNotification(
          id,
          {
            title: 'Service request created',
            body: `${requestNumber} has been created and is currently ${status.replaceAll('_', ' ').toLowerCase()}.`,
            idempotencyKey: `service_request.created:${id}`,
          },
          { dbClient: client },
        ),
        mode !== 'admin'
          ? enqueueServiceRequestManagerNotification(id, undefined, { dbClient: client })
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
      ])

      await processImmediateServiceRequestNotifications(client, id, notifications)
    } catch (notificationError) {
      warnNotificationFailure(id, notificationError)
    }
    return { id, requestNumber }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const listServiceRequests = async (event: H3Event, authMe: AuthMe, scope: TicketScope) => {
  const query = parseListQuery(event)
  const pool = getDatabasePool()
  const values: unknown[] = [authMe.user.societyId]
  const where = scopeWhere(scope, authMe, values)

  if (query.search) {
    values.push(`%${query.search}%`)
    where.push(`(
      sr.request_number ilike $${values.length}
      or sr.title ilike $${values.length}
      or sr.description ilike $${values.length}
      or sr.category ilike $${values.length}
      or coalesce(requester.full_name, '') ilike $${values.length}
      or coalesce(f.flat_number, '') ilike $${values.length}
      or coalesce(sr.area_name, '') ilike $${values.length}
      or coalesce(sr.asset_reference, '') ilike $${values.length}
    )`)
  }

  applyTicketFilters(query.filters, where, values)

  const whereSql = where.join(' and ')
  const orderBy = sortColumns[query.sortBy ?? 'createdAt'] ?? 'sr.created_at'
  const direction = query.sortDirection === 'asc' ? 'asc' : 'desc'
  const listValues = [...values, query.pageSize, (query.page - 1) * query.pageSize]

  const [dataResult, countResult] = await Promise.all([
    pool.query<TicketRow>(
      `
        ${ticketSelectSql}
        where ${whereSql}
        order by
          case when sr.priority = 'EMERGENCY' and sr.status not in ('RESOLVED', 'CLOSED', 'CANCELLED') then 0 else 1 end,
          case when sr.due_by_at < now() and sr.status not in ('RESOLVED', 'CLOSED', 'CANCELLED') then 0 else 1 end,
          ${orderBy} ${direction},
          sr.created_at desc
        limit $${listValues.length - 1}
        offset $${listValues.length}
      `,
      listValues,
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from service_requests sr
        left join users requester on requester.id = sr.requester_user_id
        left join flats f on f.id = sr.flat_id
        where ${whereSql}
      `,
      values,
    ),
  ])

  return {
    items: dataResult.rows.map(mapTicket),
    total: Number(countResult.rows[0]?.count ?? 0),
    params: query,
  }
}

export const getServiceRequestDetail = async (authMe: AuthMe, id: string, scope: TicketScope): Promise<ServiceRequestDetail> => {
  const pool = getDatabasePool()
  const values: unknown[] = [authMe.user.societyId]
  const where = scopeWhere(scope, authMe, values)
  values.push(id)
  where.push(`sr.id = $${values.length}`)

  const ticketResult = await pool.query<TicketRow>(
    `
      ${ticketSelectSql}
      where ${where.join(' and ')}
      limit 1
    `,
    values,
  )

  const ticket = ticketResult.rows[0]
  if (!ticket) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Service request not found.',
    })
  }

  const visibilityFilter =
    scope === 'resident'
      ? "and (visibility = 'RESIDENT_VISIBLE' or visibility = 'SYSTEM')"
      : ''

  const [eventResult, commentResult, attachmentResult] = await Promise.all([
    pool.query<EventRow>(
      `
        select
          sre.id,
          sre.service_request_id,
          sre.event_type::text,
          sre.actor_user_id,
          actor.full_name as actor_name,
          sre.visibility::text as visibility,
          sre.from_status::text as from_status,
          sre.to_status::text as to_status,
          sre.metadata,
          sre.occurred_at::text
        from service_request_events sre
        left join users actor on actor.id = sre.actor_user_id
        where sre.service_request_id = $1 ${visibilityFilter}
        order by sre.occurred_at asc
      `,
      [ticket.id],
    ),
    pool.query<CommentRow>(
      `
        select
          src.id,
          src.service_request_id,
          src.author_user_id,
          author.full_name as author_name,
          src.visibility::text as visibility,
          src.comment_body,
          src.created_at::text
        from service_request_comments src
        left join users author on author.id = src.author_user_id
        where src.service_request_id = $1 ${scope === 'resident' ? "and src.visibility = 'RESIDENT_VISIBLE'" : ''}
        order by src.created_at asc
      `,
      [ticket.id],
    ),
    pool.query<AttachmentRow>(
      `
        select
          sra.id,
          sra.service_request_id,
          sra.uploaded_by_user_id,
          uploader.full_name as uploaded_by_name,
          sra.file_name,
          sra.file_path,
          sra.mime_type,
          sra.size_bytes,
          sra.checksum,
          sra.created_at::text
        from service_request_attachments sra
        left join users uploader on uploader.id = sra.uploaded_by_user_id
        where sra.service_request_id = $1
        order by sra.created_at asc
      `,
      [ticket.id],
    ),
  ])

  return {
    ...mapTicket(ticket),
    events: eventResult.rows.map<ServiceRequestEvent>((row) => ({
      id: row.id,
      serviceRequestId: row.service_request_id,
      eventType: row.event_type,
      actorUserId: row.actor_user_id,
      actorName: row.actor_name,
      visibility: row.visibility,
      fromStatus: row.from_status,
      toStatus: row.to_status,
      metadata: row.metadata,
      occurredAt: row.occurred_at,
    })),
    comments: commentResult.rows.map<ServiceRequestComment>((row) => ({
      id: row.id,
      serviceRequestId: row.service_request_id,
      authorUserId: row.author_user_id,
      authorName: row.author_name,
      visibility: row.visibility,
      commentBody: row.comment_body,
      createdAt: row.created_at,
    })),
    attachments: attachmentResult.rows.map((row) => ({
      id: row.id,
      serviceRequestId: row.service_request_id,
      uploadedByUserId: row.uploaded_by_user_id,
      uploadedByName: row.uploaded_by_name,
      fileName: row.file_name,
      filePath: row.file_path,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      checksum: row.checksum,
      downloadUrl: ticketAttachmentDownloadUrl(scope, ticket.id, row.id),
      createdAt: row.created_at,
    })),
  }
}

const loadTicketForAction = async (client: PoolClient, authMe: AuthMe, id: string, scope: TicketScope) => {
  const values: unknown[] = [authMe.user.societyId]
  const where = scopeWhere(scope, authMe, values)
  values.push(id)
  where.push(`sr.id = $${values.length}`)
  const result = await client.query<TicketRow>(
    `
      ${ticketSelectSql}
      where ${where.join(' and ')}
      limit 1
    `,
    values,
  )

  const ticket = result.rows[0]
  if (!ticket) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Service request not found.',
    })
  }

  return ticket
}

export const assignServiceRequest = async (
  authMe: AuthMe,
  id: string,
  input: z.infer<typeof serviceRequestAssignSchema>,
) => {
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const ticket = await loadTicketForAction(client, authMe, id, 'admin')

    if ((ticket.department_id || ticket.assignee_user_id) && !input.reason) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'A reason is required for reassignment or department changes.',
      })
    }

    await assertAssigneeInDepartment(client, authMe.user.societyId, input.departmentId, input.assigneeUserId)

    await client.query(
      `
        update service_request_assignments
        set unassigned_at = now()
        where service_request_id = $1 and unassigned_at is null
      `,
      [id],
    )

    await client.query(
      `
        insert into service_request_assignments (
          service_request_id,
          department_id,
          assignee_user_id,
          assigned_by_user_id,
          notes
        )
        values ($1, $2, $3, $4, $5)
      `,
      [id, input.departmentId, input.assigneeUserId ?? null, authMe.user.id, input.reason ?? 'Assignment updated'],
    )

    const nextStatus: ServiceRequestStatus =
      ticket.status === 'OPEN' || ticket.status === 'REOPENED' || ticket.status === 'NEEDS_REASSIGNMENT'
        ? 'ASSIGNED'
        : ticket.status as ServiceRequestStatus

    await client.query(
      `
        update service_requests
        set department_id = $2,
            assignee_user_id = $3,
            status = $4,
            updated_at = now()
        where id = $1
      `,
      [id, input.departmentId, input.assigneeUserId ?? null, nextStatus],
    )

    await client.query(
      `
        insert into service_request_events (
          service_request_id,
          event_type,
          actor_user_id,
          visibility,
          from_status,
          to_status,
          metadata
        )
        values ($1, $2, $3, 'SYSTEM', $4, $5, $6)
      `,
      [
        id,
        ticket.department_id || ticket.assignee_user_id ? 'REASSIGNED' : 'ASSIGNED',
        authMe.user.id,
        ticket.status,
        nextStatus,
        {
          fromDepartmentId: ticket.department_id,
          toDepartmentId: input.departmentId,
          fromAssigneeUserId: ticket.assignee_user_id,
          toAssigneeUserId: input.assigneeUserId ?? null,
          reason: input.reason ?? null,
        },
      ],
    )

    await client.query('commit')
    try {
      const notifications = await Promise.allSettled([
        enqueueServiceRequestNotification(
          id,
          {
            title: 'Service request assigned',
            body: `${ticket.request_number} has been assigned for service.`,
            idempotencyKey: `service_request.assigned:${id}:${Date.now()}`,
            triggeredByUserId: authMe.user.id,
          },
          { dbClient: client },
        ),
      ])
      await processImmediateServiceRequestNotifications(client, id, notifications)
    } catch (notificationError) {
      warnNotificationFailure(id, notificationError)
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

const allowedServiceStaffStatuses: ServiceRequestStatus[] = [
  'ACKNOWLEDGED',
  'IN_PROGRESS',
  'ON_HOLD',
  'RESOLVED',
  'NEEDS_REASSIGNMENT',
]

export const updateServiceRequestStatus = async (
  authMe: AuthMe,
  id: string,
  input: z.infer<typeof serviceRequestStatusSchema>,
  scope: TicketScope,
) => {
  if (scope === 'service' && !allowedServiceStaffStatuses.includes(input.status)) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Service staff cannot set this ticket status.',
    })
  }

  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const ticket = await loadTicketForAction(client, authMe, id, scope)
    const fromStatus = ticket.status as ServiceRequestStatus

    if (['CLOSED', 'CANCELLED'].includes(fromStatus) && input.status !== 'REOPENED') {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Closed or cancelled tickets can only be reopened.',
      })
    }

    if (input.status === 'RESOLVED' && !input.comment) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message: 'Add a resolution note before marking the ticket resolved.',
      })
    }

    await client.query(
      `
        update service_requests
        set status = $2::service_request_status,
            first_responded_at = case
              when first_responded_at is null
                and $2::service_request_status in ('ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'RESOLVED')
              then now()
              else first_responded_at
            end,
            acknowledged_at = case when $2::service_request_status = 'ACKNOWLEDGED' then coalesce(acknowledged_at, now()) else acknowledged_at end,
            resolved_at = case when $2::service_request_status = 'RESOLVED' then now() else resolved_at end,
            closed_at = case when $2::service_request_status = 'CLOSED' then now() else closed_at end,
            reopened_at = case when $2::service_request_status = 'REOPENED' then now() else reopened_at end,
            is_sla_breached = case
              when due_by_at is not null
                and due_by_at < now()
                and $2::service_request_status not in ('RESOLVED', 'CLOSED', 'CANCELLED')
              then true
              else is_sla_breached
            end,
            updated_at = now()
        where id = $1
      `,
      [id, input.status],
    )

    await client.query(
      `
        insert into service_request_events (
          service_request_id,
          event_type,
          actor_user_id,
          visibility,
          from_status,
          to_status,
          metadata
        )
        values ($1, $2, $3, 'RESIDENT_VISIBLE', $4, $5, $6)
      `,
      [
        id,
        input.status === 'RESOLVED'
          ? 'RESOLVED'
          : input.status === 'CLOSED'
            ? 'CLOSED'
            : input.status === 'REOPENED'
              ? 'REOPENED'
              : 'STATUS_CHANGED',
        authMe.user.id,
        fromStatus,
        input.status,
        {
          comment: input.comment ?? null,
          reason: input.reason ?? null,
        },
      ],
    )

    if (input.comment) {
      await client.query(
        `
          insert into service_request_comments (
            service_request_id,
            author_user_id,
            visibility,
            comment_body
          )
          values ($1, $2, $3, $4)
        `,
        [
          id,
          authMe.user.id,
          scope === 'resident' ? 'RESIDENT_VISIBLE' : 'RESIDENT_VISIBLE',
          input.comment,
        ],
      )
    }

    await client.query('commit')
    try {
      const statusBody = `${ticket.request_number} moved from ${fromStatus.replaceAll('_', ' ').toLowerCase()} to ${input.status.replaceAll('_', ' ').toLowerCase()}.`
      const notifications = await Promise.allSettled([
        scope === 'service'
          ? enqueueServiceRequestManagerNotification(
              id,
              {
                title: 'Service request status updated',
                body: `${authMe.user.fullName} updated ${statusBody}`,
                idempotencyKey: `service_request.manager.status:${id}:${input.status}:${Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
        scope !== 'resident'
          ? enqueueServiceRequestNotification(
              id,
              {
                title: 'Service request status updated',
                body: statusBody,
                idempotencyKey: `service_request.status:${id}:${input.status}:${Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : enqueueServiceRequestManagerNotification(
              id,
              {
                title: 'Service request status updated',
                body: `${authMe.user.fullName} updated ${statusBody}`,
                idempotencyKey: `service_request.manager.status:${id}:${input.status}:${Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            ),
      ])

      await processImmediateServiceRequestNotifications(client, id, notifications)
    } catch (notificationError) {
      warnNotificationFailure(id, notificationError)
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const addServiceRequestComment = async (
  authMe: AuthMe,
  id: string,
  input: z.infer<typeof serviceRequestCommentSchema>,
  scope: TicketScope,
) => {
  const visibility =
    scope === 'resident'
      ? 'RESIDENT_VISIBLE'
      : input.visibility

  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')
    const ticket = await loadTicketForAction(client, authMe, id, scope)

    const comment = await client.query<{ id: string }>(
      `
        insert into service_request_comments (
          service_request_id,
          author_user_id,
          visibility,
          comment_body
        )
        values ($1, $2, $3, $4)
        returning id
      `,
      [id, authMe.user.id, visibility, input.commentBody],
    )

    await client.query(
      `
        insert into service_request_events (
          service_request_id,
          event_type,
          actor_user_id,
          visibility,
          metadata
        )
        values ($1, 'COMMENT_ADDED', $2, $3, $4)
      `,
      [
        id,
        authMe.user.id,
        visibility,
        {
          commentId: comment.rows[0]?.id,
          visibility,
        },
      ],
    )

    await client.query('commit')
    try {
      const notifications = await Promise.allSettled([
        scope === 'resident' || scope === 'service'
          ? enqueueServiceRequestManagerNotification(
              id,
              {
                title: 'Service request note added',
                body: `${authMe.user.fullName} added a note to ${ticket.request_number}: ${ticket.title}.`,
                idempotencyKey: `service_request.manager.comment:${comment.rows[0]?.id ?? Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
        visibility === 'RESIDENT_VISIBLE' && scope !== 'resident'
          ? enqueueServiceRequestNotification(
              id,
              {
                title: 'Service request note added',
                body: `A new update was added to ${ticket.request_number}.`,
                idempotencyKey: `service_request.comment:${comment.rows[0]?.id ?? Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
      ])

      await processImmediateServiceRequestNotifications(client, id, notifications)
    } catch (notificationError) {
      warnNotificationFailure(id, notificationError)
    }

    return comment.rows[0]?.id
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const createServiceRequestAttachment = async (
  authMe: AuthMe,
  id: string,
  input: z.infer<typeof serviceRequestAttachmentSchema>,
  scope: TicketScope,
) => {
  const pool = getDatabasePool()
  const client = await pool.connect()
  let ticket: TicketRow | null = null
  let attachmentId: string | null = null

  try {
    await client.query('begin')
    ticket = await loadTicketForAction(client, authMe, id, scope)

    const attachment = await client.query<{ id: string }>(
      `
        insert into service_request_attachments (
          service_request_id,
          uploaded_by_user_id,
          file_name,
          file_path,
          mime_type,
          size_bytes,
          checksum
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning id
      `,
      [id, authMe.user.id, input.fileName, input.filePath, input.mimeType, input.sizeBytes, input.checksum ?? null],
    )
    attachmentId = attachment.rows[0]?.id ?? null

    await client.query(
      `
        insert into service_request_events (
          service_request_id,
          event_type,
          actor_user_id,
          visibility,
          metadata
        )
        values ($1, 'ATTACHMENT_ADDED', $2, 'RESIDENT_VISIBLE', $3)
      `,
      [
        id,
        authMe.user.id,
        {
          attachmentId: attachment.rows[0]?.id,
          fileName: input.fileName,
        },
      ],
    )

    await client.query('commit')
    try {
      const notifications = await Promise.allSettled([
        scope === 'resident' || scope === 'service'
          ? enqueueServiceRequestManagerNotification(
              id,
              {
                title: 'Service request attachment added',
                body: `${authMe.user.fullName} attached ${input.fileName} to ${ticket.request_number}: ${ticket.title}.`,
                idempotencyKey: `service_request.manager.attachment:${attachmentId ?? Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
        scope !== 'resident'
          ? enqueueServiceRequestNotification(
              id,
              {
                title: 'Service request attachment added',
                body: `A new attachment was added to ${ticket.request_number}.`,
                idempotencyKey: `service_request.attachment:${attachmentId ?? Date.now()}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
      ])

      await processImmediateServiceRequestNotifications(client, id, notifications)
    } catch (notificationError) {
      warnNotificationFailure(id, notificationError)
    }
    return attachmentId
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const uploadServiceRequestAttachment = async (
  authMe: AuthMe,
  id: string,
  input: ServiceAttachmentUploadInput,
  scope: TicketScope,
): Promise<ServiceRequestAttachment> => {
  const pool = getDatabasePool()
  const client = await pool.connect()
  const storageObjectKey = createStorageObjectKey({
    recordType: 'service-request',
    recordId: id,
    fileName: input.fileName,
  })
  const checksum = createHash('sha256').update(input.body).digest('hex')
  let ticket: TicketRow | null = null

  try {
    await client.query('begin')
    ticket = await loadTicketForAction(client, authMe, id, scope)

    await uploadPrivateFile({
      storageTargetKey: 'ticket_attachments',
      storageObjectKey,
      originalFileName: input.fileName,
      mimeType: input.mimeType,
      sizeBytes: input.sizeBytes,
      body: input.body,
      uploadedBy: authMe.user.id,
      relation: {
        recordType: 'service_requests',
        recordId: id,
      },
      checksum,
    }, {
      dbClient: client,
    })

    const attachment = await client.query<AttachmentRow>(
      `
        insert into service_request_attachments (
          service_request_id,
          uploaded_by_user_id,
          file_name,
          file_path,
          mime_type,
          size_bytes,
          checksum
        )
        values ($1, $2, $3, $4, $5, $6, $7)
        returning
          id,
          service_request_id,
          uploaded_by_user_id,
          null::text as uploaded_by_name,
          file_name,
          file_path,
          mime_type,
          size_bytes,
          checksum,
          created_at::text
      `,
      [id, authMe.user.id, input.fileName, storageObjectKey, input.mimeType, input.sizeBytes, checksum],
    )
    const row = attachment.rows[0]

    if (!row) {
      throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'Attachment save failed.' })
    }

    await client.query(
      `
        insert into service_request_events (
          service_request_id,
          event_type,
          actor_user_id,
          visibility,
          metadata
        )
        values ($1, 'ATTACHMENT_ADDED', $2, 'RESIDENT_VISIBLE', $3)
      `,
      [
        id,
        authMe.user.id,
        {
          attachmentId: row?.id,
          fileName: input.fileName,
          storageObjectKey,
        },
      ],
    )

    await client.query('commit')

    try {
      const notifications = await Promise.allSettled([
        scope === 'resident' || scope === 'service'
          ? enqueueServiceRequestManagerNotification(
              id,
              {
                title: 'Service request attachment added',
                body: `${authMe.user.fullName} attached ${input.fileName} to ${ticket.request_number}: ${ticket.title}.`,
                idempotencyKey: `service_request.manager.attachment:${row.id}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
        scope !== 'resident'
          ? enqueueServiceRequestNotification(
              id,
              {
                title: 'Service request attachment added',
                body: `A new attachment was added to ${ticket.request_number}.`,
                idempotencyKey: `service_request.attachment:${row.id}`,
                triggeredByUserId: authMe.user.id,
              },
              { dbClient: client },
            )
          : Promise.resolve({ eventId: null, audienceCount: 0, jobCount: 0 }),
      ])

      await processImmediateServiceRequestNotifications(client, id, notifications)
    } catch (notificationError) {
      warnNotificationFailure(id, notificationError)
    }

    return {
      id: row.id,
      serviceRequestId: row.service_request_id,
      uploadedByUserId: row.uploaded_by_user_id,
      uploadedByName: authMe.user.fullName,
      fileName: row.file_name,
      filePath: row.file_path,
      mimeType: row.mime_type,
      sizeBytes: row.size_bytes,
      checksum: row.checksum,
      downloadUrl: ticketAttachmentDownloadUrl(scope, id, row.id),
      createdAt: row.created_at,
    }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const downloadServiceRequestAttachment = async (
  authMe: AuthMe,
  id: string,
  attachmentId: string,
  scope: TicketScope,
) => {
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await loadTicketForAction(client, authMe, id, scope)
    const result = await client.query<{
      file_name: string
      file_path: string
      mime_type: string
    }>(
      `
        select file_name, file_path, mime_type
        from service_request_attachments
        where id = $1 and service_request_id = $2
        limit 1
      `,
      [attachmentId, id],
    )
    const attachment = result.rows[0]
    if (!attachment) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Attachment not found.' })
    }

    const blob = await downloadPrivateFile({
      storageTargetKey: 'ticket_attachments',
      storageObjectKey: attachment.file_path,
    })

    return {
      fileName: attachment.file_name,
      mimeType: attachment.mime_type,
      buffer: Buffer.from(await blob.arrayBuffer()),
    }
  } finally {
    client.release()
  }
}

export const getServiceRequestQueueSummary = async (authMe: AuthMe, scope: TicketScope): Promise<ServiceRequestQueueSummary> => {
  const values: unknown[] = [authMe.user.societyId]
  const where = scopeWhere(scope, authMe, values)
  const whereSql = where.join(' and ')
  const pool = getDatabasePool()

  const [summaryResult, departmentResult] = await Promise.all([
    pool.query<{
      open: string
      unassigned: string
      overdue: string
      emergency: string
      reopened: string
      assigned_today: string
      department_queue: string
      in_progress: string
      resolved_today: string
    }>(
      `
        select
          count(*) filter (where sr.status = any($${values.length + 1}::service_request_status[]))::text as open,
          count(*) filter (where sr.assignee_user_id is null and sr.status = any($${values.length + 1}::service_request_status[]))::text as unassigned,
          count(*) filter (where sr.due_by_at < now() and sr.status = any($${values.length + 1}::service_request_status[]))::text as overdue,
          count(*) filter (where sr.priority = 'EMERGENCY' and sr.status = any($${values.length + 1}::service_request_status[]))::text as emergency,
          count(*) filter (where sr.status = 'REOPENED')::text as reopened,
          count(*) filter (where sr.assignee_user_id = $${values.length + 2} and sr.created_at::date = current_date)::text as assigned_today,
          count(*) filter (where sr.assignee_user_id is null and sr.status = any($${values.length + 1}::service_request_status[]))::text as department_queue,
          count(*) filter (where sr.status = 'IN_PROGRESS')::text as in_progress,
          count(*) filter (where sr.status = 'RESOLVED' and sr.resolved_at::date = current_date)::text as resolved_today
        from service_requests sr
        where ${whereSql}
      `,
      [...values, activeTicketStatuses, authMe.user.id],
    ),
    pool.query<{
      department_id: string | null
      department_name: string | null
      open_count: string
      overdue_count: string
    }>(
      `
        select
          sr.department_id,
          coalesce(sd.name, 'Unassigned') as department_name,
          count(*) filter (where sr.status = any($${values.length + 1}::service_request_status[]))::text as open_count,
          count(*) filter (where sr.due_by_at < now() and sr.status = any($${values.length + 1}::service_request_status[]))::text as overdue_count
        from service_requests sr
        left join service_departments sd on sd.id = sr.department_id
        where ${whereSql}
        group by sr.department_id, sd.name
        having count(*) filter (where sr.status = any($${values.length + 1}::service_request_status[])) > 0
        order by count(*) filter (where sr.status = any($${values.length + 1}::service_request_status[])) desc
      `,
      [...values, activeTicketStatuses],
    ),
  ])

  const summary = summaryResult.rows[0]

  return {
    open: Number(summary?.open ?? 0),
    unassigned: Number(summary?.unassigned ?? 0),
    overdue: Number(summary?.overdue ?? 0),
    emergency: Number(summary?.emergency ?? 0),
    reopened: Number(summary?.reopened ?? 0),
    assignedToday: Number(summary?.assigned_today ?? 0),
    departmentQueue: Number(summary?.department_queue ?? 0),
    inProgress: Number(summary?.in_progress ?? 0),
    resolvedToday: Number(summary?.resolved_today ?? 0),
    departmentBacklog: departmentResult.rows.map((row) => ({
      departmentId: row.department_id,
      departmentName: row.department_name ?? 'Unassigned',
      openCount: Number(row.open_count),
      overdueCount: Number(row.overdue_count),
    })),
  }
}
