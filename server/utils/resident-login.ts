import { hashPassword } from 'better-auth/crypto'
import type { PoolClient } from 'pg'
import { AppError } from '~/server/utils/errors'

export const seedPasswordCredential = async (
  client: PoolClient,
  authUserId: string,
  email: string,
) => {
  const credentialResult = await client.query<{ id: string }>(
    `
      select id
      from auth_accounts
      where provider_id = 'credential' and user_id = $1
      limit 1
    `,
    [authUserId],
  )

  if (credentialResult.rows[0]?.id) {
    return
  }

  const passwordHash = await hashPassword(`Ajowa@${email.slice(0, 4)}2026`)
  await client.query(
    `
      insert into auth_accounts (account_id, provider_id, user_id, password)
      values ($1, 'credential', $2, $3)
    `,
    [authUserId, authUserId, passwordHash],
  )
}

export const resolveAuthUserForResidentLogin = async (
  client: PoolClient,
  input: {
    currentUserId: string
    currentAuthUserId: string | null
    email: string
    fullName: string
  },
) => {
  const existingAuthResult = await client.query<{
    id: string
    linked_user_id: string | null
  }>(
    `
      select au.id, linked_user.id as linked_user_id
      from auth_users au
      left join users linked_user
        on linked_user.auth_user_id = au.id
       and linked_user.id <> $2
      where au.email = $1
      limit 1
    `,
    [input.email, input.currentUserId],
  )
  const existingAuth = existingAuthResult.rows[0]

  if (input.currentAuthUserId) {
    if (existingAuth && existingAuth.id !== input.currentAuthUserId) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'This email is already linked to another login account.',
      })
    }

    await client.query(
      `
        update auth_users
        set name = $2, email = $3, updated_at = now()
        where id = $1
      `,
      [input.currentAuthUserId, input.fullName, input.email],
    )

    await seedPasswordCredential(client, input.currentAuthUserId, input.email)
    return input.currentAuthUserId
  }

  if (existingAuth?.linked_user_id) {
    throw new AppError({
      code: 'CONFLICT',
      statusCode: 409,
      message: 'This email is already linked to another login account.',
    })
  }

  if (existingAuth) {
    await client.query(
      `
        update auth_users
        set name = $2, updated_at = now()
        where id = $1
      `,
      [existingAuth.id, input.fullName],
    )
    await seedPasswordCredential(client, existingAuth.id, input.email)
    return existingAuth.id
  }

  const insertResult = await client.query<{ id: string }>(
    `
      insert into auth_users (name, email, email_verified)
      values ($1, $2, false)
      returning id
    `,
    [input.fullName, input.email],
  )
  const authUserId = insertResult.rows[0]?.id

  if (!authUserId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'Auth user creation failed.',
    })
  }

  await seedPasswordCredential(client, authUserId, input.email)
  return authUserId
}
