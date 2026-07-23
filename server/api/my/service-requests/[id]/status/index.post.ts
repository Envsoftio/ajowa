import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { readUuidParam } from '~/server/utils/master-data'
import { updateServiceRequestStatus } from '~/server/utils/service-requests'

const reopenSchema = z.object({
  status: z.literal('REOPENED'),
  comment: z.string().trim().min(3).max(3000),
  reason: z.string().trim().min(3).max(500),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const id = readUuidParam(event)
  const body = validateInput(reopenSchema, await readJsonBody(event))
  await updateServiceRequestStatus(authMe, id, body, 'resident', {
    waitUntil: event.waitUntil.bind(event),
  })

  return createApiSuccess(event, { id })
})
