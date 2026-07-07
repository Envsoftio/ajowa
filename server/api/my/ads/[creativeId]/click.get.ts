import { sendRedirect } from 'h3'
import { validateInput } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import {
  adsRedirectClickQuerySchema,
  logResidentAdClickAndGetDestination,
} from '~/server/utils/ads'
import { getQuerySafe, readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const creativeId = readUuidParam(event, 'creativeId')
  const query = validateInput(adsRedirectClickQuerySchema, getQuerySafe(event))
  const result = await logResidentAdClickAndGetDestination(event, authMe, {
    creativeId,
    slotKey: query.slot,
    pagePath: query.pagePath,
  })

  return sendRedirect(event, result.destinationUrl, 302)
})
