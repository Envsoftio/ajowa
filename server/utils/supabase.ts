import { createClient } from '@supabase/supabase-js'
import { getValidatedRuntimeConfig } from './env'

let adminClient: ReturnType<typeof createClient> | null = null

export const getSupabaseAdminClient = () => {
  if (adminClient) {
    return adminClient
  }

  const config = getValidatedRuntimeConfig(useRuntimeConfig())

  adminClient = createClient(config.public.supabaseUrl, config.supabaseServiceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
