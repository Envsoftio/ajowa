import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  classifyLegacyAdvanceCreditAsDgWithClient,
  dgAdvanceClassificationSchema,
} from '~/server/utils/dg-advance-classification'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const paymentId = readUuidParam(event, 'id')
  const creditId = readUuidParam(event, 'creditId')
  const input = validateInput(
    dgAdvanceClassificationSchema,
    await readJsonBody(event),
  )
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const result = await classifyLegacyAdvanceCreditAsDgWithClient(client, {
      societyId: authMe.user.societyId,
      paymentId,
      creditId,
      actorUserId: authMe.user.id,
      reason: input.reason,
    })

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'payment.advance_credit_classified_dg',
      beforeState: result.beforeState,
      afterState: result.afterState,
      metadata: {
        paymentId,
        creditId,
        reason: input.reason,
        amount: result.amount,
        receiptInvalidated: result.receiptInvalidated,
        financialValuesChanged: false,
        journalRefreshed: false,
      },
      targetUserId: result.userId,
      flatId: result.flatId,
      relatedEntities: [
        { entityTable: 'payments', entityId: paymentId },
        { entityTable: 'resident_advance_credits', entityId: creditId },
      ],
    })

    await client.query('commit')

    return createApiSuccess(event, {
      paymentId,
      creditId,
      applicableChargeType: 'DG_SET' as const,
      amount: result.amount,
      receiptInvalidated: result.receiptInvalidated,
      financialValuesChanged: false,
      journalRefreshed: false,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
