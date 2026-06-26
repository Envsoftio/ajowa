import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { sendWebPushDebugNotification } from '~/server/utils/notifications'
import {
  getWebPushDebugDiagnostics,
  selectWebPushDebugOwner,
} from '~/server/utils/web-push-debug'

const schema = z.object({
  flatId: z.string().uuid(),
  ownerUserId: z.string().uuid().optional(),
  title: z.string().trim().min(3).max(120),
  body: z.string().trim().min(3).max(240),
  deepLinkUrl: z.string().trim().min(1).max(300).optional().default('/my/notifications'),
  respectNormalFlow: z.boolean().optional().default(true),
})

const blockedResult = (reason: string) => ({
  ok: false,
  providerName: 'WEB_PUSH',
  providerMessageId: null,
  reason,
  responseBody: {},
  permanentFailure: true,
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    const diagnostics = await getWebPushDebugDiagnostics(client, {
      societyId: authMe.user.societyId,
      flatId: body.flatId,
    })
    const owner = selectWebPushDebugOwner(diagnostics, body.ownerUserId)
    const hardStopReason = !owner.userActive
      ? 'The owner user account is inactive.'
      : !owner.canLogin
        ? 'The owner user account cannot log in.'
        : !owner.relationshipActive
          ? 'The owner relationship for this flat is inactive.'
          : null
    const normalFlowReason = owner.normalFlowEligibilityReasons[0] ?? null

    if (hardStopReason || (body.respectNormalFlow && normalFlowReason)) {
      return createApiSuccess(event, {
        attempted: false,
        flat: diagnostics.flat,
        owner,
        diagnostics,
        result: blockedResult(hardStopReason ?? normalFlowReason ?? 'Normal notification flow would skip this owner.'),
      })
    }

    const result = await sendWebPushDebugNotification(client, {
      societyId: authMe.user.societyId,
      targetUserId: owner.id,
      title: body.title,
      body: body.body,
      deepLinkUrl: body.deepLinkUrl,
      tag: `debug-web-push-${owner.id}`,
    })
    const refreshedDiagnostics = await getWebPushDebugDiagnostics(client, {
      societyId: authMe.user.societyId,
      flatId: body.flatId,
    })

    return createApiSuccess(event, {
      attempted: true,
      flat: refreshedDiagnostics.flat,
      owner: selectWebPushDebugOwner(refreshedDiagnostics, owner.id),
      diagnostics: refreshedDiagnostics,
      result: {
        ok: result.ok,
        providerName: result.providerName,
        providerMessageId: result.providerMessageId ?? null,
        reason: result.failureReason ?? null,
        responseBody: result.responseBody ?? {},
        permanentFailure: result.permanentFailure ?? false,
      },
    })
  } finally {
    client.release()
  }
})
