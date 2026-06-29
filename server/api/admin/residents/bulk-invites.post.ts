import { z } from 'zod'
import type { PoolClient } from 'pg'
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
import { recomputeUserAccessForActiveBillingPeriods } from '~/server/utils/qr-access'
import { resolveAuthUserForResidentLogin } from '~/server/utils/resident-login'

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
  auth_user_id: string | null
  full_name: string
  stored_email: string | null
  email: string | null
  mobile_number: string | null
  role: string
  relationship_type: string | null
  flat_ids: string[]
  flat_labels: string[]
}

type BulkInviteResidentCandidate = BulkInviteResidentRow & {
  email: string
  normalizedEmail: string
}

type DuplicateLoginUserRow = {
  id: string
  auth_user_id: string | null
  role: string
  can_login: boolean
  full_name: string
}

const EMAIL_BATCH_SIZE = 5
const emailSchema = z.string().trim().email()

const sourceEmailSql = `
  (
    select btrim(source_fr.import_metadata #>> '{sourceData,EMAIL ID}')
    from flat_residents source_fr
    where source_fr.user_id = u.id
      and source_fr.import_metadata->>'relationshipSource' in ('OWNER', 'TENANT')
      and upper(coalesce(btrim(source_fr.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', '--', 'NIL')
    order by
      case source_fr.import_metadata->>'relationshipSource'
        when 'OWNER' then 0
        when 'TENANT' then 1
        else 2
      end,
      source_fr.created_at
    limit 1
  )
`

const uniqueValues = <T>(values: T[]) => [...new Set(values)]

const combineResidentCandidates = (
  residents: BulkInviteResidentCandidate[],
) => {
  const canonical =
    residents.find(
      (resident) => resident.stored_email && resident.auth_user_id,
    ) ??
    residents.find((resident) => resident.stored_email) ??
    residents[0]

  if (!canonical) {
    throw new Error('Unable to resolve resident invite candidate.')
  }

  return {
    canonical,
    flatIds: uniqueValues(residents.flatMap((resident) => resident.flat_ids)),
    flatLabels: uniqueValues(
      residents.flatMap((resident) => resident.flat_labels),
    ),
    relationshipType:
      residents.find((resident) => resident.relationship_type)
        ?.relationship_type ?? null,
  }
}

const groupResidentCandidates = (residents: BulkInviteResidentCandidate[]) => {
  const emailGroups = new Map<string, BulkInviteResidentCandidate[]>()

  for (const resident of residents) {
    emailGroups.set(resident.normalizedEmail, [
      ...(emailGroups.get(resident.normalizedEmail) ?? []),
      resident,
    ])
  }

  return [...emailGroups.values()]
}

const syncOwnerFlatsToExistingResident = async ({
  client,
  targetUserId,
  sourceUserIds,
}: {
  client: PoolClient
  targetUserId: string
  sourceUserIds: string[]
}) => {
  const result = await client.query<{ synced_count: string }>(
    `
      with source_relationships as (
        select distinct on (fr.flat_id)
          fr.flat_id,
          fr.ownership_start_date,
          fr.occupancy_status,
          fr.access_scope,
          fr.relationship_note
        from flat_residents fr
        where fr.user_id = any($2::uuid[])
          and fr.is_active = true
          and fr.relationship_type = 'OWNER'
        order by
          fr.flat_id,
          fr.is_billing_contact desc,
          fr.is_primary_contact desc,
          fr.created_at asc
      ),
      updated as (
        update flat_residents target
        set can_login = true,
            is_active = true,
            ownership_start_date = coalesce(target.ownership_start_date, source.ownership_start_date),
            occupancy_status = coalesce(target.occupancy_status, source.occupancy_status),
            access_scope = coalesce(target.access_scope, source.access_scope, 'OWNERSHIP'::access_scope),
            relationship_note = coalesce(target.relationship_note, source.relationship_note),
            ended_at = null,
            updated_at = now()
        from source_relationships source
        where target.user_id = $1
          and target.flat_id = source.flat_id
        returning target.flat_id
      ),
      inserted as (
        insert into flat_residents (
          flat_id,
          user_id,
          relationship_type,
          is_primary_contact,
          is_billing_contact,
          can_login,
          is_active,
          ownership_start_date,
          occupancy_status,
          access_scope,
          relationship_note
        )
        select
          source.flat_id,
          $1,
          'OWNER'::relationship_type,
          false,
          false,
          true,
          true,
          source.ownership_start_date,
          source.occupancy_status,
          coalesce(source.access_scope, 'OWNERSHIP'::access_scope),
          source.relationship_note
        from source_relationships source
        where not exists (
          select 1
          from flat_residents existing
          where existing.user_id = $1
            and existing.flat_id = source.flat_id
        )
        returning flat_id
      )
      select (
        (select count(*) from updated) +
        (select count(*) from inserted)
      )::text as synced_count
    `,
    [targetUserId, sourceUserIds],
  )

  return Number(result.rows[0]?.synced_count ?? 0)
}

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
  const pendingInviteEmails: PendingInviteEmail[] = []
  let totalMatching: number
  let skippedMissingLoginIdentity: number
  let skippedInvalidLoginIdentity = 0
  let skippedDuplicateLoginIdentity = 0
  let syncedExistingLoginFlats = 0
  const processedEmails = new Set<string>()
  const syncedExistingLoginUserIds = new Set<string>()

  try {
    await client.query('begin')

    const counts = await client.query<{
      total_matching: string
      missing_login_identity: string
    }>(
      `
        select
          count(*)::text as total_matching,
          count(*) filter (where coalesce(u.email::text, ${sourceEmailSql}) is null)::text as missing_login_identity
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
          u.email::text as stored_email,
          coalesce(u.email::text, ${sourceEmailSql}) as email,
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
          and coalesce(u.email::text, ${sourceEmailSql}) is not null
        group by u.id
        order by u.full_name asc
      `,
      values,
    )

    const residentCandidates: BulkInviteResidentCandidate[] = []

    for (const resident of residents.rows) {
      const parsedEmail = emailSchema.safeParse(resident.email)

      if (!parsedEmail.success) {
        skippedInvalidLoginIdentity += 1
        continue
      }

      const email = parsedEmail.data
      const normalizedEmail = email.toLowerCase()

      residentCandidates.push({
        ...resident,
        email,
        normalizedEmail,
      })
    }

    const inviteGroups = groupResidentCandidates(residentCandidates)

    for (const residentGroup of inviteGroups) {
      const { canonical, flatIds, flatLabels, relationshipType } =
        combineResidentCandidates(residentGroup)
      const email = canonical.email
      const normalizedEmail = canonical.normalizedEmail

      const duplicateEmailResult = await client.query<DuplicateLoginUserRow>(
        `
          select
            id,
            auth_user_id::text,
            role::text,
            can_login,
            full_name
          from users
          where society_id = $1
            and email = $2
            and id <> all($3::uuid[])
          limit 1
        `,
        [
          authMe.user.societyId,
          email,
          residentGroup.map((resident) => resident.id),
        ],
      )

      const duplicateLoginUser = duplicateEmailResult.rows[0]

      if (duplicateLoginUser) {
        if (
          duplicateLoginUser.role === 'RESIDENT' &&
          duplicateLoginUser.can_login &&
          duplicateLoginUser.auth_user_id
        ) {
          const syncedCount = await syncOwnerFlatsToExistingResident({
            client,
            targetUserId: duplicateLoginUser.id,
            sourceUserIds: residentGroup.map((resident) => resident.id),
          })

          if (syncedCount > 0) {
            syncedExistingLoginFlats += syncedCount
            syncedExistingLoginUserIds.add(duplicateLoginUser.id)
            continue
          }
        }

        skippedDuplicateLoginIdentity += residentGroup.length
        continue
      }

      if (processedEmails.has(normalizedEmail)) {
        skippedDuplicateLoginIdentity += residentGroup.length
        continue
      }

      const authUserId = await resolveAuthUserForResidentLogin(client, {
        currentUserId: canonical.id,
        currentAuthUserId: canonical.auth_user_id,
        email,
        fullName: canonical.full_name,
      })

      await client.query(
        `
          update users
          set email = $3,
              auth_user_id = $4,
              updated_at = now()
          where id = $1
            and society_id = $2
        `,
        [canonical.id, authMe.user.societyId, email, authUserId],
      )

      processedEmails.add(normalizedEmail)

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
        [authMe.user.societyId, email, authMe.user.id],
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
          email,
          canonical.role,
          canonical.full_name,
          canonical.mobile_number,
          relationshipType,
          flatIds,
          flatLabels,
          tokenHash,
          authMe.user.id,
          expiresAt.toISOString(),
          authUserId,
        ],
      )

      pendingInviteEmails.push({
        societyId: authMe.user.societyId,
        to: email,
        subject: 'Your AJOWA invite is ready',
        template: 'invite-onboarding',
        inviteUrl,
        expiresAt: expiresAt.toISOString(),
        context: {
          title: 'Accept your AJOWA invite',
          name: canonical.full_name,
          actionUrl: inviteUrl,
          expiresLabel: expiresAt.toLocaleString('en-IN', {
            dateStyle: 'medium',
            timeStyle: 'short',
          }),
          inviterName: authMe.user.fullName,
          roleLabel: canonical.role.replace('_', ' ').toLowerCase(),
          details:
            flatLabels.length > 0
              ? `Assigned flats: ${flatLabels.join(', ')}.`
              : 'Finish onboarding to activate access.',
        },
      })
    }

    if (syncedExistingLoginUserIds.size > 0) {
      await recomputeUserAccessForActiveBillingPeriods(
        client,
        authMe.user.societyId,
        [...syncedExistingLoginUserIds],
      )
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
        skippedInvalidLoginIdentity,
        skippedDuplicateLoginIdentity,
        syncedExistingLoginFlats,
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
    skippedInvalidLoginIdentity,
    skippedDuplicateLoginIdentity,
    syncedExistingLoginFlats,
    emailDelivery,
  })
})
