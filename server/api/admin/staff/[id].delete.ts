import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'
import { deprovisionStaffMember } from '~/server/utils/staff-deprovision'

type StaffRow = {
  id: string
  auth_user_id: string | null
  role: 'MANAGER' | 'SERVICE_STAFF' | 'GUARD'
  full_name: string
  email: string | null
  mobile_number: string | null
  whatsapp_number: string | null
  can_login: boolean
  is_active: boolean
  staff_permissions: string[]
}

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const id = readUuidParam(event)
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')

    const staffResult = await client.query<StaffRow>(
      `
        select
          id,
          auth_user_id,
          role::text as role,
          full_name,
          email::text,
          mobile_number,
          whatsapp_number,
          can_login,
          is_active,
          staff_permissions
        from users
        where id = $1
          and society_id = $2
          and role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
          and deleted_at is null
        for update
      `,
      [id, authMe.user.societyId],
    )
    const staff = staffResult.rows[0]

    if (!staff) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Staff member was not found.',
      })
    }

    if (staff.id === authMe.user.id) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'You cannot remove your own staff account.',
      })
    }

    const { openTicketsRequeued } = await deprovisionStaffMember(client, {
      userId: staff.id,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      authUserId: staff.auth_user_id,
      email: staff.email,
    })

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'staff.archived',
      beforeState: {
        id: staff.id,
        authUserId: staff.auth_user_id,
        role: staff.role,
        fullName: staff.full_name,
        email: staff.email,
        mobileNumber: staff.mobile_number,
        whatsappNumber: staff.whatsapp_number,
        canLogin: staff.can_login,
        isActive: staff.is_active,
        permissions: staff.staff_permissions,
      },
      afterState: {
        id: staff.id,
        authUserId: staff.auth_user_id,
        email: null,
        mobileNumber: null,
        whatsappNumber: null,
        canLogin: false,
        isActive: false,
        permissions: [],
        authIdentityArchived: Boolean(staff.auth_user_id),
        openTicketsRequeued,
        deletedAt: new Date().toISOString(),
      },
      metadata: {
        loginSessionsRevoked: Boolean(staff.auth_user_id),
        loginAccountsRemoved: Boolean(staff.auth_user_id),
        openTicketsRequeued,
      },
      relatedEntities: [
        { entityTable: 'users', entityId: id, entityLabel: staff.full_name },
      ],
      targetUserId: id,
    })

    await client.query('commit')

    return createApiSuccess(event, {
      id,
      removed: true,
      archived: true,
      openTicketsRequeued,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
