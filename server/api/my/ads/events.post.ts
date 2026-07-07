import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { adsResidentEventSchema, logResidentAdEvent } from '~/server/utils/ads'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const body = validateInput(adsResidentEventSchema, await readJsonBody(event))
  const result = await logResidentAdEvent(event, authMe, body)

  return createApiSuccess(event, result)
})
