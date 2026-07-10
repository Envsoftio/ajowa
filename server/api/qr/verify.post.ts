import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { qrVerifySchema, verifyQrToken } from '~/server/utils/qr-access'
import { QR_SCAN_ROLES } from '~/shared/auth'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, QR_SCAN_ROLES)
  const body = validateInput(qrVerifySchema, await readJsonBody(event))
  const result = await verifyQrToken(body, authMe.user.id, authMe.user.societyId)

  return createApiSuccess(event, result)
})
