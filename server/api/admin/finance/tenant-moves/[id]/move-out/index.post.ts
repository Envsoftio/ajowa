import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { writeFinanceAudit } from '~/server/utils/finance'
import {
  recordTenantMoveOutInspection,
  tenantMoveInspectionSchema,
} from '~/server/utils/tenant-moves'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.manage')
  const moveCaseId = z
    .string()
    .uuid()
    .parse(String(event.context.params?.id ?? ''))
  const input = validateInput(
    tenantMoveInspectionSchema,
    await readJsonBody(event),
  )
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await recordTenantMoveOutInspection(client, {
      ...input,
      moveCaseId,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
    })
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'finance.tenant_moves.inspected',
      afterState: input,
      relatedEntities: [
        { entityTable: 'tenant_move_cases', entityId: moveCaseId },
        {
          entityTable: 'tenant_move_inspections',
          entityId: result.inspectionId,
        },
      ],
    })
    await client.query('commit')
    return createApiSuccess(event, result)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
