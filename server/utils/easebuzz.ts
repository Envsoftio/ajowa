import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
  timingSafeEqual,
} from 'node:crypto'
import { z } from 'zod'
import { getHeader, readRawBody, type H3Event } from 'h3'
import type { EasebuzzIntegrationConfig } from './env'
import { AppError } from './errors'

export const EASEBUZZ_PROVIDER = 'EASEBUZZ' as const
export const EASEBUZZ_CURRENCY = 'INR' as const

const INITIATE_HASH_FIELDS = [
  'key',
  'txnid',
  'amount',
  'productinfo',
  'firstname',
  'email',
  'udf1',
  'udf2',
  'udf3',
  'udf4',
  'udf5',
  'udf6',
  'udf7',
  'udf8',
  'udf9',
  'udf10',
] as const

const REVERSE_HASH_FIELDS = [
  'udf10',
  'udf9',
  'udf8',
  'udf7',
  'udf6',
  'udf5',
  'udf4',
  'udf3',
  'udf2',
  'udf1',
  'email',
  'firstname',
  'productinfo',
  'amount',
  'txnid',
  'key',
] as const

export type EasebuzzFormPayload = Record<string, string>

export const readEasebuzzFormBody = async (
  event: H3Event,
  maxBytes = 64 * 1024,
) => {
  const contentType = getHeader(event, 'content-type')?.toLowerCase() ?? ''
  if (!contentType.startsWith('application/x-www-form-urlencoded')) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 415,
      message: 'Expected a form-encoded payment message.',
    })
  }
  const contentLength = Number(getHeader(event, 'content-length') ?? 0)
  if (Number.isFinite(contentLength) && contentLength > maxBytes) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 413,
      message: 'Payment message is too large.',
    })
  }
  const rawBody = (await readRawBody(event, 'utf8')) ?? ''
  if (Buffer.byteLength(rawBody, 'utf8') > maxBytes) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 413,
      message: 'Payment message is too large.',
    })
  }
  return {
    rawBody,
    payload: Object.fromEntries(
      new URLSearchParams(rawBody),
    ) as EasebuzzFormPayload,
  }
}

export type EasebuzzNormalizedStatus =
  | 'INITIATED'
  | 'PENDING'
  | 'SUCCESS'
  | 'FAILED'
  | 'CANCELLED'
  | 'REFUND_REVIEW'
  | 'UNKNOWN'

const sha512 = (value: string) =>
  createHash('sha512').update(value, 'utf8').digest('hex')

export const sha256Hex = (value: string) =>
  createHash('sha256').update(value, 'utf8').digest('hex')

export const canonicalizeEasebuzzAmount = (value: number | string) => {
  const number = Number(value)
  if (!Number.isFinite(number) || number < 1) {
    throw new Error('Easebuzz amount must be at least INR 1.00.')
  }
  return number.toFixed(2)
}

const normalizedField = (payload: Record<string, unknown>, field: string) => {
  const value = payload[field]
  return value == null ? '' : String(value).trim()
}

export const buildEasebuzzInitiateHash = (
  payload: Record<string, unknown>,
  salt: string,
) =>
  sha512(
    `${INITIATE_HASH_FIELDS.map((field) => normalizedField(payload, field)).join('|')}|${salt.trim()}`,
  )

export const buildEasebuzzReverseHash = (
  payload: Record<string, unknown>,
  salt: string,
) =>
  sha512(
    `${salt.trim()}|${normalizedField(payload, 'status')}|${REVERSE_HASH_FIELDS.map((field) => normalizedField(payload, field)).join('|')}`,
  )

export const verifyEasebuzzReverseHash = (
  payload: Record<string, unknown>,
  salt: string,
) => {
  const received = normalizedField(payload, 'hash').toLowerCase()
  const expected = buildEasebuzzReverseHash(payload, salt)
  if (!/^[a-f0-9]{128}$/.test(received)) return false
  return timingSafeEqual(
    Buffer.from(received, 'hex'),
    Buffer.from(expected, 'hex'),
  )
}

export const buildEasebuzzTransactionHash = (
  key: string,
  txnid: string,
  salt: string,
) => sha512(`${key.trim()}|${txnid.trim()}|${salt.trim()}`)

export const createEasebuzzTransactionId = () =>
  `AJ${Date.now().toString(36).toUpperCase()}${randomBytes(8).toString('hex').toUpperCase()}`.slice(
    0,
    40,
  )

const accessKeyEncryptionKey = (secret: string) =>
  createHash('sha256')
    .update(`ajowa:easebuzz:access-key:v1:${secret}`, 'utf8')
    .digest()

export const encryptEasebuzzAccessKey = (accessKey: string, secret: string) => {
  const iv = randomBytes(12)
  const cipher = createCipheriv(
    'aes-256-gcm',
    accessKeyEncryptionKey(secret),
    iv,
  )
  const ciphertext = Buffer.concat([
    cipher.update(accessKey, 'utf8'),
    cipher.final(),
  ])
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ciphertext.toString('base64url'),
  ].join(':')
}

export const decryptEasebuzzAccessKey = (value: string, secret: string) => {
  const [version, iv, tag, ciphertext] = value.split(':')
  if (version !== 'v1' || !iv || !tag || !ciphertext) return null
  try {
    const decipher = createDecipheriv(
      'aes-256-gcm',
      accessKeyEncryptionKey(secret),
      Buffer.from(iv, 'base64url'),
    )
    decipher.setAuthTag(Buffer.from(tag, 'base64url'))
    return Buffer.concat([
      decipher.update(Buffer.from(ciphertext, 'base64url')),
      decipher.final(),
    ]).toString('utf8')
  } catch {
    return null
  }
}

export const buildOnlinePaymentRequestFingerprint = (input: {
  societyId: string
  payerUserId: string
  flatId: string
  amount: number
  currency?: string
  allocationMode: string
  selectedDueIds: string[]
  tenureMonths?: number
}) =>
  sha256Hex(
    JSON.stringify({
      societyId: input.societyId,
      payerUserId: input.payerUserId,
      flatId: input.flatId,
      amount: canonicalizeEasebuzzAmount(input.amount),
      currency: input.currency ?? EASEBUZZ_CURRENCY,
      allocationMode: input.allocationMode,
      selectedDueIds: [...new Set(input.selectedDueIds)].sort(),
      tenureMonths: input.tenureMonths ?? null,
    }),
  )

export const normalizeEasebuzzStatus = (
  value: string | null | undefined,
): EasebuzzNormalizedStatus => {
  const status =
    value
      ?.trim()
      .toLowerCase()
      .replace(/[\s_-]/g, '') ?? ''
  if (status === 'success' || status === 'captured') return 'SUCCESS'
  if (status === 'initiated') return 'INITIATED'
  if (status === 'pending' || status === 'auth') return 'PENDING'
  if (status === 'usercancelled' || status === 'cancelled') return 'CANCELLED'
  if (
    status === 'failure' ||
    status === 'failed' ||
    status === 'dropped' ||
    status === 'bounced'
  ) {
    return 'FAILED'
  }
  if (status.includes('refund')) return 'REFUND_REVIEW'
  return 'UNKNOWN'
}

export const parseEasebuzzPaidAt = (payload: EasebuzzFormPayload) => {
  const raw =
    payload.addedon ?? payload.payment_date ?? payload.created_at ?? null
  if (!raw) return null
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw)
    ? `${raw.replace(' ', 'T')}+05:30`
    : raw
  const value = new Date(normalized)
  return Number.isNaN(value.getTime()) ? null : value.toISOString()
}

const REDACTED_KEYS = new Set([
  'hash',
  'cardnum',
  'card_number',
  'card_token',
  'card_cvv',
  'vpa',
  'email',
  'phone',
  'address1',
  'address2',
  'name_on_card',
])

export const redactEasebuzzPayload = (payload: EasebuzzFormPayload) =>
  Object.fromEntries(
    Object.entries(payload).map(([key, value]) => [
      key,
      REDACTED_KEYS.has(key.toLowerCase()) ? '[REDACTED]' : value.slice(0, 500),
    ]),
  )

export const buildEasebuzzEventFingerprint = (input: {
  eventKind: 'CALLBACK' | 'WEBHOOK' | 'TRANSACTION_RETRIEVAL'
  payload: EasebuzzFormPayload
  payloadHash: string
}) =>
  sha256Hex(
    [
      EASEBUZZ_PROVIDER,
      input.eventKind,
      normalizedField(input.payload, 'txnid'),
      normalizedField(input.payload, 'easepayid'),
      normalizedField(input.payload, 'status').toLowerCase(),
      input.payloadHash,
    ].join('|'),
  )

const initiateResponseSchema = z.object({
  status: z.union([z.number(), z.string()]),
  data: z.unknown(),
})

const getBaseUrls = (environment: 'test' | 'prod') => ({
  pay:
    environment === 'prod'
      ? 'https://pay.easebuzz.in/'
      : 'https://testpay.easebuzz.in/',
  dashboard:
    environment === 'prod'
      ? 'https://dashboard.easebuzz.in/'
      : 'https://testdashboard.easebuzz.in/',
})

const postForm = async (
  url: string,
  payload: Record<string, string>,
  timeoutMs = 15_000,
) => {
  const response = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(payload),
    signal: AbortSignal.timeout(timeoutMs),
    redirect: 'error',
  })
  if (!response.ok) {
    throw new Error(`Easebuzz request failed with HTTP ${response.status}.`)
  }
  return (await response.json()) as unknown
}

export const initiateEasebuzzPayment = async (
  config: EasebuzzIntegrationConfig,
  input: Omit<EasebuzzFormPayload, 'key' | 'hash'>,
) => {
  const payload: EasebuzzFormPayload = {
    ...input,
    key: config.key,
  }
  payload.hash = buildEasebuzzInitiateHash(payload, config.salt)

  const outgoing = { ...payload }
  delete outgoing.udf8
  delete outgoing.udf9
  delete outgoing.udf10

  const raw = await postForm(
    `${getBaseUrls(config.environment).pay}payment/initiateLink`,
    outgoing,
  )
  const response = initiateResponseSchema.parse(raw)
  const success = Number(response.status) === 1
  const accessKey = typeof response.data === 'string' ? response.data : null
  if (!success || !accessKey || !/^[a-f0-9]{64}$/i.test(accessKey)) {
    return { ok: false as const, raw }
  }
  return { ok: true as const, accessKey, raw }
}

export const retrieveEasebuzzTransaction = async (
  config: EasebuzzIntegrationConfig,
  txnid: string,
) => {
  const raw = await postForm(
    `${getBaseUrls(config.environment).dashboard}transaction/v2/retrieve`,
    {
      key: config.key,
      txnid,
      hash: buildEasebuzzTransactionHash(config.key, txnid, config.salt),
    },
  )
  return raw
}

export const extractEasebuzzTransaction = (raw: unknown) => {
  const root = z.record(z.unknown()).safeParse(raw)
  if (!root.success) return null
  const data = root.data.data
  const candidate = Array.isArray(data)
    ? data[0]
    : data && typeof data === 'object'
      ? data
      : root.data
  const parsed = z.record(z.unknown()).safeParse(candidate)
  if (!parsed.success) return null
  return Object.fromEntries(
    Object.entries(parsed.data).map(([key, value]) => [
      key,
      value == null ? '' : String(value),
    ]),
  )
}
