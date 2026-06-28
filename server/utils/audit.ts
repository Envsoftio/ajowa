import type { H3Event } from 'h3'
import type { PoolClient } from 'pg'
import type { AuditAction, AuditEventContract, AuditSeverity } from '~/shared/audit'
import { getDatabasePool } from './database'
import { getRequestLogger } from './logging'

const AUDIT_QUEUE_KEY = 'ajowa:audit-queue'

type AuditQueueContext = {
  [AUDIT_QUEUE_KEY]?: AuditEventContract[]
}

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

const enqueue = (task: () => Promise<void>) => {
  const run = () => {
    task().catch((error) => {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Async audit event failed.',
        error: error instanceof Error ? error.message : String(error),
      }))
    })
  }

  if (typeof setImmediate === 'function') {
    setImmediate(run)
    return
  }

  setTimeout(run, 0)
}

const writeAuditFailureEvent = async (
  client: PoolClient,
  event: H3Event,
  payload: AuditEventContract,
  error: unknown,
) => {
  await writeAuditEvent(client, event, {
    module: payload.module,
    eventKey: 'audit.write_failed',
    action: 'CREATED',
    severity: 'HIGH',
    ...(payload.actorUserId ? { actorUserId: payload.actorUserId } : {}),
    ...(payload.actorAuthUserId ? { actorAuthUserId: payload.actorAuthUserId } : {}),
    ...(payload.requestId ? { requestId: payload.requestId } : {}),
    ...(payload.ipAddress ? { ipAddress: payload.ipAddress } : {}),
    ...(payload.userAgent ? { userAgent: payload.userAgent } : {}),
    metadata: {
      originalModule: payload.module,
      originalEventKey: payload.eventKey,
      originalAction: payload.action,
      error: error instanceof Error ? error.message : String(error),
    },
  })
}

export const writeAuditEventAsync = (
  event: H3Event,
  payload: AuditEventContract,
) => {
  const logger = getRequestLogger(event)
  const requestId = payload.requestId ?? logger.requestId
  const ipAddress = payload.ipAddress ?? getHeaderValue(event, 'x-forwarded-for')
  const userAgent = payload.userAgent ?? getHeaderValue(event, 'user-agent')

  enqueue(async () => {
    const client = await getDatabasePool().connect()
    try {
      await writeAuditEvent(client, event, {
        ...payload,
        requestId,
        ...(ipAddress ? { ipAddress } : {}),
        ...(userAgent ? { userAgent } : {}),
      })
    } catch (error) {
      try {
        await writeAuditFailureEvent(client, event, {
          ...payload,
          requestId,
          ...(ipAddress ? { ipAddress } : {}),
          ...(userAgent ? { userAgent } : {}),
        }, error)
      } catch (failureError) {
        console.error(JSON.stringify({
          level: 'error',
          message: 'Async audit failure event could not be saved.',
          error: failureError instanceof Error ? failureError.message : String(failureError),
          originalError: error instanceof Error ? error.message : String(error),
        }))
      }
    } finally {
      client.release()
    }
  })
}

export const queueAuditEvent = (
  event: H3Event,
  payload: AuditEventContract,
) => {
  const context = event.context as AuditQueueContext
  context[AUDIT_QUEUE_KEY] ??= []
  context[AUDIT_QUEUE_KEY].push(payload)
}

export const flushQueuedAuditEvents = (event: H3Event) => {
  const context = event.context as AuditQueueContext
  const queued = context[AUDIT_QUEUE_KEY] ?? []
  context[AUDIT_QUEUE_KEY] = []

  for (const payload of queued) {
    writeAuditEventAsync(event, payload)
  }
}

export const resolveAuditModuleFromPath = (path: string): AuditEventContract['module'] => {
  if (path.includes('/finance')) return 'FINANCE'
  if (path.includes('/billing') || path.includes('/dues')) return 'BILLING'
  if (path.includes('/payments') || path.includes('/razorpay')) return 'PAYMENTS'
  if (path.includes('/qr') || path.includes('/gate-log')) return 'ACCESS'
  if (path.includes('/service-requests') || path.includes('/service/')) return 'SERVICE'
  if (path.includes('/notices')) return 'NOTICE'
  if (path.includes('/notifications')) return 'NOTIFICATION'
  if (path.includes('/reports')) return 'REPORT'
  if (path.includes('/auth')) return 'AUTH'
  return 'MASTER'
}

export const resolveAuditActionFromMethod = (method: string): AuditAction => {
  const normalized = method.toUpperCase()
  if (normalized === 'POST') return 'CREATED'
  if (normalized === 'DELETE') return 'DELETED'
  return 'UPDATED'
}

export const resolveAuditSeverity = (action: AuditAction): AuditSeverity => {
  if (action === 'DELETED' || action === 'STATE_CHANGED') {
    return 'HIGH'
  }

  return 'MEDIUM'
}
