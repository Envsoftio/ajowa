import { createPaginatedSuccess, getPaginationParams } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { AUDIT_ACTIONS, AUDIT_MODULES } from '~/shared/audit'

type AuditRow = {
  id: string
  occurred_at: string
  module: string
  event_key: string
  action: string
  severity: string
  actor_user_id: string | null
  actor_name: string | null
  actor_role: string | null
  target_user_id: string | null
  target_name: string | null
  request_id: string | null
  metadata: Record<string, unknown>
  before_state: Record<string, unknown> | null
  after_state: Record<string, unknown> | null
  entities: Array<{
    entityTable: string
    entityId: string
    entityLabel: string | null
  }> | null
}

const effectiveModuleSql = `
  case
    when ae.event_key like 'billing%' then 'BILLING'
    when ae.event_key like 'maintenance_due%' then 'BILLING'
    when ae.event_key like 'maintenance_dues%' then 'BILLING'
    when ae.event_key like 'cam_advance%' then 'BILLING'
    when ae.metadata->>'path' like '%/billing/%' then 'BILLING'
    when ae.event_key like 'finance.%' then 'FINANCE'
    when ae.metadata->>'path' like '%/finance/%' then 'FINANCE'
    when ae.event_key like 'access.%' then 'ACCESS'
    when ae.metadata->>'path' like '%/qr/%' then 'ACCESS'
    when ae.metadata->>'path' like '%/gate-log%' then 'ACCESS'
    when ae.metadata->>'path' like '%/auth/%' then 'AUTH'
    when ae.event_key like 'shared_report.%' then 'REPORT'
    when ae.metadata->>'path' like '%/reports/%' then 'REPORT'
    when ae.metadata->>'path' like '%/notifications/%' then 'NOTIFICATION'
    when ae.metadata->>'path' like '%/notices%' then 'NOTICE'
    when ae.metadata->>'path' like '%/service-requests/%' then 'SERVICE'
    else ae.module::text
  end
`

const sortColumns: Record<string, string> = {
  occurredAt: 'ae.occurred_at',
  module: effectiveModuleSql,
  action: 'ae.action::text',
  eventKey: 'ae.event_key',
  actorName: 'actor.full_name',
  actorRole: 'actor.role::text',
  severity: 'ae.severity::text',
}

const actorRoles = new Set(['ADMIN', 'MANAGER', 'SERVICE_STAFF', 'GUARD', 'RESIDENT'])

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'society.manage')
  const query = getQuerySafe(event)
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const search = String(query.search ?? '').trim()
  const module = String(query.module ?? '').trim().toUpperCase()
  const action = String(query.action ?? '').trim().toUpperCase()
  const actorRole = String(query.actorRole ?? '').trim().toUpperCase()
  const actorId = String(query.actorId ?? '').trim()
  const actorName = String(query.actorName ?? '').trim()
  const entityTable = String(query.entityTable ?? '').trim()
  const entityId = String(query.entityId ?? '').trim()
  const eventKey = String(query.eventKey ?? '').trim()
  const path = String(query.path ?? '').trim()
  const auditType = String(query.auditType ?? '').trim()
  const dateFrom = String(query.dateFrom ?? '').trim()
  const dateTo = String(query.dateTo ?? '').trim()
  const sortBy = String(query.sortBy ?? 'occurredAt')
  const sortDirection = String(query.sortDirection ?? 'desc') === 'asc' ? 'asc' : 'desc'
  const orderBy = sortColumns[sortBy] ?? sortColumns.occurredAt

  const params: unknown[] = [authMe.user.societyId]
  const filters = ['(ae.society_id = $1 or ae.society_id is null)']

  if (search) {
    params.push(`%${search}%`)
    filters.push(
      `(ae.event_key ilike $${params.length} or ae.action::text ilike $${params.length} or ${effectiveModuleSql} ilike $${params.length} or ae.severity::text ilike $${params.length} or actor.full_name ilike $${params.length} or target.full_name ilike $${params.length} or ae.metadata::text ilike $${params.length} or ae.request_id::text ilike $${params.length} or exists (select 1 from audit_event_entities aee_search where aee_search.audit_event_id = ae.id and (aee_search.entity_table ilike $${params.length} or aee_search.entity_label ilike $${params.length} or aee_search.entity_id::text ilike $${params.length})))`,
    )
  }

  if (AUDIT_MODULES.includes(module as (typeof AUDIT_MODULES)[number])) {
    params.push(module)
    filters.push(`${effectiveModuleSql} = $${params.length}`)
  }

  if (AUDIT_ACTIONS.includes(action as (typeof AUDIT_ACTIONS)[number])) {
    params.push(action)
    filters.push(`ae.action = $${params.length}`)
  }

  if (actorRoles.has(actorRole)) {
    params.push(actorRole)
    filters.push(`actor.role::text = $${params.length}`)
  }

  if (actorId) {
    params.push(actorId)
    filters.push(`ae.actor_user_id = $${params.length}`)
  }

  if (actorName) {
    params.push(`%${actorName}%`)
    filters.push(`actor.full_name ilike $${params.length}`)
  }

  if (entityTable) {
    params.push(entityTable)
    filters.push(`exists (select 1 from audit_event_entities aee_table where aee_table.audit_event_id = ae.id and aee_table.entity_table = $${params.length})`)
  }

  if (entityId) {
    params.push(entityId)
    filters.push(`exists (select 1 from audit_event_entities aee_id where aee_id.audit_event_id = ae.id and aee_id.entity_id = $${params.length})`)
  }

  if (eventKey) {
    params.push(`%${eventKey}%`)
    filters.push(`ae.event_key ilike $${params.length}`)
  }

  if (path) {
    params.push(`%${path}%`)
    filters.push(`ae.metadata->>'path' ilike $${params.length}`)
  }

  if (auditType === 'generic') {
    filters.push(`ae.metadata->>'generic' = 'true'`)
  } else if (auditType === 'domain') {
    filters.push(`coalesce(ae.metadata->>'generic', 'false') <> 'true'`)
  }

  if (dateFrom) {
    params.push(dateFrom)
    filters.push(`ae.occurred_at::date >= $${params.length}`)
  }

  if (dateTo) {
    params.push(dateTo)
    filters.push(`ae.occurred_at::date <= $${params.length}`)
  }

  const whereSql = filters.join(' and ')
  const pool = getDatabasePool()
  const [rowsResult, countResult] = await Promise.all([
    pool.query<AuditRow>(
      `
        select
          ae.id,
          ae.occurred_at::text,
          ${effectiveModuleSql} as module,
          ae.event_key,
          ae.action::text,
          ae.severity::text,
          ae.actor_user_id,
          actor.full_name as actor_name,
          actor.role::text as actor_role,
          ae.target_user_id,
          target.full_name as target_name,
          ae.request_id,
          ae.metadata,
          ae.before_state,
          ae.after_state,
          coalesce(entities.items, '[]'::json) as entities
        from audit_events ae
        left join users actor on actor.id = ae.actor_user_id
        left join users target on target.id = ae.target_user_id
        left join lateral (
          select json_agg(json_build_object(
            'entityTable', aee.entity_table,
            'entityId', aee.entity_id,
            'entityLabel', aee.entity_label
          ) order by aee.created_at) as items
          from audit_event_entities aee
          where aee.audit_event_id = ae.id
        ) entities on true
        where ${whereSql}
        order by ${orderBy} ${sortDirection}
        limit $${params.length + 1}
        offset $${params.length + 2}
      `,
      [...params, pagination.pageSize, offset],
    ),
    pool.query<{ count: string }>(
      `
        select count(*)::text as count
        from audit_events ae
        left join users actor on actor.id = ae.actor_user_id
        left join users target on target.id = ae.target_user_id
        where ${whereSql}
      `,
      params,
    ),
  ])

  const items = rowsResult.rows.map((row) => ({
    id: row.id,
    occurredAt: row.occurred_at,
    module: row.module,
    eventKey: row.event_key,
    action: row.action,
    severity: row.severity,
    actorUserId: row.actor_user_id,
    actorName: row.actor_name,
    actorRole: row.actor_role,
    targetUserId: row.target_user_id,
    targetName: row.target_name,
    requestId: row.request_id,
    metadata: row.metadata ?? {},
    beforeState: row.before_state,
    afterState: row.after_state,
    entities: row.entities ?? [],
  }))

  return createPaginatedSuccess(
    event,
    items,
    Number(countResult.rows[0]?.count ?? 0),
    pagination,
  )
})
