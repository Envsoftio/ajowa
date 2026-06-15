export const AUDIT_MODULES = [
  'AUTH',
  'MASTER',
  'BILLING',
  'PAYMENTS',
  'ACCESS',
  'FINANCE',
  'SERVICE',
  'NOTICE',
  'NOTIFICATION',
  'REPORT',
] as const

export const AUDIT_ACTIONS = [
  'CREATED',
  'UPDATED',
  'DELETED',
  'RESTORED',
  'STATE_CHANGED',
] as const

export const AUDIT_SEVERITIES = ['LOW', 'MEDIUM', 'HIGH', 'CRITICAL'] as const

export type AuditModule = (typeof AUDIT_MODULES)[number]
export type AuditAction = (typeof AUDIT_ACTIONS)[number]
export type AuditSeverity = (typeof AUDIT_SEVERITIES)[number]

export type AuditEventContract = {
  module: AuditModule
  eventKey: string
  action: AuditAction
  severity: AuditSeverity
  actorUserId?: string
  actorAuthUserId?: string
  targetUserId?: string
  flatId?: string
  requestId?: string
  ipAddress?: string
  userAgent?: string
  metadata?: Record<string, unknown>
  beforeState?: Record<string, unknown> | null
  afterState?: Record<string, unknown> | null
  relatedEntities?: Array<{
    entityTable: string
    entityId: string
    entityLabel?: string
  }>
  occurredAt?: string
}
