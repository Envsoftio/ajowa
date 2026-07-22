import { AppError } from '~/server/utils/errors'
import { getValidatedRuntimeConfig } from '~/server/utils/env'
import { getEventQuery, setEventHeader } from '~/server/utils/http-event'

const firstQueryValue = (value: string | string[] | undefined) =>
  Array.isArray(value) ? value[0] : value

export default defineEventHandler((event) => {
  const runtimeConfig = getValidatedRuntimeConfig()

  if (!runtimeConfig.whatsappWebhookVerifyToken) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'WhatsApp webhook verification is unavailable.',
    })
  }

  const query = getEventQuery(event)
  const mode = firstQueryValue(query['hub.mode'])
  const challenge = firstQueryValue(query['hub.challenge'])
  const verifyToken = firstQueryValue(query['hub.verify_token'])

  if (
    mode === 'subscribe' &&
    challenge &&
    verifyToken === runtimeConfig.whatsappWebhookVerifyToken
  ) {
    setEventHeader(event, 'content-type', 'text/plain; charset=utf-8')
    return challenge
  }

  throw new AppError({
    code: 'FORBIDDEN',
    statusCode: 403,
    message: 'Invalid WhatsApp webhook verification request.',
  })
})
