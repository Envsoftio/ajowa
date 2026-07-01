import { requireActiveUser } from '~/server/utils/auth'
import { generatePaymentReceiptPdf } from '~/server/utils/payments'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const paymentId = String(event.context.params?.id ?? '')
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)
  const receipt = await generatePaymentReceiptPdf(paymentId, {
    societyId: authMe.user.societyId,
    userId: authMe.user.id,
    isStaff,
    allowLinkedFlatAccess: true,
  })

  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'content-disposition', `attachment; filename="${receipt.fileName}"`)

  return receipt.buffer
})
