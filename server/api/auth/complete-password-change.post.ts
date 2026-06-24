import { z } from 'zod'
import { hashPassword, verifyPassword } from 'better-auth/crypto'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireAuth } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import {
  getPasswordPolicyMessage,
  PASSWORD_POLICY,
  passwordPolicySatisfied,
} from '~/shared/auth'

const schema = z.object({
  currentPassword: z.string().min(1),
  newPassword: z.string().min(
    PASSWORD_POLICY.minLength,
    `Password must be at least ${PASSWORD_POLICY.minLength} characters.`,
  ),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireAuth(event)
  const body = validateInput(schema, await readJsonBody(event))

  if (!passwordPolicySatisfied(body.newPassword)) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        getPasswordPolicyMessage(body.newPassword) ??
        'Password does not satisfy the AJOWA policy.',
    })
  }

  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const accountResult = await client.query<{ password: string | null }>(
      `
        select password
        from auth_accounts
        where user_id = $1
          and provider_id = 'credential'
        limit 1
      `,
      [authMe.authUser.id],
    )

    const passwordHash = accountResult.rows[0]?.password

    if (!passwordHash) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'Password login is not available for this account.',
      })
    }

    const matches = await verifyPassword({
      hash: passwordHash,
      password: body.currentPassword,
    })

    if (!matches) {
      throw new AppError({
        code: 'FORBIDDEN',
        statusCode: 403,
        message: 'The current password is incorrect.',
      })
    }

    const nextHash = await hashPassword(body.newPassword)

    await client.query(
      `
        update auth_accounts
        set password = $2,
            updated_at = now()
        where user_id = $1
          and provider_id = 'credential'
      `,
      [authMe.authUser.id, nextHash],
    )

    await client.query(
      `
        update users
        set must_change_password = false,
            updated_at = now()
        where auth_user_id = $1
      `,
      [authMe.authUser.id],
    )

    await client.query('commit')

    return createApiSuccess(event, {
      completed: true,
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
