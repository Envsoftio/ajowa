import { hashPassword } from 'better-auth/crypto'
import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { createInviteToken, requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { buildAppUrl } from '~/server/utils/email'
import { AppError } from '~/server/utils/errors'
import { sendInviteEmailSafely, type PendingInviteEmail } from '~/server/utils/invite-email'
import { readUuidParam, writeMasterAudit } from '~/server/utils/master-data'

const actionSchema = z.object({
  action: z.enum(['CREATE_CREDENTIALS', 'SEND_INVITE', 'RESEND_INVITE', 'DEACTIVATE_LOGIN', 'RESET_ONBOARDING']),
  password: z.string().min(12).optional(),
})

type ResidentActionRow = {
  auth_user_id: string | null
  full_name: string
  email: string | null
  mobile_number: string | null
  role: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const id = readUuidParam(event)
  const body = validateInput(actionSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()
  let committed = false
  let pendingInviteEmail: PendingInviteEmail | null = null

  try {
    await client.query('begin')

    const residentResult = await client.query<ResidentActionRow>(
      `
        select auth_user_id, full_name, email::text, mobile_number, role::text
        from users
        where id = $1 and society_id = $2
        limit 1
      `,
      [id, authMe.user.societyId],
    )
    const resident = residentResult.rows[0]

    if (!resident) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Resident not found.',
      })
    }

    const requireLoginIdentity = () => {
      if (!resident.auth_user_id || !resident.email) {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 422,
          message: 'Add a real email and auth account before enabling login actions for this resident.',
        })
      }

      return {
        authUserId: resident.auth_user_id,
        email: resident.email,
      }
    }

    if (body.action === 'CREATE_CREDENTIALS') {
      const loginIdentity = requireLoginIdentity()
      const passwordHash = await hashPassword(body.password ?? `Ajowa@${loginIdentity.email.slice(0, 4)}2026`)

      await client.query(
        `
          insert into auth_accounts (account_id, provider_id, user_id, password)
          values ($1, 'credential', $2, $3)
          on conflict (provider_id, account_id) do update
            set password = excluded.password,
                updated_at = now()
        `,
        [loginIdentity.authUserId, loginIdentity.authUserId, passwordHash],
      )
    }

    if (body.action === 'DEACTIVATE_LOGIN') {
      await client.query(
        `
          update users
          set can_login = false, updated_at = now()
          where id = $1
        `,
        [id],
      )
    }

    if (body.action === 'RESET_ONBOARDING') {
      const loginIdentity = requireLoginIdentity()

      await client.query(
        `
          update users
          set must_change_password = true, email_verified = false, updated_at = now()
          where id = $1
        `,
        [id],
      )

      await client.query(
        `
          update auth_users
          set email_verified = false, updated_at = now()
          where id = $1
        `,
        [loginIdentity.authUserId],
      )
    }

    if (body.action === 'SEND_INVITE' || body.action === 'RESEND_INVITE') {
      const loginIdentity = requireLoginIdentity()
      const { token, tokenHash } = createInviteToken()
      const flatResult = await client.query<{ flat_id: string; label: string; relationship_type: string }>(
        `
          select
            fr.flat_id,
            concat(b.name, ' ', f.flat_number) as label,
            fr.relationship_type::text
          from flat_residents fr
          inner join flats f on f.id = fr.flat_id
          inner join blocks b on b.id = f.block_id
          where fr.user_id = $1 and fr.is_active = true
        `,
        [id],
      )

      if (body.action === 'RESEND_INVITE') {
        await client.query(
          `
            update auth_invites
            set revoked_at = now(), revoked_by_user_id = $2
            where email = $1 and accepted_at is null and revoked_at is null
          `,
          [loginIdentity.email, authMe.user.id],
        )
      }

      const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      const inviteUrl = buildAppUrl('/accept-invite', { token })
      await client.query(
        `
          insert into auth_invites (
            society_id,
            email,
            role,
            full_name,
            mobile_number,
            relationship_type,
            flat_ids,
            flat_labels,
            token_hash,
            invited_by_user_id,
            expires_at,
            accepted_by_auth_user_id
          )
          values ($1, $2, $3, $4, $5, $6, $7::uuid[], $8::text[], $9, $10, $11, $12)
        `,
        [
          authMe.user.societyId,
          loginIdentity.email,
          resident.role,
          resident.full_name,
          resident.mobile_number,
          flatResult.rows[0]?.relationship_type ?? null,
          flatResult.rows.map((item) => item.flat_id),
          flatResult.rows.map((item) => item.label),
          tokenHash,
          authMe.user.id,
          expiresAt.toISOString(),
          loginIdentity.authUserId,
        ],
      )

      pendingInviteEmail = {
        societyId: authMe.user.societyId,
        to: loginIdentity.email,
        subject: 'Your AJOWA invite is ready',
        template: 'invite-onboarding',
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        context: {
          title: 'Accept your AJOWA invite',
          name: resident.full_name,
          actionUrl: inviteUrl,
          expiresLabel: expiresAt.toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
          inviterName: authMe.user.fullName,
          roleLabel: resident.role.replace('_', ' ').toLowerCase(),
          details: flatResult.rows.length > 0 ? `Assigned flats: ${flatResult.rows.map((item) => item.label).join(', ')}.` : 'Finish onboarding to activate access.',
        },
      }
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: `residents.${body.action.toLowerCase()}`,
      afterState: { action: body.action },
      relatedEntities: [{ entityTable: 'users', entityId: id, entityLabel: resident.full_name }],
      targetUserId: id,
    })

    await client.query('commit')
    committed = true

    const emailDelivery = pendingInviteEmail
      ? await sendInviteEmailSafely(event, pendingInviteEmail, client)
      : null

    return createApiSuccess(event, {
      id,
      action: body.action,
      ...(pendingInviteEmail
        ? {
            invite: {
              inviteUrl: pendingInviteEmail.inviteUrl,
              expiresAt: pendingInviteEmail.expiresAt,
              emailDelivery,
            },
          }
        : {}),
    })
  } catch (error) {
    if (!committed) {
      await client.query('rollback')
    }
    throw error
  } finally {
    client.release()
  }
})
