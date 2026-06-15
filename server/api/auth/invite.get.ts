import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { getInvitePreview } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'

const querySchema = z.object({
  token: z.string().min(1),
})

export default defineEventHandler(async (event) => {
  const query = validateInput(querySchema, getQuery(event))
  const invite = await getInvitePreview(query.token)

  if (!invite) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'This invite is invalid or no longer available.',
    })
  }

  return createApiSuccess(event, invite)
})
