import { randomBytes } from 'node:crypto'
import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { buildAppUrl } from '~/server/utils/email'

const schema = z.object({
  temporaryPassword: z.string().trim().min(8).max(128).optional(),
})

const generateTemporaryPassword = () => `Ajowa@${randomBytes(4).toString('hex').toUpperCase()}2026`

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'staff.manage')
  const id = getRouterParam(event, 'id')
  const body = validateInput(schema, await readJsonBody(event))

  if (!id) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Staff id is required.',
    })
  }

  const temporaryPassword = body.temporaryPassword ?? generateTemporaryPassword()
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const staff = await client.query<{ auth_user_id: string; email: string }>(
      `
        select auth_user_id, email
        from users
        where id = $1
          and society_id = $2
          and role in ('MANAGER', 'SERVICE_STAFF', 'GUARD')
        limit 1
      `,
      [id, authMe.user.societyId],
    )

    const staffUser = staff.rows[0]

    if (!staffUser) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Staff member was not found.',
      })
    }

    const passwordHash = await hashPassword(temporaryPassword)

    await client.query(
      `
        insert into auth_accounts (account_id, provider_id, user_id, password)
        values ($1, 'credential', $1, $2)
        on conflict (provider_id, account_id) do update
          set password = excluded.password,
              updated_at = now()
      `,
      [staffUser.auth_user_id, passwordHash],
    )

    await client.query(
      `
        update users
        set can_login = true,
            must_change_password = true,
            updated_at = now()
        where id = $1
          and society_id = $2
      `,
      [id, authMe.user.societyId],
    )

    await client.query('commit')

    return createApiSuccess(event, {
      id,
      authUserId: staffUser.auth_user_id,
      email: staffUser.email,
      temporaryPassword,
      loginUrl: buildAppUrl('/login'),
      requiresPasswordChange: true,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
