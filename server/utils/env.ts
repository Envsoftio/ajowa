import { z } from 'zod'

const whatsappIntegrationSchema = z.object({
  provider: z.string().min(1, 'WHATSAPP_PROVIDER is required'),
  apiUrl: z.string().url('WHATSAPP_API_URL must be a valid URL'),
  apiKey: z.string().min(1, 'WHATSAPP_API_KEY is required'),
  senderId: z.string().min(1, 'WHATSAPP_SENDER_ID is required'),
})

const pushIntegrationSchema = z.object({
  publicKey: z.string().min(1, 'VAPID_PUBLIC_KEY is required'),
  privateKey: z.string().min(1, 'VAPID_PRIVATE_KEY is required'),
  subject: z.string().min(1, 'PUSH_SUBJECT is required'),
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

export const getValidatedRuntimeConfig = (config: Record<string, unknown>) => {
  if (validatedConfig) {
    return validatedConfig
  }

  validatedConfig = runtimeConfigSchema.parse(config)
  return validatedConfig
}

export const getWhatsAppIntegrationStatus = (
  config: Record<string, unknown> = useRuntimeConfig(),
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
  config: Record<string, unknown> = useRuntimeConfig(),
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
