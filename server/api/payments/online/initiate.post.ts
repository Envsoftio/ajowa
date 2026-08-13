import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import {
  initiateOnlinePayment,
  onlinePaymentInitiateSchema,
} from '~/server/utils/online-payments'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const input = validateInput(
    onlinePaymentInitiateSchema,
    await readJsonBody(event),
  )
  const payment = await initiateOnlinePayment(input, authMe)

  return createApiSuccess(event, payment)
})
