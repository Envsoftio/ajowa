import type { H3Event } from 'h3'
import { getOptionalAuth } from '~/server/utils/auth'
import {
  flushQueuedAuditEvents,
  resolveAuditActionFromMethod,
  resolveAuditModuleFromPath,
  writeAuditEventAsync,
} from '~/server/utils/audit'

const MUTATING_METHODS = new Set(['POST', 'PUT', 'PATCH', 'DELETE'])
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const getPath = (event: H3Event) => {
  const rawUrl = event.node?.req.url ?? event.path ?? '/'
  return new URL(rawUrl, 'http://localhost').pathname
}

const getRouteParams = (event: H3Event) =>
  ((event.context as { params?: Record<string, string | undefined> }).params ?? {})

const inferEntityTable = (path: string) => {
  const segments = path.split('/').filter(Boolean)
  const idIndex = segments.findIndex((segment) => UUID_PATTERN.test(segment))
  if (idIndex > 0) {
    return (segments[idIndex - 1] ?? 'api').replace(/-/g, '_')
  }

  const apiIndex = segments.indexOf('api')
  const meaningful = segments
    .slice(apiIndex >= 0 ? apiIndex + 1 : 0)
    .filter((segment) => !['admin', 'my', 'service'].includes(segment))

  return meaningful[0]?.replace(/-/g, '_') ?? 'api'
}

const getEntityId = (path: string, params: Record<string, string | undefined>) => {
  const paramId = params.id
  if (paramId && UUID_PATTERN.test(paramId)) {
    return paramId
  }

  return path.split('/').find((segment) => UUID_PATTERN.test(segment)) ?? null
}

export default defineNitroPlugin((nitroApp) => {
  nitroApp.hooks.hook('afterResponse', (event: H3Event) => {
    const method = event.method.toUpperCase()
    const path = getPath(event)
    const statusCode = event.node?.res?.statusCode ?? 200

    if (!path.startsWith('/api/') || !MUTATING_METHODS.has(method) || statusCode >= 400) {
      return
    }

    flushQueuedAuditEvents(event)

    const params = getRouteParams(event)
    const entityId = getEntityId(path, params)

    void getOptionalAuth(event).then((authMe) => {
      const module = resolveAuditModuleFromPath(path)
      const action = resolveAuditActionFromMethod(method)
      const relatedEntities = [
        ...(authMe?.user.societyId
          ? [{ entityTable: 'society_profile', entityId: authMe.user.societyId }]
          : []),
        ...(entityId ? [{ entityTable: inferEntityTable(path), entityId }] : []),
      ]

      writeAuditEventAsync(event, {
        module,
        eventKey: `api.${method.toLowerCase()}.${path.replace(/^\/api\/?/, '').replace(/[/:]+/g, '.')}`,
        action,
        severity: module === 'AUTH' || action === 'DELETED' ? 'HIGH' : 'MEDIUM',
        ...(authMe?.user.id ? { actorUserId: authMe.user.id } : {}),
        ...(authMe?.authUser.id ? { actorAuthUserId: authMe.authUser.id } : {}),
        metadata: {
          generic: true,
          method,
          path,
          statusCode,
          actorRole: authMe?.user.role ?? null,
          routeParams: params,
        },
        ...(relatedEntities.length ? { relatedEntities } : {}),
      })
    }).catch((error) => {
      console.error(JSON.stringify({
        level: 'error',
        message: 'Unable to prepare async mutation audit event.',
        error: error instanceof Error ? error.message : String(error),
      }))
    })
  })
})
