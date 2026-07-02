import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { refreshMaintenanceReceiptJournalForPayment } from '~/server/utils/finance'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'
import {
  paymentAmountUpdateSchema,
  updatePaymentAmountWithClient,
} from '~/server/utils/payments'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const paymentId = readUuidParam(event)
  const input = validateInput(paymentAmountUpdateSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const result = await updatePaymentAmountWithClient(client, {
      paymentId,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      amount: input.amount,
    })
    const journal = result.changed
      ? await refreshMaintenanceReceiptJournalForPayment(client, {
          paymentId,
          societyId: authMe.user.societyId,
        })
      : null

    if (result.changed) {
      await writeMasterAudit({
        client,
        event,
        actorUserId: authMe.user.id,
        actorAuthUserId: authMe.authUser.id,
        action: 'UPDATED',
        eventKey: 'payment.amount_updated',
        beforeState: {
          amount: result.previousAmount,
        },
        afterState: {
          amount: result.amount,
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
