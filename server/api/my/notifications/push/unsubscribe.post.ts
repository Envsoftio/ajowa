import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

const schema = z.object({
  endpoint: z.string().url(),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const body = validateInput(schema, await readJsonBody(event))
  const result = await queryRows(
    `
      update push_subscriptions
      set status = 'REVOKED', revoked_at = now(), updated_at = now()
      where endpoint = $1 and user_id = $2
    `,
    [body.endpoint, authMe.user.id],
  )

  return createApiSuccess(event, { updated: result.rowCount ?? 0 })
})
