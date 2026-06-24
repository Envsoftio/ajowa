import { z } from 'zod'
import { createApiSuccess, validateInput } from '~/server/utils/api'
import { getInvitePreview } from '~/server/utils/auth'
import { AppError } from '~/server/utils/errors'

type QueryEvent = {
  node?:
    | {
        req?: {
          url?: string | undefined
        }
      }
    | undefined
  req?:
    | {
        url?: string | URL | undefined
      }
    | undefined
}

const querySchema = z.object({
  token: z.string().min(1),
})

const getRequestQuery = (event: QueryEvent) => {
  const rawUrl = String(event.node?.req?.url ?? event.req?.url ?? '/')
  const url = new URL(rawUrl, 'http://localhost')

  return {
    token: url.searchParams.get('token') ?? '',
  }
}

export default defineEventHandler(async (event) => {
  const query = validateInput(querySchema, getRequestQuery(event))
  const invite = await getInvitePreview(query.token)

  if (!invite || invite.status !== 'PENDING') {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'This invite is invalid or no longer available.',
    })
  }

  return createApiSuccess(event, invite)
})
