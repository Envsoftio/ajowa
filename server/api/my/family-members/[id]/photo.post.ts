import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { uploadFamilyMemberPhoto } from '~/server/utils/family-members'
import { readUuidParam } from '~/server/utils/master-data'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['RESIDENT'])
  const userId = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const result = await uploadFamilyMemberPhoto({ event, client, authMe, userId })
    await client.query('commit')

    return createApiSuccess(event, result)
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
