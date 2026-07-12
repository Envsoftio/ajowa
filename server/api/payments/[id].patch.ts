import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { refreshMaintenanceReceiptJournalForPayment } from '~/server/utils/finance'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'
import {
  paymentUpdateSchema,
  updatePaymentWithClient,
} from '~/server/utils/payments'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const paymentId = readUuidParam(event)
  const input = validateInput(paymentUpdateSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const result = await updatePaymentWithClient(client, {
      paymentId,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      changes: input,
    })
    const journal = result.changed
      ? await refreshMaintenanceReceiptJournalForPayment(client, {
          paymentId,
          societyId: authMe.user.societyId,
          bankAccountId: result.bankAccountId,
        })
      : null

    if (result.changed) {
      await writeMasterAudit({
        client,
        event,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'UPDATED',
        eventKey: 'payment.updated',
        beforeState: result.beforeState,
        afterState: {
          ...result.afterState,
          allocatedAmount: result.allocatedAmount,
          advanceAmount: result.advanceAmount,
          journalVoucherNumber: journal?.voucherNumber ?? null,
        },
        metadata: {
          paymentId,
          receiptInvalidated: result.receiptInvalidated,
        },
        relatedEntities: [{ entityTable: 'payments', entityId: paymentId }],
      })
    }

    await client.query('commit')

    return createApiSuccess(event, {
      ...result,
      journal,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
