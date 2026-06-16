import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { sendProviderVerification } from '~/server/utils/notifications'

const schema = z.object({
  channel: z.enum(['EMAIL', 'WHATSAPP', 'PUSH']),
  target: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    const result = await sendProviderVerification(client, {
      channel: body.channel,
      societyId: authMe.user.societyId,
      target: body.target,
      triggeredByUserId: authMe.user.id,
    })

    return createApiSuccess(event, result)
  } finally {
    client.release()
  }
})
