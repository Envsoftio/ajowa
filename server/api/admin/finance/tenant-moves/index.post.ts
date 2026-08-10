import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { writeFinanceAudit } from '~/server/utils/finance'
import {
  createTenantMoveCase,
  tenantMoveCreateSchema,
} from '~/server/utils/tenant-moves'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.manage')
  const input = validateInput(tenantMoveCreateSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await createTenantMoveCase(client, {
      ...input,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
    })
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'finance.tenant_moves.created',
      afterState: input,
      relatedEntities: [
        { entityTable: 'tenant_move_cases', entityId: result.id },
        { entityTable: 'flat_residents', entityId: input.flatResidentId },
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
