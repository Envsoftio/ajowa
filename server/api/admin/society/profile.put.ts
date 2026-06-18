import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { normalizeSocietySettings, societyProfileSchema, validatePayload, writeMasterAudit } from '~/server/utils/master-data'

type SocietyProfileRow = {
  id: string
  code: string
  name: string
  registration_number: string | null
  address_line_1: string
  address_line_2: string | null
  city: string
  state: string
  pincode: string
  contact_email: string | null
  contact_phone: string | null
  timezone: string
  settings: Record<string, unknown>
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validatePayload(societyProfileSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const beforeResult = await client.query<SocietyProfileRow>(
      `
        select
          id,
          code,
          name,
          registration_number,
          address_line_1,
          address_line_2,
          city,
          state,
          pincode,
          contact_email,
          contact_phone,
          timezone,
          settings
        from society_profile
        where id = $1
        limit 1
      `,
      [authMe.user.societyId],
    )

    const before = beforeResult.rows[0]
    const settings = normalizeSocietySettings(body.settings)

    const updateResult = await client.query(
      `
        update society_profile
        set
          name = $2,
          registration_number = $3,
          address_line_1 = $4,
          address_line_2 = $5,
          city = $6,
          state = $7,
          pincode = $8,
          contact_email = $9,
          contact_phone = $10,
          timezone = $11,
          settings = $12::jsonb,
          updated_at = now()
        where id = $1
      `,
      [
        authMe.user.societyId,
        body.name,
        body.registrationNumber ?? null,
        body.addressLine1,
        body.addressLine2 ?? null,
        body.city,
        body.state,
        body.pincode,
        body.contactEmail ?? null,
        body.contactPhone ?? null,
        body.timezone,
        JSON.stringify(settings),
      ],
    )

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'society.profile.updated',
      beforeState: before
        ? {
            name: before.name,
            registrationNumber: before.registration_number,
            addressLine1: before.address_line_1,
            addressLine2: before.address_line_2,
            city: before.city,
            state: before.state,
            pincode: before.pincode,
            contactEmail: before.contact_email,
            contactPhone: before.contact_phone,
            timezone: before.timezone,
            settings: normalizeSocietySettings(before.settings),
          }
        : null,
      afterState: {
        ...body,
        settings,
      },
      relatedEntities: [
        {
          entityTable: 'society_profile',
          entityId: authMe.user.societyId,
          entityLabel: body.name,
        },
      ],
    })

    await client.query('commit')

    return createApiSuccess(event, {
      updated: updateResult.rowCount === 1,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
