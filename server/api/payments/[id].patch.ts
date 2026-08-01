import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { refreshMaintenanceReceiptJournalForPayment } from '~/server/utils/finance'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'
import {
  paymentUpdateSchema,
  updatePaymentWithClient,
} from '~/server/utils/payments'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const paymentId = readUuidParam(event)
  const input = validateInput(paymentUpdateSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    if (input.advanceCreditScope !== undefined) {
      const targetPayment = await client.query<{ id: string }>(
        `
          select id
          from payments
          where id = $1
            and society_id = $2
          for update
        `,
        [paymentId, authMe.user.societyId],
      )
      if (targetPayment.rows[0]) {
        const existingSourceCredits = await client.query<{ id: string }>(
          `
            select id
            from resident_advance_credits
            where source_payment_id = $1
            order by id asc
            for update
          `,
          [paymentId],
        )
        if (existingSourceCredits.rows.length > 0) {
          throw new AppError({
            code: 'CONFLICT',
            statusCode: 409,
            message:
              'An existing advance scope cannot be changed through payment editing. Use the dedicated DG advance classification action for an eligible unused legacy advance.',
          })
        }
      }
    }

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
