import { createApiSuccess } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

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

    await client.query(
      `
        update service_staff_assignments
        set is_active = false,
            ended_at = coalesce(ended_at, now()),
            updated_at = now()
        where user_id = $1
          and is_active = true
      `,
      [id],
    )

    if (staff.email) {
      await client.query(
        `
          update auth_invites
          set revoked_at = now(),
              revoked_by_user_id = $2,
              updated_at = now()
          where society_id = $3
            and email = $1
            and accepted_at is null
            and revoked_at is null
        `,
        [staff.email, authMe.user.id, authMe.user.societyId],
      )
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'DELETED',
      eventKey: 'staff.removed',
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
        authUserId: null,
        email: null,
        mobileNumber: null,
        whatsappNumber: null,
        canLogin: false,
        isActive: false,
        permissions: [],
        deletedAt: new Date().toISOString(),
      },
      relatedEntities: [{ entityTable: 'users', entityId: id, entityLabel: staff.full_name }],
      targetUserId: id,
    })

    await client.query(
      `
        update users
        set auth_user_id = null,
            email = null,
            mobile_number = null,
            whatsapp_number = null,
            profile_image_path = null,
            can_login = false,
            must_change_password = false,
            email_verified = false,
            is_active = false,
            staff_permissions = '{}'::text[],
            deleted_at = now(),
            updated_at = now()
        where id = $1
      `,
      [id],
    )

    if (staff.auth_user_id) {
      await client.query('delete from auth_users where id = $1', [staff.auth_user_id])
    }

    await client.query('commit')

    return createApiSuccess(event, { id, removed: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
