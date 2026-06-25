import process from 'node:process'
import { z } from 'zod'

const whatsappIntegrationSchema = z.object({
  provider: z.string().min(1, 'WHATSAPP_PROVIDER is required'),
  apiUrl: z.string().url('WHATSAPP_API_URL must be a valid URL'),
  apiKey: z.string().min(1, 'WHATSAPP_API_KEY is required'),
  senderId: z.string().min(1, 'WHATSAPP_SENDER_ID is required'),
})

const vapidKeySchema = (name: string) =>
  z
    .string()
    .min(1, `${name} is required`)
    .regex(/^[A-Za-z0-9_-]+={0,2}$/, `${name} must be URL-safe base64`)

const pushIntegrationSchema = z.object({
  publicKey: vapidKeySchema('VAPID_PUBLIC_KEY'),
  privateKey: vapidKeySchema('VAPID_PRIVATE_KEY'),
  subject: z
    .string()
    .min(1, 'PUSH_SUBJECT is required')
    .refine(
      (value) => value.startsWith('mailto:') || /^https?:\/\//.test(value),
      'PUSH_SUBJECT must be a mailto: address or an http(s) URL',
    ),
})

const runtimeConfigSchema = z.object({
  databaseUrl: z.string().min(1, 'DATABASE_URL or SUPABASE_DB_URL is required'),
  supabaseServiceRoleKey: z.string().min(1, 'SUPABASE_SERVICE_ROLE_KEY is required'),
  betterAuthSecret: z.string().min(1, 'BETTER_AUTH_SECRET is required'),
  betterAuthUrl: z.string().url('BETTER_AUTH_URL must be a valid URL'),
  smtp: z.object({
    pass: z.string(),
  }),
  whatsappProvider: z.string(),
  whatsappApiUrl: z.string(),
  whatsappApiKey: z.string(),
  whatsappSenderId: z.string(),
  whatsappNotificationsEnabled: z.boolean(),
  vapidPublicKey: z.string(),
  vapidPrivateKey: z.string(),
  pushSubject: z.string(),
  pushNotificationsEnabled: z.boolean(),
  razorpayKeyId: z.string(),
  razorpayKeySecret: z.string(),
  razorpayWebhookSecret: z.string(),
  appUrl: z.string().url('APP_URL must be a valid URL'),
  qrSecret: z.string().min(1, 'QR_SECRET is required'),
  societyCode: z.string().min(1, 'SOCIETY_CODE is required'),
  public: z.object({
    appName: z.string().min(1),
    appUrl: z.string().url('NUXT_PUBLIC_APP_URL must be a valid URL'),
    supabaseUrl: z.string().url('NUXT_PUBLIC_SUPABASE_URL or SUPABASE_URL must be a valid URL'),
    supabaseAnonKey: z
      .string()
      .min(1, 'NUXT_PUBLIC_SUPABASE_ANON_KEY or SUPABASE_ANON_KEY is required'),
    societyCode: z.string().min(1, 'NUXT_PUBLIC_SOCIETY_CODE is required'),
  }),
})

const OPTIONAL_INTEGRATION_REQUIREMENTS = {
  whatsapp: [
    'WHATSAPP_NOTIFICATIONS_ENABLED=true',
    'WHATSAPP_PROVIDER',
    'WHATSAPP_API_URL',
    'WHATSAPP_API_KEY',
    'WHATSAPP_SENDER_ID',
  ],
  push: [
    'PUSH_NOTIFICATIONS_ENABLED=true',
    'VAPID_PUBLIC_KEY',
    'VAPID_PRIVATE_KEY',
    'PUSH_SUBJECT',
  ],
} as const

export type ValidatedRuntimeConfig = z.infer<typeof runtimeConfigSchema>
export type WhatsAppIntegrationConfig = z.infer<typeof whatsappIntegrationSchema>
export type PushIntegrationConfig = z.infer<typeof pushIntegrationSchema>

export type OptionalIntegrationStatus<T> =
  | {
      enabled: true
      config: T
      reason?: undefined
    }
  | {
      enabled: false
      config: null
      reason: string
    }

let validatedConfig: ValidatedRuntimeConfig | null = null

const defaultAppUrl = 'https://ajowa.in'

const readRuntimeConfig = () => {
  if (typeof useRuntimeConfig === 'function') {
    return useRuntimeConfig()
  }

  const appUrl = process.env.APP_URL ?? process.env.NUXT_PUBLIC_APP_URL ?? defaultAppUrl
  const publicAppUrl = process.env.NUXT_PUBLIC_APP_URL ?? appUrl

  return {
    databaseUrl: process.env.DATABASE_URL ?? process.env.SUPABASE_DB_URL ?? '',
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? '',
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? appUrl,
    smtp: {
      pass: process.env.SMTP_PASS ?? '',
    },
    whatsappProvider: process.env.WHATSAPP_PROVIDER ?? '',
    whatsappApiUrl: process.env.WHATSAPP_API_URL ?? '',
    whatsappApiKey: process.env.WHATSAPP_API_KEY ?? '',
    whatsappSenderId: process.env.WHATSAPP_SENDER_ID ?? '',
    whatsappNotificationsEnabled: process.env.WHATSAPP_NOTIFICATIONS_ENABLED === 'true',
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY ?? '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY ?? '',
    pushSubject: process.env.PUSH_SUBJECT ?? '',
    pushNotificationsEnabled: process.env.PUSH_NOTIFICATIONS_ENABLED === 'true',
    razorpayKeyId: process.env.RAZORPAY_KEY_ID ?? '',
    razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    razorpayWebhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
    appUrl,
    qrSecret: process.env.QR_SECRET ?? '',
    societyCode: process.env.SOCIETY_CODE ?? 'AJOWA',
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME ?? 'AJOWA',
      appUrl: publicAppUrl,
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      supabaseAnonKey:
        process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      societyCode: process.env.NUXT_PUBLIC_SOCIETY_CODE ?? 'AJOWA',
    },
  }
}

const buildDisabledMessage = (label: string, requirements: readonly string[]) =>
  `${label} integration is disabled. Configure ${requirements.join(', ')} to enable it.`

const validateOptionalIntegration = <T>(
  enabled: boolean,
  label: string,
  requirements: readonly string[],
  schema: z.ZodType<T>,
  value: unknown,
): OptionalIntegrationStatus<T> => {
  if (!enabled) {
    return {
      enabled: false,
      config: null,
      reason: buildDisabledMessage(label, requirements),
    }
  }

  const parsed = schema.safeParse(value)

  if (!parsed.success) {
    const issues = parsed.error.issues.map((issue) => issue.message).join('; ')

    return {
      enabled: false,
      config: null,
      reason: `${label} integration is misconfigured. ${issues}. Required settings: ${requirements.join(', ')}.`,
    }
  }

  return {
    enabled: true,
    config: parsed.data,
  }
}

export const getValidatedRuntimeConfig = (config?: Record<string, unknown>) => {
  if (validatedConfig) {
    return validatedConfig
  }

  validatedConfig = runtimeConfigSchema.parse(config ?? readRuntimeConfig())
  return validatedConfig
}

export const getWhatsAppIntegrationStatus = (
  config?: Record<string, unknown>,
): OptionalIntegrationStatus<WhatsAppIntegrationConfig> => {
  const runtimeConfig = getValidatedRuntimeConfig(config)

  return validateOptionalIntegration(
    runtimeConfig.whatsappNotificationsEnabled,
    'WhatsApp notifications',
    OPTIONAL_INTEGRATION_REQUIREMENTS.whatsapp,
    whatsappIntegrationSchema,
    {
      provider: runtimeConfig.whatsappProvider,
      apiUrl: runtimeConfig.whatsappApiUrl,
      apiKey: runtimeConfig.whatsappApiKey,
      senderId: runtimeConfig.whatsappSenderId,
    },
  )
}

export const getPushIntegrationStatus = (
  config?: Record<string, unknown>,
): OptionalIntegrationStatus<PushIntegrationConfig> => {
  const runtimeConfig = getValidatedRuntimeConfig(config)

  return validateOptionalIntegration(
    runtimeConfig.pushNotificationsEnabled,
    'Push notifications',
    OPTIONAL_INTEGRATION_REQUIREMENTS.push,
    pushIntegrationSchema,
    {
      publicKey: runtimeConfig.vapidPublicKey,
      privateKey: runtimeConfig.vapidPrivateKey,
      subject: runtimeConfig.pushSubject,
    },
  )
}
