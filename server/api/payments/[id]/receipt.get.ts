import { requireActiveUser } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { generatePaymentReceiptPdf, getPaymentReceiptData } from '~/server/utils/payments'
import { downloadPrivateFile } from '~/server/utils/storage'

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const sanitizeReceiptFileName = (receiptNumber: string) =>
  `${receiptNumber}.pdf`.replace(/[^a-z0-9._-]/gi, '-').replace(/"/g, '')

const throwReceiptUnavailable = (error: unknown, paymentId: string): never => {
  console.warn(
    JSON.stringify({
      level: 'warn',
      message: getErrorMessage(error, 'Receipt attachment could not be opened.'),
      paymentId,
    }),
  )

  throw new AppError({
    code: 'CONFLICT',
    statusCode: 409,
    message: 'Receipt attachment is not available right now. Please try again later.',
  })
}

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const paymentId = readUuidParam(event)
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)
  const access = {
    societyId: authMe.user.societyId,
    userId: authMe.user.id,
    isStaff,
    allowLinkedFlatAccess: true,
  }

  const { payment } = await getPaymentReceiptData(paymentId, access).catch((error: unknown) => {
    if (error instanceof AppError) {
      throw error
    }

    return throwReceiptUnavailable(error, paymentId)
  })

  if (!payment.receipt_number) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'A receipt has not been generated for this payment yet.',
    })
  }

  const fileName = sanitizeReceiptFileName(payment.receipt_number)

  if (payment.receipt_file_path) {
    try {
      const blob = await downloadPrivateFile({
        storageTargetKey: 'receipts',
        storageObjectKey: payment.receipt_file_path,
      })

      setHeader(event, 'content-type', 'application/pdf')
      setHeader(event, 'cache-control', 'private, no-store')
      setHeader(event, 'content-disposition', `attachment; filename="${fileName}"`)

      return Buffer.from(await blob.arrayBuffer())
    } catch (error) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          message: getErrorMessage(error, 'Stored receipt PDF could not be opened.'),
          paymentId,
          receiptFilePath: payment.receipt_file_path,
        }),
      )
    }
  }

  const receipt = await generatePaymentReceiptPdf(paymentId, access).catch((error: unknown) => {
    if (error instanceof AppError) {
      throw error
    }

    return throwReceiptUnavailable(error, paymentId)
  })

  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `attachment; filename="${receipt.fileName}"`)

  return receipt.buffer
})
