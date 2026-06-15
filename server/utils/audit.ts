import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import type { AuditAction, AuditEventContract, AuditSeverity } from '~/shared/audit'
import { getRequestLogger } from './logging'

const getHeaderValue = (event: H3Event, name: string) => {
  const lowerName = name.toLowerCase()
  const headers = event.req?.headers as Headers | undefined

  if (typeof headers?.get === 'function') {
    return headers.get(lowerName) ?? null
  }

  const nodeHeader = event.node?.req.headers?.[lowerName]

  if (Array.isArray(nodeHeader)) {
    return nodeHeader[0] ?? null
  }

  return typeof nodeHeader === 'string' ? nodeHeader : null
}

const normalizeMetadata = (value: AuditEventContract['metadata']) => value ?? {}

const normalizeJsonState = (value: AuditEventContract['beforeState']) => value ?? null

export const writeAuditEvent = async (
  client: PoolClient,
  event: H3Event,
  payload: AuditEventContract,
) => {
  const logger = getRequestLogger(event)
  const occurredAt = payload.occurredAt ?? new Date().toISOString()
  const insertResult = await client.query<{ id: string }>(
    `
      insert into audit_events (
        society_id,
        module,
        event_key,
        action,
        severity,
        actor_user_id,
        actor_auth_user_id,
        request_id,
        ip_address,
        user_agent,
        flat_id,
        target_user_id,
        metadata,
        before_state,
        after_state,
        occurred_at
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb, $14::jsonb, $15::jsonb, $16)
      returning id
    `,
    [
      payload.relatedEntities?.[0]?.entityTable === 'society_profile' ? payload.relatedEntities[0].entityId : null,
      payload.module,
      payload.eventKey,
      payload.action,
      payload.severity,
      payload.actorUserId ?? null,
      payload.actorAuthUserId ?? null,
      payload.requestId ?? logger.requestId,
      payload.ipAddress ?? getHeaderValue(event, 'x-forwarded-for'),
      payload.userAgent ?? getHeaderValue(event, 'user-agent'),
      payload.flatId ?? null,
      payload.targetUserId ?? null,
      JSON.stringify(normalizeMetadata(payload.metadata)),
      JSON.stringify(normalizeJsonState(payload.beforeState)),
      JSON.stringify(normalizeJsonState(payload.afterState)),
      occurredAt,
    ],
  )

  const auditEventId = insertResult.rows[0]?.id

  if (!auditEventId || !payload.relatedEntities?.length) {
    return
  }

  for (const entity of payload.relatedEntities) {
    await client.query(
      `
        insert into audit_event_entities (
          audit_event_id,
          entity_table,
          entity_id,
          entity_label
        )
        values ($1, $2, $3, $4)
      `,
      [auditEventId, entity.entityTable, entity.entityId, entity.entityLabel ?? null],
    )
  }
}

export const resolveAuditSeverity = (action: AuditAction): AuditSeverity => {
  if (action === 'DELETED' || action === 'STATE_CHANGED') {
    return 'HIGH'
  }

  return 'MEDIUM'
}
