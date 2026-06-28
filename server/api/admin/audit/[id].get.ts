import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'

type AuditDetailRow = {
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
  ip_address: string | null
  user_agent: string | null
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

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'society.manage')
  const id = readUuidParam(event)
  const result = await getDatabasePool().query<AuditDetailRow>(
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
        ae.ip_address,
        ae.user_agent,
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
      where ae.id = $1 and (ae.society_id = $2 or ae.society_id is null)
      limit 1
    `,
    [id, authMe.user.societyId],
  )
  const row = result.rows[0]

  if (!row) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Audit event not found.',
    })
  }

  return createApiSuccess(event, {
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
    ipAddress: row.ip_address,
    userAgent: row.user_agent,
    metadata: row.metadata ?? {},
    beforeState: row.before_state,
    afterState: row.after_state,
    entities: row.entities ?? [],
  })
})
