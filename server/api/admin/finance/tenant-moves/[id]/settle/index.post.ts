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
  settleTenantMoveCase,
  tenantDepositSettlementSchema,
} from '~/server/utils/tenant-moves'

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'finance.manage')
  const moveCaseId = z
    .string()
    .uuid()
    .parse(String(event.context.params?.id ?? ''))
  const input = validateInput(
    tenantDepositSettlementSchema,
    await readJsonBody(event),
  )
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await settleTenantMoveCase(client, {
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
      eventKey: 'finance.tenant_deposits.settled',
      afterState: { ...input, ...result },
      relatedEntities: [
        { entityTable: 'tenant_move_cases', entityId: moveCaseId },
        {
          entityTable: 'tenant_deposit_settlements',
          entityId: result.settlementId,
        },
        ...(result.journalId
          ? [{ entityTable: 'journal_entries', entityId: result.journalId }]
          : []),
        ...(result.incomeTransactionId
          ? [
              {
                entityTable: 'transactions',
                entityId: result.incomeTransactionId,
              },
            ]
          : []),
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
