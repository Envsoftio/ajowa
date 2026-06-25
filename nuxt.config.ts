import process from 'node:process'
import { definePreset } from '@primevue/themes'
import Aura from '@primevue/themes/aura'

const defaultAppUrl = 'https://ajowa.in'
const appUrl = process.env.APP_URL ?? process.env.NUXT_PUBLIC_APP_URL ?? defaultAppUrl
const publicAppUrl = process.env.NUXT_PUBLIC_APP_URL ?? appUrl
const AjowaPreset = definePreset(Aura, {
  semantic: {
    primary: {
      50: '#eff6ff',
      100: '#dbeafe',
      200: '#bfdbfe',
      300: '#93c5fd',
      400: '#60a5fa',
      500: '#0645c3',
      600: '#013fba',
      700: '#063797',
      800: '#102f78',
      900: '#12265a',
      950: '#0b1738',
    },
    colorScheme: {
      light: {
        primary: {
          color: '#0645c3',
          contrastColor: '#ffffff',
          hoverColor: '#013fba',
          activeColor: '#063797',
        },
      },
      dark: {
        primary: {
          color: '#7db2ff',
          contrastColor: '#0b1738',
          hoverColor: '#9fc5ff',
          activeColor: '#bfdbfe',
        },
      },
    },
  },
})

export default defineNuxtConfig({
  compatibilityDate: '2025-01-01',
  devtools: {
    enabled: true,
  },
  modules: ['@pinia/nuxt', '@primevue/nuxt-module', '@nuxt/eslint'],
  components: [
    {
      path: '~/components',
      pathPrefix: false,
    },
  ],
  css: ['primeicons/primeicons.css', '~/assets/css/main.css'],
  runtimeConfig: {
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
        {
          name: 'theme-color',
          content: '#0645c3',
        },
        {
          name: 'application-name',
          content: 'AJOWA',
        },
        {
          name: 'apple-mobile-web-app-title',
          content: 'AJOWA',
        },
        {
          name: 'msapplication-TileColor',
          content: '#0645c3',
        },
      ],
      link: [
        { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
        { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossorigin: '' },
        {
          rel: 'stylesheet',
          href: 'https://fonts.googleapis.com/css2?family=Sora:wght@400;500;600;700&display=swap',
        },
        { rel: 'manifest', href: '/manifest.webmanifest' },
        { rel: 'icon', type: 'image/svg+xml', href: '/ajowa-icon.svg' },
        { rel: 'icon', type: 'image/png', sizes: '32x32', href: '/favicon-32x32.png' },
        { rel: 'icon', type: 'image/png', sizes: '16x16', href: '/favicon-16x16.png' },
        { rel: 'apple-touch-icon', sizes: '180x180', href: '/apple-touch-icon.png' },
      ],
    },
  },
  nitro: {
    serverAssets: [
      {
        baseName: 'emailTemplates',
        dir: './email-templates',
      },
    ],
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
        preset: AjowaPreset,
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
        'DatePicker',
        'Dialog',
        'Drawer',
        'Dropdown',
        'FileUpload',
        'IconField',
        'InputIcon',
        'InputText',
        'InputNumber',
        'Menu',
        'Password',
        'ProgressSpinner',
        'Skeleton',
        'Select',
        'SelectButton',
        'Message',
        'MultiSelect',
        'Tag',
        'Textarea',
        'ToggleSwitch',
        'Toast',
      ],
    },
    composables: {
      include: ['useToast', 'useConfirm'],
    },
  },
})
