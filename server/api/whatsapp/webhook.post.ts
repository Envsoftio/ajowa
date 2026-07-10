import type { H3Event } from 'h3'
import { createApiSuccess } from '~/server/utils/api'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { getWhatsAppWebhookStatus } from '~/server/utils/env'
import { getEventHeader } from '~/server/utils/http-event'
import {
  processWhatsAppWebhookPayload,
  verifyWhatsAppWebhookSignature,
} from '~/server/utils/whatsapp'

const readRawBody = async (event: H3Event) =>
  await new Promise<string>((resolve, reject) => {
    const node = event.node
    if (!node) {
      resolve('')
      return
    }

    let body = ''
    node.req.setEncoding('utf8')
    node.req.on('data', (chunk: string) => {
      body += chunk
    })
    node.req.on('end', () => resolve(body))
    node.req.on('error', reject)
  })

export default defineEventHandler(async (event) => {
  const webhook = getWhatsAppWebhookStatus()

  if (!webhook.enabled) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: webhook.reason,
    })
  }

  const rawBody = await readRawBody(event)
  const signature = getEventHeader(event, 'x-hub-signature-256') ?? ''

  if (!verifyWhatsAppWebhookSignature(rawBody, signature, webhook.config.appSecret)) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 401,
      message: 'Invalid WhatsApp webhook signature.',
    })
  }

  let payload: unknown
  try {
    payload = JSON.parse(rawBody)
  } catch {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'WhatsApp webhook payload must be valid JSON.',
    })
  }

  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await processWhatsAppWebhookPayload(client, {
      payload,
      signature,
    })
    await client.query('commit')

    return createApiSuccess(event, result)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
