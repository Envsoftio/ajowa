import process from 'node:process'

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: {
    enabled: true,
  },
  modules: ['@pinia/nuxt', '@primevue/nuxt-module', '@nuxt/eslint'],
  css: ['~/assets/css/main.css'],
  runtimeConfig: {
    supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
    betterAuthSecret: process.env.BETTER_AUTH_SECRET ?? '',
    betterAuthUrl: process.env.BETTER_AUTH_URL ?? '',
    smtp: {
      host: process.env.SMTP_HOST ?? '',
      port: Number(process.env.SMTP_PORT ?? 587),
      user: process.env.SMTP_USER ?? '',
      pass: process.env.SMTP_PASS ?? '',
    },
    emailFrom: process.env.EMAIL_FROM ?? '',
    emailFromName: process.env.EMAIL_FROM_NAME ?? '',
    emailNotificationsEnabled: process.env.EMAIL_NOTIFICATIONS_ENABLED === 'true',
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
    appUrl: process.env.APP_URL ?? 'http://localhost:3000',
    qrSecret: process.env.QR_SECRET ?? '',
    societyCode: process.env.SOCIETY_CODE ?? 'AJOWA',
    public: {
      appName: process.env.NUXT_PUBLIC_APP_NAME ?? 'AJOWA',
      appUrl: process.env.NUXT_PUBLIC_APP_URL ?? 'http://localhost:3000',
      // Support the older local env names while standardizing on Nuxt public keys.
      supabaseUrl: process.env.NUXT_PUBLIC_SUPABASE_URL ?? process.env.SUPABASE_URL ?? '',
      supabaseAnonKey:
        process.env.NUXT_PUBLIC_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? '',
      societyCode: process.env.NUXT_PUBLIC_SOCIETY_CODE ?? 'AJOWA',
    },
  },
  typescript: {
    strict: true,
    shim: false,
    typeCheck: true,
    tsConfig: {
      compilerOptions: {
        noUncheckedIndexedAccess: true,
        exactOptionalPropertyTypes: true,
        noImplicitOverride: true,
        moduleResolution: 'Bundler',
        types: ['node'],
        paths: {
          '@/*': ['./*'],
          '~/*': ['./*'],
        },
      },
    },
  },
  app: {
    head: {
      title: 'AJOWA',
      meta: [
        {
          name: 'viewport',
          content: 'width=device-width, initial-scale=1',
        },
      ],
    },
  },
  nitro: {
    routeRules: {
      '/api/**': {
        cors: false,
      },
    },
  },
  future: {
    compatibilityVersion: 4,
  },
  primevue: {
    autoImport: true,
    options: {
      ripple: true,
      theme: {
        preset: 'Aura',
        options: {
          darkModeSelector: '.app-theme-dark',
        },
      },
    },
    components: {
      include: [
        'Avatar',
        'Badge',
        'Button',
        'Card',
        'Column',
        'ConfirmDialog',
        'DataTable',
        'DatePicker',
        'Drawer',
        'FileUpload',
        'IconField',
        'InputIcon',
        'InputText',
        'Menu',
        'ProgressSpinner',
        'Skeleton',
        'Tag',
        'Toast',
      ],
    },
    composables: {
      include: ['useToast', 'useConfirm'],
    },
  },
})
