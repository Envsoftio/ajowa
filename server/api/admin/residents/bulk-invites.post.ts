import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import {
  createInviteExpiresAt,
  createInviteToken,
  DEFAULT_INVITE_EXPIRY_DAYS,
  MAX_INVITE_EXPIRY_DAYS,
  requireRole,
} from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { buildAppUrl } from '~/server/utils/email'
import {
  sendInviteEmailSafely,
  type PendingInviteEmail,
} from '~/server/utils/invite-email'
import { writeMasterAudit } from '~/server/utils/master-data'

const schema = z.object({
  search: z.string().trim().max(120).optional().default(''),
  flatId: z.string().uuid().optional(),
  isActive: z.enum(['true', 'false']).optional().default('true'),
  canLogin: z.enum(['true', 'false']).optional().default('false'),
  expiresInDays: z
    .number()
    .int()
    .positive()
    .max(MAX_INVITE_EXPIRY_DAYS)
    .default(DEFAULT_INVITE_EXPIRY_DAYS),
})

type BulkInviteResidentRow = {
  id: string
  auth_user_id: string
  full_name: string
  email: string
  mobile_number: string | null
  role: string
  relationship_type: string | null
  flat_ids: string[]
  flat_labels: string[]
}

const EMAIL_BATCH_SIZE = 5

const sendInviteEmails = async (
  event: Parameters<typeof sendInviteEmailSafely>[0],
  invites: PendingInviteEmail[],
) => {
  let delivered = 0
  const failures: Array<{ email: string; reason: string }> = []

  for (let index = 0; index < invites.length; index += EMAIL_BATCH_SIZE) {
    const batch = invites.slice(index, index + EMAIL_BATCH_SIZE)
    const results = await Promise.all(
      batch.map(async (invite) => ({
        invite,
        delivery: await sendInviteEmailSafely(event, invite),
      })),
    )

    for (const result of results) {
      if (result.delivery.delivered) {
        delivered += 1
      } else {
        failures.push({
          email: result.invite.to,
          reason: result.delivery.reason,
        })
      }
    }
  }

  return {
    delivered,
    failed: failures.length,
    failures: failures.slice(0, 10),
  }
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()
  const values: unknown[] = [authMe.user.societyId]
  const where = ['u.society_id = $1', `u.role = 'RESIDENT'`]

  if (body.search) {
    values.push(`%${body.search}%`)
    where.push(
      `(
        u.full_name ilike $${values.length}
        or coalesce(u.email::text, '') ilike $${values.length}
        or coalesce(u.mobile_number, '') ilike $${values.length}
        or exists (
          select 1
          from flat_residents search_fr
          where search_fr.user_id = u.id
            and search_fr.import_metadata->>'relationshipSource' = 'OWNER'
            and (
              coalesce(search_fr.import_metadata #>> '{sourceData,EMAIL ID}', '') ilike $${values.length}
              or coalesce(search_fr.import_metadata #>> '{sourceData,CONTACT DETAILS}', '') ilike $${values.length}
            )
        )
      )`,
    )
  }

  values.push(body.isActive === 'true')
  where.push(`u.is_active = $${values.length}`)

  values.push(body.canLogin === 'true')
  where.push(`u.can_login = $${values.length}`)

  if (body.flatId) {
    values.push(body.flatId)
    where.push(`
      exists (
        select 1
        from flat_residents filter_fr
        inner join flats filter_f on filter_f.id = filter_fr.flat_id
        where filter_fr.user_id = u.id
          and filter_f.society_id = u.society_id
          and filter_f.id = $${values.length}
      )
    `)
  }

  const whereSql = where.join(' and ')
  let committed = false
  let pendingInviteEmails: PendingInviteEmail[] = []
  let totalMatching = 0
  let skippedMissingLoginIdentity = 0

  try {
    await client.query('begin')

    const counts = await client.query<{
      total_matching: string
      missing_login_identity: string
    }>(
      `
        select
          count(*)::text as total_matching,
          count(*) filter (where u.auth_user_id is null or u.email is null)::text as missing_login_identity
        from users u
        where ${whereSql}
      `,
      values,
    )

    totalMatching = Number(counts.rows[0]?.total_matching ?? 0)
    skippedMissingLoginIdentity = Number(
      counts.rows[0]?.missing_login_identity ?? 0,
    )

    const residents = await client.query<BulkInviteResidentRow>(
      `
        select
          u.id,
          u.auth_user_id::text,
          u.full_name,
          u.email::text,
          u.mobile_number,
          u.role::text,
          (
            array_agg(fr.relationship_type::text order by fr.created_at)
              filter (where fr.is_active = true and fr.relationship_type is not null)
          )[1] as relationship_type,
          coalesce(
            array_agg(distinct fr.flat_id::text)
              filter (where fr.is_active = true and fr.flat_id is not null),
            '{}'::text[]
          ) as flat_ids,
          coalesce(
            array_agg(distinct concat(b.name, ' ', f.flat_number))
              filter (where fr.is_active = true and f.id is not null),
            '{}'::text[]
          ) as flat_labels
        from users u
        left join flat_residents fr on fr.user_id = u.id
        left join flats f on f.id = fr.flat_id
        left join blocks b on b.id = f.block_id
        where ${whereSql}
          and u.auth_user_id is not null
          and u.email is not null
        group by u.id
        order by u.full_name asc
      `,
      values,
    )

    for (const resident of residents.rows) {
      const { token, tokenHash } = createInviteToken()
      const expiresAt = createInviteExpiresAt(body.expiresInDays)
      const inviteUrl = buildAppUrl('/accept-invite', { token })

      await client.query(
        `
          update auth_invites
          set revoked_at = now(), revoked_by_user_id = $3
          where society_id = $1
            and email = $2
            and accepted_at is null
            and revoked_at is null
        `,
        [authMe.user.societyId, resident.email, authMe.user.id],
      )

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
          resident.email,
          resident.role,
          resident.full_name,
          resident.mobile_number,
          resident.relationship_type,
          resident.flat_ids,
          resident.flat_labels,
          tokenHash,
          authMe.user.id,
          expiresAt.toISOString(),
          resident.auth_user_id,
        ],
      )

      pendingInviteEmails.push({
        societyId: authMe.user.societyId,
        to: resident.email,
        subject: 'Your AJOWA invite is ready',
        template: 'invite-onboarding',
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        context: {
          title: 'Accept your AJOWA invite',
          name: resident.full_name,
          actionUrl: inviteUrl,
          expiresLabel: expiresAt.toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          inviterName: authMe.user.fullName,
          roleLabel: resident.role.replace('_', ' ').toLowerCase(),
          details:
            resident.flat_labels.length > 0
              ? `Assigned flats: ${resident.flat_labels.join(', ')}.`
              : 'Finish onboarding to activate access.',
        },
      })
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'residents.bulk_invites_sent',
      afterState: {
        filters: body,
        totalMatching,
        created: pendingInviteEmails.length,
        skippedMissingLoginIdentity,
      },
      relatedEntities: residents.rows.slice(0, 20).map((resident) => ({
        entityTable: 'users',
        entityId: resident.id,
        entityLabel: resident.full_name,
      })),
    })

    await client.query('commit')
    committed = true
  } catch (error) {
    if (!committed) {
      await client.query('rollback')
    }
    throw error
  } finally {
    client.release()
  }

  const emailDelivery = await sendInviteEmails(event, pendingInviteEmails)

  return createApiSuccess(event, {
    totalMatching,
    created: pendingInviteEmails.length,
    skippedMissingLoginIdentity,
    emailDelivery,
  })
})
