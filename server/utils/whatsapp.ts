import { createHash, createHmac, timingSafeEqual } from 'node:crypto'
import type { PoolClient } from 'pg'
import type { WhatsAppIntegrationConfig } from './env'

type JsonRecord = Record<string, unknown>

type NormalizedWhatsAppWebhookEvent = {
  eventId: string
  objectType: string | null
  entryId: string | null
  fieldName: string | null
  eventType: 'message' | 'status' | 'error' | 'change'
  providerMessageId: string | null
  phoneNumberId: string | null
  displayPhoneNumber: string | null
  waId: string | null
  status: string | null
  eventTimestamp: string | null
  payload: JsonRecord
}

export type WhatsAppWebhookProcessingResult = {
  received: number
  inserted: number
  duplicates: number
  statusUpdates: number
  ignored: number
}

export type MetaWhatsAppSendInput = {
  config: WhatsAppIntegrationConfig
  to: string
  templateName: string
  title: string
  body: string
  payload: Record<string, unknown>
}

export type MetaWhatsAppSendResult = {
  providerMessageId: string | null
  responseBody: Record<string, unknown>
}

const metaProviderNames = new Set(['META', 'META_CLOUD_API', 'WHATSAPP_CLOUD_API'])

const isRecord = (value: unknown): value is JsonRecord =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value)

const recordsFrom = (value: unknown): JsonRecord[] =>
  Array.isArray(value) ? value.filter(isRecord) : []

const stringFrom = (value: unknown) => {
  if (typeof value !== 'string') {
    return null
  }

  const trimmed = value.trim()
  return trimmed ? trimmed : null
}

const timestampFrom = (value: unknown) => {
  const raw = typeof value === 'number' ? String(value) : stringFrom(value)
  if (!raw) {
    return null
  }

  const seconds = Number(raw)
  if (!Number.isFinite(seconds) || seconds <= 0) {
    return null
  }

  return new Date(seconds * 1000).toISOString()
}

const hashValue = (value: unknown) =>
  createHash('sha256').update(JSON.stringify(value)).digest('hex')

const fallbackEventId = (prefix: string, parts: Array<string | null>, payload: unknown) =>
  `${prefix}:${parts.filter(Boolean).join(':')}:${hashValue(payload).slice(0, 32)}`

const metadataFrom = (value: JsonRecord) => {
  const metadata = isRecord(value.metadata) ? value.metadata : {}

  return {
    phoneNumberId: stringFrom(metadata.phone_number_id),
    displayPhoneNumber: stringFrom(metadata.display_phone_number),
  }
}

const firstContactWaId = (value: JsonRecord) => {
  const firstContact = recordsFrom(value.contacts)[0]
  return firstContact ? stringFrom(firstContact.wa_id) : null
}

const normalizeWhatsAppWebhookPayload = (payload: unknown): NormalizedWhatsAppWebhookEvent[] => {
  if (!isRecord(payload)) {
    return []
  }

  const objectType = stringFrom(payload.object)
  const events: NormalizedWhatsAppWebhookEvent[] = []

  for (const entry of recordsFrom(payload.entry)) {
    const entryId = stringFrom(entry.id)

    for (const change of recordsFrom(entry.changes)) {
      const fieldName = stringFrom(change.field)
      const value = isRecord(change.value) ? change.value : {}
      const { phoneNumberId, displayPhoneNumber } = metadataFrom(value)
      const contactWaId = firstContactWaId(value)
      let pushed = false

      for (const message of recordsFrom(value.messages)) {
        const messageId = stringFrom(message.id)
        const from = stringFrom(message.from) ?? contactWaId

        events.push({
          eventId: messageId
            ? `message:${messageId}`
            : fallbackEventId('message', [entryId, fieldName, from], message),
          objectType,
          entryId,
          fieldName,
          eventType: 'message',
          providerMessageId: messageId,
          phoneNumberId,
          displayPhoneNumber,
          waId: from,
          status: null,
          eventTimestamp: timestampFrom(message.timestamp),
          payload: message,
        })
        pushed = true
      }

      for (const status of recordsFrom(value.statuses)) {
        const statusId = stringFrom(status.id)
        const statusValue = stringFrom(status.status)
        const recipientId = stringFrom(status.recipient_id)

        events.push({
          eventId: statusId && statusValue
            ? `status:${statusId}:${statusValue}`
            : fallbackEventId('status', [entryId, fieldName, statusValue, recipientId], status),
          objectType,
          entryId,
          fieldName,
          eventType: 'status',
          providerMessageId: statusId,
          phoneNumberId,
          displayPhoneNumber,
          waId: recipientId,
          status: statusValue,
          eventTimestamp: timestampFrom(status.timestamp),
          payload: status,
        })
        pushed = true
      }

      recordsFrom(value.errors).forEach((error, index) => {
        const code = stringFrom(error.code)

        events.push({
          eventId: fallbackEventId('error', [entryId, fieldName, code ?? String(index)], error),
          objectType,
          entryId,
          fieldName,
          eventType: 'error',
          providerMessageId: null,
          phoneNumberId,
          displayPhoneNumber,
          waId: null,
          status: code,
          eventTimestamp: null,
          payload: error,
        })
        pushed = true
      })

      if (!pushed) {
        events.push({
          eventId: fallbackEventId('change', [entryId, fieldName], change),
          objectType,
          entryId,
          fieldName,
          eventType: 'change',
          providerMessageId: null,
          phoneNumberId,
          displayPhoneNumber,
          waId: null,
          status: null,
          eventTimestamp: null,
          payload: change,
        })
      }
    }
  }

  return events
}

export const isMetaWhatsAppProvider = (provider: string) =>
  metaProviderNames.has(provider.trim().toUpperCase())

export const verifyWhatsAppWebhookSignature = (
  rawBody: string,
  signatureHeader: string,
  appSecret: string,
) => {
  const signature = signatureHeader.trim()
  if (!signature.startsWith('sha256=')) {
    return false
  }

  const expectedHex = createHmac('sha256', appSecret).update(rawBody, 'utf8').digest('hex')
  const actualHex = signature.slice('sha256='.length)

  if (!/^[a-f0-9]{64}$/i.test(actualHex)) {
    return false
  }

  const expected = Buffer.from(expectedHex, 'hex')
  const actual = Buffer.from(actualHex, 'hex')

  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

const mapWebhookStatus = (status: string | null) => {
  switch (status?.toLowerCase()) {
    case 'sent':
      return 'SENT'
    case 'delivered':
      return 'DELIVERED'
    case 'read':
      return 'READ'
    case 'failed':
      return 'FAILED'
    default:
      return null
  }
}

const statusErrorCode = (payload: JsonRecord) => {
  const firstError = recordsFrom(payload.errors)[0]
  return firstError ? stringFrom(firstError.code) : null
}

const statusFailureReason = (payload: JsonRecord) => {
  const firstError = recordsFrom(payload.errors)[0]
  if (!firstError) {
    return null
  }

  return stringFrom(firstError.title) ??
    stringFrom(firstError.message) ??
    stringFrom(firstError.details) ??
    stringFrom(firstError.code) ??
    'WhatsApp message failed.'
}

const applyWhatsAppStatusUpdate = async (
  client: PoolClient,
  event: NormalizedWhatsAppWebhookEvent,
) => {
  const providerMessageId = event.providerMessageId
  const deliveryStatus = mapWebhookStatus(event.status)

  if (!providerMessageId || !deliveryStatus) {
    return 0
  }

  const failureReason = deliveryStatus === 'FAILED' ? statusFailureReason(event.payload) : null
  const errorCode = deliveryStatus === 'FAILED' ? statusErrorCode(event.payload) : null
  const result = await client.query<{ notification_job_id: string }>(
    `
      with updated as (
        update notification_jobs
        set status = case
              when $2::notification_job_status = 'FAILED'::notification_job_status then 'FAILED'::notification_job_status
              when $2::notification_job_status = 'READ'::notification_job_status then 'READ'::notification_job_status
              when $2::notification_job_status = 'DELIVERED'::notification_job_status
                and status <> 'READ'::notification_job_status then 'DELIVERED'::notification_job_status
              when $2::notification_job_status = 'SENT'::notification_job_status
                and status not in ('READ'::notification_job_status, 'DELIVERED'::notification_job_status) then 'SENT'::notification_job_status
              else status
            end,
            provider_name = coalesce(provider_name, 'META_CLOUD_API'),
            provider_message_id = coalesce(provider_message_id, $1),
            response_body = coalesce(response_body, '{}'::jsonb)
              || jsonb_build_object('lastWhatsAppWebhookStatus', $3::jsonb),
            failure_reason = case when $2::notification_job_status = 'FAILED'::notification_job_status then $4 else failure_reason end,
            error_code = case when $2::notification_job_status = 'FAILED'::notification_job_status then $5 else error_code end,
            permanent_failure = case when $2::notification_job_status = 'FAILED'::notification_job_status then true else permanent_failure end,
            sent_at = case
              when $2::notification_job_status in (
                'SENT'::notification_job_status,
                'DELIVERED'::notification_job_status,
                'READ'::notification_job_status
              ) then coalesce(sent_at, coalesce($6::timestamptz, now()))
              else sent_at
            end,
            delivered_at = case
              when $2::notification_job_status in (
                'DELIVERED'::notification_job_status,
                'READ'::notification_job_status
              ) then coalesce(delivered_at, coalesce($6::timestamptz, now()))
              else delivered_at
            end,
            read_at = case
              when $2::notification_job_status = 'READ'::notification_job_status then coalesce(read_at, coalesce($6::timestamptz, now()))
              else read_at
            end,
            updated_at = now()
        where channel = 'WHATSAPP'::notification_channel
          and provider_message_id = $1
        returning id, attempt_count
      )
      insert into notification_delivery_logs (
        notification_job_id,
        provider_name,
        provider_message_id,
        channel,
        status,
        attempt_number,
        response_body,
        failure_reason,
        delivered_at,
        read_at
      )
      select
        id,
        'META_CLOUD_API',
        $1,
        'WHATSAPP'::notification_channel,
        $2::delivery_status,
        greatest(attempt_count, 1),
        $3::jsonb,
        $4,
        case when $2::delivery_status in ('DELIVERED'::delivery_status, 'READ'::delivery_status) then coalesce($6::timestamptz, now()) else null end,
        case when $2::delivery_status = 'READ'::delivery_status then coalesce($6::timestamptz, now()) else null end
      from updated
      returning notification_job_id
    `,
    [
      providerMessageId,
      deliveryStatus,
      JSON.stringify(event.payload),
      failureReason,
      errorCode,
      event.eventTimestamp,
    ],
  )

  return result.rowCount ?? 0
}

export const processWhatsAppWebhookPayload = async (
  client: PoolClient,
  input: {
    payload: unknown
    signature: string
  },
): Promise<WhatsAppWebhookProcessingResult> => {
  const events = normalizeWhatsAppWebhookPayload(input.payload)
  const result: WhatsAppWebhookProcessingResult = {
    received: events.length,
    inserted: 0,
    duplicates: 0,
    statusUpdates: 0,
    ignored: 0,
  }

  for (const webhookEvent of events) {
    const stored = await client.query<{ id: string; processed_at: string | null }>(
      `
        insert into whatsapp_webhook_events (
          event_id,
          object_type,
          entry_id,
          field_name,
          event_type,
          provider_message_id,
          phone_number_id,
          display_phone_number,
          wa_id,
          status,
          event_timestamp,
          signature,
          raw_payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::timestamptz, $12, $13::jsonb)
        on conflict (event_id) do update
          set received_count = whatsapp_webhook_events.received_count + 1,
              last_received_at = now(),
              signature = excluded.signature,
              raw_payload = excluded.raw_payload,
              updated_at = now()
        returning id, processed_at
      `,
      [
        webhookEvent.eventId,
        webhookEvent.objectType,
        webhookEvent.entryId,
        webhookEvent.fieldName,
        webhookEvent.eventType,
        webhookEvent.providerMessageId,
        webhookEvent.phoneNumberId,
        webhookEvent.displayPhoneNumber,
        webhookEvent.waId,
        webhookEvent.status,
        webhookEvent.eventTimestamp,
        input.signature,
        JSON.stringify(input.payload),
      ],
    )

    const row = stored.rows[0]
    if (!row) {
      result.ignored += 1
      continue
    }

    if (row.processed_at) {
      result.duplicates += 1
      continue
    }

    if (webhookEvent.eventType === 'status') {
      result.statusUpdates += await applyWhatsAppStatusUpdate(client, webhookEvent)
    } else {
      result.ignored += 1
    }

    await client.query(
      `
        update whatsapp_webhook_events
        set processed_at = now(),
            processing_error = null
        where id = $1
      `,
      [row.id],
    )

    result.inserted += 1
  }

  return result
}

const metaMessagesUrl = (config: WhatsAppIntegrationConfig) => {
  const base = config.apiUrl.replace(/\/+$/, '')

  if (/\/messages$/i.test(base)) {
    return base
  }

  return `${base}/${encodeURIComponent(config.senderId)}/messages`
}

const metaRecipient = (to: string) => to.replace(/\D/g, '')

const textParameter = (text: string) => ({
  type: 'text',
  text: text.slice(0, 1024),
})

const defaultMetaTemplateComponents = (input: MetaWhatsAppSendInput) => {
  const deepLink = stringFrom(input.payload.deepLinkUrl) ?? stringFrom(input.payload.link)
  const parameters = [
    textParameter(input.title),
    textParameter(input.body),
    ...(deepLink ? [textParameter(deepLink)] : []),
  ]

  return parameters.length
    ? [
        {
          type: 'body',
          parameters,
        },
      ]
    : []
}

export const sendMetaCloudWhatsAppMessage = async (
  input: MetaWhatsAppSendInput,
): Promise<MetaWhatsAppSendResult> => {
  const payloadComponents = input.payload.whatsappTemplateComponents
  const components = Array.isArray(payloadComponents)
    ? payloadComponents
    : defaultMetaTemplateComponents(input)
  const languageCode = stringFrom(input.payload.whatsappLanguageCode) ?? 'en'
  const response = await $fetch<Record<string, unknown>>(metaMessagesUrl(input.config), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${input.config.apiKey}`,
      'Content-Type': 'application/json',
    },
    body: {
      messaging_product: 'whatsapp',
      recipient_type: 'individual',
      to: metaRecipient(input.to),
      type: 'template',
      template: {
        name: input.templateName,
        language: {
          code: languageCode,
        },
        ...(components.length ? { components } : {}),
      },
    },
  })

  const firstMessage = recordsFrom(response.messages)[0]

  return {
    providerMessageId:
      stringFrom(firstMessage?.id) ?? stringFrom(response.messageId) ?? stringFrom(response.id),
    responseBody: response,
  }
}
