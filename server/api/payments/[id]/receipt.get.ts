import { requireActiveUser } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'
import { readUuidParam } from '~/server/utils/master-data'
import { generatePaymentReceiptPdf, getPaymentReceiptData } from '~/server/utils/payments'
import { createPdfBuffer } from '~/server/utils/pdf'
import { createPrivateSignedUrl } from '~/server/utils/storage'

type ReceiptPayment = Awaited<ReturnType<typeof getPaymentReceiptData>>['payment']

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const sanitizeReceiptFileName = (receiptNumber: string) =>
  `${receiptNumber}.pdf`.replace(/[^a-z0-9._-]/gi, '-').replace(/"/g, '')

const formatMoney = (value: string | number | null | undefined) => {
  const amount = Number(value ?? 0)

  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(Number.isFinite(amount) ? amount : 0)
}

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

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

const createFallbackReceiptPdf = async (payment: ReceiptPayment) => {
  const flatLabel = [payment.block_name, payment.flat_number].filter(Boolean).join(' ') || '-'
  const reference = payment.utr_reference || payment.bank_reference || '-'

  return await createPdfBuffer({
    pageMargins: [36, 42, 36, 36],
    content: [
      { text: payment.society_name, style: 'brand' },
      { text: payment.society_address || '-', style: 'subtle' },
      { text: 'Payment Receipt', style: 'title' },
      {
        table: {
          widths: ['35%', '*'],
          body: [
            ['Receipt No', payment.receipt_number ?? '-'],
            ['Payment Date', formatDate(payment.payment_date)],
            ['Generated', formatDate(payment.receipt_generated_at)],
            ['Received From', payment.payer_name ?? '-'],
            ['Flat', flatLabel],
            ['Amount', formatMoney(payment.amount)],
            ['Mode', payment.transfer_kind ?? payment.mode],
            ['Reference', reference],
          ].map(([label, value]) => [
            { text: label, style: 'labelCell' },
            { text: value, style: 'valueCell' },
          ]),
        },
        layout: 'lightHorizontalLines',
        margin: [0, 14, 0, 16],
      },
      {
        text: 'This simplified receipt copy was generated from verified payment records.',
        style: 'footerNote',
      },
    ],
    styles: {
      brand: { fontSize: 14, color: '#0f766e', bold: true },
      title: { fontSize: 20, bold: true, color: '#2f4050', margin: [0, 14, 0, 4] },
      subtle: { fontSize: 8, color: '#6b7280', margin: [0, 3, 0, 0] },
      labelCell: { bold: true, fontSize: 9, color: '#4b5563', margin: [0, 4, 0, 4] },
      valueCell: { fontSize: 9, color: '#111827', margin: [0, 4, 0, 4] },
      footerNote: { fontSize: 8, color: '#6b7280', italics: true },
    },
    defaultStyle: { font: 'Roboto' },
  })
}

const createPendingReceiptPdf = async (paymentId: string) =>
  await createPdfBuffer({
    pageMargins: [36, 42, 36, 36],
    content: [
      { text: 'Payment Receipt', style: 'title' },
      {
        text: 'A receipt number has not been generated for this payment yet. Please refresh receipts and try again.',
        style: 'body',
      },
      { text: `Payment ID: ${paymentId}`, style: 'subtle' },
    ],
    styles: {
      title: { fontSize: 20, bold: true, color: '#2f4050', margin: [0, 0, 0, 12] },
      body: { fontSize: 10, color: '#111827', margin: [0, 0, 0, 12] },
      subtle: { fontSize: 8, color: '#6b7280' },
    },
    defaultStyle: { font: 'Roboto' },
  })

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
    const buffer = await createPendingReceiptPdf(paymentId).catch((error: unknown) =>
      throwReceiptUnavailable(error, paymentId),
    )

    setHeader(event, 'content-type', 'application/pdf')
    setHeader(event, 'cache-control', 'private, no-store')
    setHeader(event, 'content-disposition', 'attachment; filename="receipt-pending.pdf"')

    return buffer
  }

  const fileName = sanitizeReceiptFileName(payment.receipt_number)

  if (payment.receipt_file_path) {
    try {
      const signedUrl = await createPrivateSignedUrl({
        storageTargetKey: 'receipts',
        storageObjectKey: payment.receipt_file_path,
        expiresInSeconds: 60 * 5,
        download: fileName,
      })

      setHeader(event, 'cache-control', 'private, no-store')

      return sendRedirect(event, signedUrl, 302)
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

  const receipt = await generatePaymentReceiptPdf(paymentId, access).catch(async (error: unknown) => {
    if (error instanceof AppError) {
      throw error
    }

    console.warn(
      JSON.stringify({
        level: 'warn',
        message: getErrorMessage(error, 'Full receipt PDF generation failed.'),
        paymentId,
      }),
    )

    try {
      const buffer = await createFallbackReceiptPdf(payment)

      return {
        buffer,
        fileName,
      }
    } catch (fallbackError) {
      return throwReceiptUnavailable(fallbackError, paymentId)
    }
  })

  setHeader(event, 'content-type', 'application/pdf')
  setHeader(event, 'cache-control', 'private, no-store')
  setHeader(event, 'content-disposition', `attachment; filename="${receipt.fileName}"`)

  return receipt.buffer
})
