import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto'
import type { PoolClient } from 'pg'
import QRCode from 'qrcode'
import { z } from 'zod'
import { getDatabasePool } from './database'
import { getValidatedRuntimeConfig } from './env'
import { AppError } from './errors'
import { normalizeSocietySettings } from './master-data'
import { enqueueNotificationForUsers } from './notifications'
import { createStorageObjectKey, uploadPrivateFile } from './storage'

type AccessScope = 'OWNERSHIP' | 'TENANCY' | 'HOUSEHOLD'
type ScanResult = 'GRANTED' | 'DENIED' | 'EXPIRED' | 'REVOKED' | 'INVALID'

type RelatedFlatRow = {
  flat_id: string
  label: string
  relationship_type: string
  access_scope: AccessScope | null
}

type DueAccessRow = {
  flat_id: string
  label: string
  total_amount: string
  paid_amount: string
  balance_amount: string
  status: string
}

type AccessStatusRow = {
  id: string
  society_id: string
  user_id: string
  billing_period_id: string
  is_access_granted: boolean
  access_basis: AccessScope | null
  unpaid_flat_numbers: string[]
  total_flats: number
  total_paid_flats: number
  total_unpaid_flats: number
  total_due_all_flats: string
  total_paid_all_flats: string
  total_balance_all_flats: string
  override_state: string | null
  override_reason: string | null
  override_expires_at: string | null
  computed_at: string
}

type AccessRecomputePair = {
  userId: string
  billingPeriodId: string
}

type BatchAccessStatusRow = {
  id: string
  society_id: string
  user_id: string
  billing_period_id: string
  is_access_granted: boolean
  was_access_granted: boolean | null
}

type BillingPeriodQrRow = {
  id: string
  society_id: string
  valid_until: string
  is_current: boolean
}

type ParsedQrPayload = {
  userId: string
  billingPeriodId: string
  societyId?: string
  tokenId?: string
  validUntil: string
}

type NotificationUserRow = {
  id: string
  email: string | null
  mobile_number: string | null
  whatsapp_number: string | null
  preferred_notification_channels: 'PUSH' | 'EMAIL' | 'WHATSAPP' | 'IN_APP' | 'PUSH_AND_EMAIL' | 'PUSH_AND_WHATSAPP' | 'EMAIL_AND_WHATSAPP' | 'PUSH_EMAIL_WHATSAPP' | 'ALL_CHANNELS'
  notification_push_enabled: boolean
  notification_email_enabled: boolean
  notification_whatsapp_enabled: boolean
  notification_in_app_enabled: boolean
}

export const qrVerifySchema = z.object({
  token: z.string().trim().min(20),
  gateName: z.string().trim().max(120).optional(),
  deviceId: z.string().trim().max(160).optional(),
})

export const accessOverrideSchema = z.object({
  userId: z.string().uuid(),
  billingPeriodId: z.string().uuid(),
  state: z.enum(['GRANTED', 'BLOCKED']),
  reason: z.string().trim().min(5).max(500),
  expiresAt: z.string().datetime().optional(),
})

const qrPayloadSchema = z.object({
  userId: z.string().uuid(),
  billingPeriodId: z.string().uuid(),
  societyId: z.string().uuid().optional(),
  tokenId: z.string().uuid().optional(),
  validUntil: z.string().datetime(),
})

const base64url = (input: string | Buffer) => Buffer.from(input).toString('base64url')
const sha256 = (value: string) => createHash('sha256').update(value).digest('hex')

const getQrSecret = () => getValidatedRuntimeConfig(useRuntimeConfig()).qrSecret

const sign = (value: string) => createHmac('sha256', getQrSecret()).update(value).digest('base64url')

const safeEqual = (left: string, right: string) => {
  const leftBuffer = Buffer.from(left)
  const rightBuffer = Buffer.from(right)
  return leftBuffer.length === rightBuffer.length && timingSafeEqual(leftBuffer, rightBuffer)
}

const signQrPayload = (payload: Record<string, unknown>) => {
  const encoded = base64url(JSON.stringify(payload))
  return `${encoded}.${sign(encoded)}`
}

export const parseQrPayload = (token: string) => {
  const tokenParts = token.split('.')
  if (tokenParts.length !== 2) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'QR code is invalid.' })
  }
  const [encoded, signature] = tokenParts
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'QR code is invalid.' })
  }

  try {
    return qrPayloadSchema.parse(JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8'))) as ParsedQrPayload
  } catch {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'QR code is invalid.' })
  }
}

const mapNotificationUser = (row: NotificationUserRow) => ({
  id: row.id,
  email: row.email,
  mobileNumber: row.mobile_number,
  whatsappNumber: row.whatsapp_number,
  preferredNotificationChannels: row.preferred_notification_channels,
  pushEnabled: row.notification_push_enabled,
  emailEnabled: row.notification_email_enabled,
  whatsappEnabled: row.notification_whatsapp_enabled,
  inAppEnabled: row.notification_in_app_enabled,
})

const importedOwnerEmailExpression = (relationshipAlias: string) => `
  case
    when ${relationshipAlias}.import_metadata->>'relationshipSource' = 'OWNER'
      and upper(coalesce(btrim(${relationshipAlias}.import_metadata #>> '{sourceData,EMAIL ID}'), '')) not in ('', 'NA', 'N/A', 'NIL', '-', '--')
    then btrim(${relationshipAlias}.import_metadata #>> '{sourceData,EMAIL ID}')
    else null
  end
`

const importedOwnerEmailJoin = `
  left join lateral (
    select ${importedOwnerEmailExpression('email_fr')} as email
    from flat_residents email_fr
    where email_fr.user_id = u.id
      and email_fr.is_active = true
      and ${importedOwnerEmailExpression('email_fr')} is not null
    order by email_fr.is_billing_contact desc, email_fr.is_primary_contact desc, email_fr.created_at
    limit 1
  ) imported_email on true
`

export const getCurrentBillingPeriodId = async (client: PoolClient, societyId: string) => {
  const result = await client.query<{ id: string }>(
    `
      select bp.id
      from billing_periods bp
      inner join society_profile sp on sp.id = bp.society_id
      where bp.society_id = $1
        and bp.start_date <= (now() at time zone sp.timezone)::date
        and bp.end_date >= (now() at time zone sp.timezone)::date
      order by
        case when bp.charge_type = 'CAM' then 0 else 1 end,
        bp.start_date desc,
        bp.end_date asc
      limit 1
    `,
    [societyId],
  )
  return result.rows[0]?.id ?? null
}

const getBillingPeriodForQr = async (client: PoolClient, billingPeriodId: string) => {
  const result = await client.query<BillingPeriodQrRow>(
    `
      select
        bp.id,
        bp.society_id,
        ((bp.end_date + 1)::timestamp at time zone sp.timezone)::text as valid_until,
        (
          bp.start_date <= (now() at time zone sp.timezone)::date
          and bp.end_date >= (now() at time zone sp.timezone)::date
        ) as is_current
      from billing_periods bp
      inner join society_profile sp on sp.id = bp.society_id
      where bp.id = $1
      limit 1
    `,
    [billingPeriodId],
  )

  return result.rows[0] ?? null
}

const getAccessRows = async (client: PoolClient, userId: string) => {
  const result = await client.query<RelatedFlatRow>(
    `
      select
        fr.flat_id,
        concat(b.name, ' ', f.flat_number) as label,
        fr.relationship_type::text,
        fr.access_scope
      from flat_residents fr
      inner join flats f on f.id = fr.flat_id
      inner join blocks b on b.id = f.block_id
      where fr.user_id = $1
        and fr.is_active = true
        and (fr.ended_at is null or fr.ended_at > now())
        and (
          fr.relationship_type = 'OWNER'
          or (
            fr.relationship_type = 'TENANT'
            and (fr.lease_start_date is null or fr.lease_start_date <= current_date)
            and (fr.lease_end_date is null or fr.lease_end_date >= current_date)
          )
          or fr.relationship_type = 'FAMILY_MEMBER'
        )
      order by b.name, f.flat_number
    `,
    [userId],
  )
  return result.rows
}

const deriveBasis = (rows: RelatedFlatRow[]): AccessScope | null => {
  if (rows.some((row) => row.relationship_type === 'OWNER')) return 'OWNERSHIP'
  if (rows.some((row) => row.relationship_type === 'TENANT')) return 'TENANCY'
  if (rows.some((row) => row.relationship_type === 'FAMILY_MEMBER')) return 'HOUSEHOLD'
  return null
}

const uniqueAccessRows = (rows: RelatedFlatRow[]) => {
  const byFlat = new Map<string, RelatedFlatRow>()
  for (const row of rows) {
    if (!byFlat.has(row.flat_id)) byFlat.set(row.flat_id, row)
  }
  return [...byFlat.values()]
}

const isDueClearForQrAccess = (due: DueAccessRow, isCamAdvanceCovered: boolean) =>
  ['PAID', 'WAIVED'].includes(due.status) ||
  Number(due.balance_amount) <= 0 ||
  isCamAdvanceCovered

export const recomputeUserAccess = async (
  userId: string,
  billingPeriodId: string,
  clientInput?: PoolClient,
) => {
  const ownedClient = !clientInput
  const client = clientInput ?? (await getDatabasePool().connect())

  try {
    if (ownedClient) await client.query('begin')

    const userResult = await client.query<{ society_id: string }>(
      `select society_id from users where id = $1 and is_active = true limit 1`,
      [userId],
    )
    const societyId = userResult.rows[0]?.society_id
    if (!societyId) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'User not found.' })
    }

    const settingsResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [societyId],
    )
    const societySettings = normalizeSocietySettings(settingsResult.rows[0]?.settings)
    const relatedFlats = await getAccessRows(client, userId)
    const accessRows = uniqueAccessRows(
      relatedFlats.filter((row) => {
        if (row.relationship_type === 'OWNER') return true
        if (row.relationship_type === 'TENANT') return true
        if (row.relationship_type === 'FAMILY_MEMBER') {
          return societySettings.familyAccessEnabled && (row.access_scope ?? 'HOUSEHOLD') === 'HOUSEHOLD'
        }
        return false
      }),
    )
    const flatIds = accessRows.map((row) => row.flat_id)
    const dues = flatIds.length
      ? await client.query<DueAccessRow>(
          `
            select
              md.flat_id,
              concat(b.name, ' ', f.flat_number) as label,
              md.total_amount::text,
              md.paid_amount::text,
              md.balance_amount::text,
              md.status::text
            from maintenance_dues md
            inner join flats f on f.id = md.flat_id
            inner join blocks b on b.id = f.block_id
            where md.billing_period_id = $1 and md.flat_id = any($2::uuid[])
          `,
          [billingPeriodId, flatIds],
        )
      : { rows: [] as DueAccessRow[] }
    const covered = flatIds.length
      ? await client.query<{ flat_id: string }>(
          `
            select distinct coverage.flat_id
            from cam_advance_coverages coverage
            inner join billing_periods bp on bp.id = $1 and bp.society_id = coverage.society_id
            where coverage.flat_id = any($2::uuid[])
              and coverage.is_active = true
              and bp.charge_type = 'CAM'
              and coverage.covered_from <= bp.start_date
              and coverage.covered_until >= bp.end_date
          `,
          [billingPeriodId, flatIds],
        )
      : { rows: [] as Array<{ flat_id: string }> }

    const dueByFlat = new Map(dues.rows.map((row) => [row.flat_id, row]))
    const coveredFlatIds = new Set(covered.rows.map((row) => row.flat_id))
    const unpaidLabels = accessRows
      .filter((flat) => {
        const due = dueByFlat.get(flat.flat_id)
        const isCamAdvanceCovered = coveredFlatIds.has(flat.flat_id)
        return due
          ? !isDueClearForQrAccess(due, isCamAdvanceCovered)
          : !isCamAdvanceCovered
      })
      .map((flat) => flat.label)

    const totalDue = dues.rows.reduce((sum, due) => sum + Number(due.total_amount), 0)
    const totalPaid = dues.rows.reduce((sum, due) => sum + Number(due.paid_amount), 0)
    const totalBalance = dues.rows.reduce(
      (sum, due) =>
        sum + (isDueClearForQrAccess(due, coveredFlatIds.has(due.flat_id)) ? 0 : Number(due.balance_amount)),
      0,
    )
    const grantedByPolicy = accessRows.length > 0 && unpaidLabels.length === 0

    const previous = await client.query<{ is_access_granted: boolean }>(
      `select is_access_granted from user_access_status where user_id = $1 and billing_period_id = $2`,
      [userId, billingPeriodId],
    )

    const upserted = await client.query<AccessStatusRow>(
      `
        insert into user_access_status (
          society_id,
          user_id,
          billing_period_id,
          is_access_granted,
          access_basis,
          unpaid_flat_numbers,
          total_flats,
          total_paid_flats,
          total_unpaid_flats,
          total_due_all_flats,
          total_paid_all_flats,
          total_balance_all_flats,
          computed_at
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, now())
        on conflict (user_id, billing_period_id)
        do update set
          is_access_granted = case
            when user_access_status.override_state = 'GRANTED'
              and (user_access_status.override_expires_at is null or user_access_status.override_expires_at > now()) then true
            when user_access_status.override_state = 'BLOCKED'
              and (user_access_status.override_expires_at is null or user_access_status.override_expires_at > now()) then false
            else excluded.is_access_granted
          end,
          access_basis = excluded.access_basis,
          unpaid_flat_numbers = excluded.unpaid_flat_numbers,
          total_flats = excluded.total_flats,
          total_paid_flats = excluded.total_paid_flats,
          total_unpaid_flats = excluded.total_unpaid_flats,
          total_due_all_flats = excluded.total_due_all_flats,
          total_paid_all_flats = excluded.total_paid_all_flats,
          total_balance_all_flats = excluded.total_balance_all_flats,
          computed_at = now(),
          updated_at = now()
        returning *
      `,
      [
        societyId,
        userId,
        billingPeriodId,
        grantedByPolicy,
        deriveBasis(accessRows),
        unpaidLabels,
        accessRows.length,
        accessRows.length - unpaidLabels.length,
        unpaidLabels.length,
        totalDue,
        totalPaid,
        totalBalance,
      ],
    )

    const access = upserted.rows[0]
    if (!access?.is_access_granted) {
      await revokeActiveQr(client, userId, billingPeriodId, 'Access is currently blocked by maintenance status.')
    }

    if (previous.rows[0]?.is_access_granted && access && !access.is_access_granted) {
      await enqueueAccessNotification(client, access.society_id, userId, 'access_qr.revoked', {
        title: 'Gate QR access blocked',
        body: 'Your gate QR access is currently blocked. Please check your maintenance status.',
        sourceId: access.id,
      })
    }

    if (ownedClient) await client.query('commit')
    return access
  } catch (error) {
    if (ownedClient) await client.query('rollback')
    throw error
  } finally {
    if (ownedClient) client.release()
  }
}

const enqueueBulkAccessRevokedNotifications = async (
  client: PoolClient,
  revokedRows: BatchAccessStatusRow[],
) => {
  if (revokedRows.length === 0) return

  const rowsBySociety = new Map<string, BatchAccessStatusRow[]>()
  for (const row of revokedRows) {
    rowsBySociety.set(row.society_id, [
      ...(rowsBySociety.get(row.society_id) ?? []),
      row,
    ])
  }

  for (const [societyId, rows] of rowsBySociety.entries()) {
    const userIds = [...new Set(rows.map((row) => row.user_id))]
    const users = await client.query<NotificationUserRow>(
      `
        select
          u.id,
          coalesce(nullif(btrim(u.email::text), ''), imported_email.email) as email,
          u.mobile_number,
          u.whatsapp_number,
          u.preferred_notification_channels,
          u.notification_push_enabled,
          u.notification_email_enabled,
          u.notification_whatsapp_enabled,
          u.notification_in_app_enabled
        from users u
        ${importedOwnerEmailJoin}
        where u.id = any($1::uuid[]) and u.is_active = true
      `,
      [userIds],
    )

    await enqueueNotificationForUsers(client, {
      societyId,
      eventKey: 'access_qr.revoked',
      category: 'ACCESS_QR',
      sourceTable: 'user_access_status',
      priority: 'HIGH',
      title: 'Gate QR access blocked',
      body: 'Your gate QR access is currently blocked. Please check your maintenance status.',
      payload: { path: '/my/qr', deepLinkUrl: '/my/qr' },
      idempotencyKey: `access_qr.revoked:bulk:${sha256(
        rows
          .map((row) => `${row.user_id}:${row.billing_period_id}`)
          .sort()
          .join('|'),
      )}`,
      users: users.rows.map(mapNotificationUser),
    })
  }
}

export const recomputeUserAccessForPairs = async (
  client: PoolClient,
  pairs: AccessRecomputePair[],
) => {
  const uniquePairs = [
    ...new Map(
      pairs
        .filter((pair) => pair.userId && pair.billingPeriodId)
        .map((pair) => [`${pair.userId}:${pair.billingPeriodId}`, pair]),
    ).values(),
  ]

  if (uniquePairs.length === 0) {
    return { recomputed: 0, revoked: 0 }
  }

  const payload = JSON.stringify(
    uniquePairs.map((pair) => ({
      user_id: pair.userId,
      billing_period_id: pair.billingPeriodId,
    })),
  )

  const upserted = await client.query<BatchAccessStatusRow>(
    `
      with input_pairs as (
        select distinct user_id, billing_period_id
        from jsonb_to_recordset($1::jsonb) as payload(
          user_id uuid,
          billing_period_id uuid
        )
      ),
      active_input as (
        select
          u.society_id,
          input_pairs.user_id,
          input_pairs.billing_period_id
        from input_pairs
        inner join users u on u.id = input_pairs.user_id and u.is_active = true
      ),
      society_settings as (
        select
          sp.id as society_id,
          case
            when jsonb_typeof(sp.settings->'familyAccessEnabled') = 'boolean'
              then (sp.settings->>'familyAccessEnabled')::boolean
            when jsonb_typeof(sp.settings->'familyAccess') = 'boolean'
              then (sp.settings->>'familyAccess')::boolean
            else true
          end as family_access_enabled
        from society_profile sp
        where sp.id in (select distinct society_id from active_input)
      ),
      relationship_rows as (
        select distinct on (ai.user_id, ai.billing_period_id, fr.flat_id)
          ai.society_id,
          ai.user_id,
          ai.billing_period_id,
          fr.flat_id,
          concat(b.name, ' ', f.flat_number) as label,
          fr.relationship_type::text as relationship_type
        from active_input ai
        inner join society_settings ss on ss.society_id = ai.society_id
        inner join flat_residents fr on fr.user_id = ai.user_id
        inner join flats f on f.id = fr.flat_id
        inner join blocks b on b.id = f.block_id
        where fr.is_active = true
          and (fr.ended_at is null or fr.ended_at > now())
          and (
            fr.relationship_type = 'OWNER'
            or (
              fr.relationship_type = 'TENANT'
              and (fr.lease_start_date is null or fr.lease_start_date <= current_date)
              and (fr.lease_end_date is null or fr.lease_end_date >= current_date)
            )
            or fr.relationship_type = 'FAMILY_MEMBER'
          )
          and (
            fr.relationship_type <> 'FAMILY_MEMBER'
            or (ss.family_access_enabled and coalesce(fr.access_scope, 'HOUSEHOLD') = 'HOUSEHOLD')
          )
        order by ai.user_id, ai.billing_period_id, fr.flat_id, b.name, f.flat_number, fr.created_at
      ),
      access_rows as (
        select
          rr.*,
          md.id as due_id,
          coalesce(md.total_amount, 0) as total_amount,
          coalesce(md.paid_amount, 0) as paid_amount,
          coalesce(md.balance_amount, 0) as balance_amount,
          md.status::text as status,
          (
            bp.charge_type = 'CAM'
            and exists (
              select 1
              from cam_advance_coverages coverage
              where coverage.society_id = bp.society_id
                and coverage.flat_id = rr.flat_id
                and coverage.is_active = true
                and coverage.covered_from <= bp.start_date
                and coverage.covered_until >= bp.end_date
            )
          ) as is_cam_advance_covered
        from relationship_rows rr
        inner join billing_periods bp on bp.id = rr.billing_period_id
        left join maintenance_dues md
          on md.billing_period_id = rr.billing_period_id
          and md.flat_id = rr.flat_id
      ),
      access_agg as (
        select
          ar.society_id,
          ar.user_id,
          ar.billing_period_id,
          count(*)::integer as total_flats,
          case
            when bool_or(ar.relationship_type = 'OWNER') then 'OWNERSHIP'::access_scope
            when bool_or(ar.relationship_type = 'TENANT') then 'TENANCY'::access_scope
            when bool_or(ar.relationship_type = 'FAMILY_MEMBER') then 'HOUSEHOLD'::access_scope
            else null::access_scope
          end as access_basis,
          coalesce(
            array_agg(ar.label order by ar.label) filter (
              where (ar.due_id is not null and not (
                ar.status in ('PAID', 'WAIVED')
                or ar.balance_amount <= 0
                or ar.is_cam_advance_covered
              ))
                or (ar.due_id is null and not ar.is_cam_advance_covered)
            ),
            array[]::text[]
          ) as unpaid_flat_numbers,
          count(*) filter (
            where (ar.due_id is not null and (
                ar.status in ('PAID', 'WAIVED')
                or ar.balance_amount <= 0
                or ar.is_cam_advance_covered
              ))
              or (ar.due_id is null and ar.is_cam_advance_covered)
          )::integer as total_paid_flats,
          count(*) filter (
            where (ar.due_id is not null and not (
                ar.status in ('PAID', 'WAIVED')
                or ar.balance_amount <= 0
                or ar.is_cam_advance_covered
              ))
              or (ar.due_id is null and not ar.is_cam_advance_covered)
          )::integer as total_unpaid_flats,
          coalesce(sum(ar.total_amount), 0) as total_due_all_flats,
          coalesce(sum(ar.paid_amount), 0) as total_paid_all_flats,
          coalesce(sum(
            case
              when ar.due_id is not null and (
                ar.status in ('PAID', 'WAIVED')
                or ar.balance_amount <= 0
                or ar.is_cam_advance_covered
              ) then 0
              else ar.balance_amount
            end
          ), 0) as total_balance_all_flats
        from access_rows ar
        group by ar.society_id, ar.user_id, ar.billing_period_id
      ),
      computed as (
        select
          ai.society_id,
          ai.user_id,
          ai.billing_period_id,
          (
            coalesce(aa.total_flats, 0) > 0
            and coalesce(aa.total_unpaid_flats, 0) = 0
          ) as is_access_granted,
          aa.access_basis,
          coalesce(aa.unpaid_flat_numbers, array[]::text[]) as unpaid_flat_numbers,
          coalesce(aa.total_flats, 0)::integer as total_flats,
          coalesce(aa.total_paid_flats, 0)::integer as total_paid_flats,
          coalesce(aa.total_unpaid_flats, 0)::integer as total_unpaid_flats,
          coalesce(aa.total_due_all_flats, 0) as total_due_all_flats,
          coalesce(aa.total_paid_all_flats, 0) as total_paid_all_flats,
          coalesce(aa.total_balance_all_flats, 0) as total_balance_all_flats
        from active_input ai
        left join access_agg aa
          on aa.user_id = ai.user_id
          and aa.billing_period_id = ai.billing_period_id
      ),
      previous as (
        select
          uas.user_id,
          uas.billing_period_id,
          uas.is_access_granted
        from user_access_status uas
        inner join computed c
          on c.user_id = uas.user_id
          and c.billing_period_id = uas.billing_period_id
      ),
      upserted as (
        insert into user_access_status (
          society_id,
          user_id,
          billing_period_id,
          is_access_granted,
          access_basis,
          unpaid_flat_numbers,
          total_flats,
          total_paid_flats,
          total_unpaid_flats,
          total_due_all_flats,
          total_paid_all_flats,
          total_balance_all_flats,
          computed_at
        )
        select
          c.society_id,
          c.user_id,
          c.billing_period_id,
          c.is_access_granted,
          c.access_basis,
          c.unpaid_flat_numbers,
          c.total_flats,
          c.total_paid_flats,
          c.total_unpaid_flats,
          c.total_due_all_flats,
          c.total_paid_all_flats,
          c.total_balance_all_flats,
          now()
        from computed c
        on conflict (user_id, billing_period_id)
        do update set
          is_access_granted = case
            when user_access_status.override_state = 'GRANTED'
              and (user_access_status.override_expires_at is null or user_access_status.override_expires_at > now()) then true
            when user_access_status.override_state = 'BLOCKED'
              and (user_access_status.override_expires_at is null or user_access_status.override_expires_at > now()) then false
            else excluded.is_access_granted
          end,
          access_basis = excluded.access_basis,
          unpaid_flat_numbers = excluded.unpaid_flat_numbers,
          total_flats = excluded.total_flats,
          total_paid_flats = excluded.total_paid_flats,
          total_unpaid_flats = excluded.total_unpaid_flats,
          total_due_all_flats = excluded.total_due_all_flats,
          total_paid_all_flats = excluded.total_paid_all_flats,
          total_balance_all_flats = excluded.total_balance_all_flats,
          computed_at = now(),
          updated_at = now()
        returning
          id,
          society_id,
          user_id,
          billing_period_id,
          is_access_granted
      )
      select
        upserted.id,
        upserted.society_id,
        upserted.user_id,
        upserted.billing_period_id,
        upserted.is_access_granted,
        previous.is_access_granted as was_access_granted
      from upserted
      left join previous
        on previous.user_id = upserted.user_id
        and previous.billing_period_id = upserted.billing_period_id
    `,
    [payload],
  )

  const revokedRows = upserted.rows.filter(
    (row) => row.was_access_granted && !row.is_access_granted,
  )

  if (revokedRows.length > 0) {
    await client.query(
      `
        update access_tokens token
        set status = 'REVOKED',
            is_valid = false,
            revoked_at = coalesce(token.revoked_at, now()),
            revoked_reason = $2,
            updated_at = now()
        from jsonb_to_recordset($1::jsonb) as payload(
          user_id uuid,
          billing_period_id uuid
        )
        where token.user_id = payload.user_id
          and token.billing_period_id = payload.billing_period_id
          and token.status = 'ACTIVE'
          and token.is_valid = true
      `,
      [
        JSON.stringify(
          revokedRows.map((row) => ({
            user_id: row.user_id,
            billing_period_id: row.billing_period_id,
          })),
        ),
        'Access is currently blocked by maintenance status.',
      ],
    )

    await enqueueBulkAccessRevokedNotifications(client, revokedRows)
  }

  return {
    recomputed: upserted.rows.length,
    revoked: revokedRows.length,
  }
}

export const recomputeUserAccessForActiveBillingPeriods = async (
  client: PoolClient,
  societyId: string,
  userIds: string[],
) => {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean)
  if (uniqueUserIds.length === 0) return

  const periods = await client.query<{ id: string }>(
    `
      select bp.id
      from billing_periods bp
      inner join society_profile sp on sp.id = bp.society_id
      where bp.society_id = $1
        and bp.start_date <= (now() at time zone sp.timezone)::date
        and bp.end_date >= (now() at time zone sp.timezone)::date
    `,
    [societyId],
  )

  for (const period of periods.rows) {
    for (const userId of uniqueUserIds) {
      await recomputeUserAccess(userId, period.id, client)
    }
  }
}

export const revokeActiveQr = async (
  client: PoolClient,
  userId: string,
  billingPeriodId: string,
  reason: string,
) => {
  await client.query(
    `
      update access_tokens
      set status = 'REVOKED',
          is_valid = false,
          revoked_at = coalesce(revoked_at, now()),
          revoked_reason = $3,
          updated_at = now()
      where user_id = $1
        and billing_period_id = $2
        and status = 'ACTIVE'
        and is_valid = true
    `,
    [userId, billingPeriodId, reason],
  )
}

const enqueueAccessNotification = async (
  client: PoolClient,
  societyId: string,
  userId: string,
  eventKey: 'access_qr.generated' | 'access_qr.revoked',
  content: { title: string; body: string; sourceId: string },
) => {
  const users = await client.query<NotificationUserRow>(
    `
      select
        u.id,
        coalesce(nullif(btrim(u.email::text), ''), imported_email.email) as email,
        u.mobile_number,
        u.whatsapp_number,
        u.preferred_notification_channels,
        u.notification_push_enabled,
        u.notification_email_enabled,
        u.notification_whatsapp_enabled,
        u.notification_in_app_enabled
      from users u
      ${importedOwnerEmailJoin}
      where u.id = $1 and u.is_active = true
    `,
    [userId],
  )

  await enqueueNotificationForUsers(client, {
    societyId,
    eventKey,
    category: 'ACCESS_QR',
    sourceTable: 'access_tokens',
    sourceId: content.sourceId,
    priority: 'HIGH',
    title: content.title,
    body: content.body,
    payload: { path: '/my/qr', deepLinkUrl: '/my/qr' },
    idempotencyKey: `${eventKey}:${content.sourceId}`,
    users: users.rows.map(mapNotificationUser),
  })
}

export const ensureQrForAccess = async (userId: string, billingPeriodId: string) => {
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const access = await recomputeUserAccess(userId, billingPeriodId, client)
    if (!access?.is_access_granted) {
      await client.query('commit')
      return { access, token: null }
    }
    const grantedAccess = access
    const period = await getBillingPeriodForQr(client, billingPeriodId)

    if (!period || period.society_id !== grantedAccess.society_id || !period.is_current) {
      await revokeActiveQr(client, userId, billingPeriodId, 'Billing period is not currently active.')
      await client.query('commit')
      return { access, token: null }
    }
    const periodValidUntil = new Date(period.valid_until).toISOString()

    await client.query(
      `
        update access_tokens
        set status = 'EXPIRED',
            is_valid = false,
            updated_at = now()
        where user_id = $1
          and billing_period_id = $2
          and status = 'ACTIVE'
          and is_valid = true
          and (
            coalesce(expires_at, valid_until) <= now()
            or coalesce(expires_at, valid_until) is distinct from $3::timestamptz
          )
      `,
      [userId, billingPeriodId, periodValidUntil],
    )

    const existing = await client.query(
      `
        select id, qr_payload, qr_image_path, expires_at::text, valid_until::text, generated_at::text
        from access_tokens
        where user_id = $1 and billing_period_id = $2 and status = 'ACTIVE' and is_valid = true
          and coalesce(expires_at, valid_until) > now()
          and coalesce(expires_at, valid_until) = $3::timestamptz
        limit 1
      `,
      [userId, billingPeriodId, periodValidUntil],
    )

    if (existing.rows[0]) {
      await client.query('commit')
      return { access, token: existing.rows[0] }
    }

    const tokenId = randomUUID()
    const payload = {
      userId,
      billingPeriodId,
      societyId: grantedAccess.society_id,
      tokenId,
      validUntil: periodValidUntil,
    }
    const signedToken = signQrPayload(payload)
    const qrImage = await QRCode.toDataURL(signedToken, { margin: 1, width: 360 })
    const imageMatch = qrImage.match(/^data:image\/png;base64,(.+)$/)
    if (!imageMatch?.[1]) {
      throw new AppError({ code: 'INTERNAL_ERROR', statusCode: 500, message: 'QR image generation failed.' })
    }
    const qrImageBuffer = Buffer.from(imageMatch[1], 'base64')
    const qrImagePath = createStorageObjectKey({
      recordType: 'access-token',
      recordId: tokenId,
      fileName: 'gate-qr.png',
    })
    const tokenHash = sha256(signedToken)

    await uploadPrivateFile({
      storageTargetKey: 'qr_images',
      storageObjectKey: qrImagePath,
      originalFileName: 'ajowa-gate-qr.png',
      mimeType: 'image/png',
      sizeBytes: qrImageBuffer.length,
      body: qrImageBuffer,
      uploadedBy: userId,
      relation: {
        recordType: 'access_tokens',
        recordId: tokenId,
      },
      checksum: createHash('sha256').update(qrImageBuffer).digest('hex'),
    }, {
      dbClient: client,
    })

    const inserted = await client.query(
      `
        insert into access_tokens (
          id,
          society_id,
          user_id,
          billing_period_id,
          token_hash,
          qr_payload,
          qr_image_path,
          expires_at,
          valid_until
        )
        values ($1, $2, $3, $4, $5, $6::jsonb, $7, $8, $8)
        returning id, qr_payload, qr_image_path, expires_at::text, valid_until::text, generated_at::text
      `,
      [
        tokenId,
        grantedAccess.society_id,
        userId,
        billingPeriodId,
        tokenHash,
        JSON.stringify(payload),
        qrImagePath,
        payload.validUntil,
      ],
    )

    await enqueueAccessNotification(client, grantedAccess.society_id, userId, 'access_qr.generated', {
      title: 'Gate QR ready',
      body: 'Your gate QR is ready for the current billing period.',
      sourceId: inserted.rows[0].id,
    })

    await client.query('commit')
    return { access, token: inserted.rows[0] }
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
}

export const verifyQrToken = async (
  input: z.infer<typeof qrVerifySchema>,
  guardUserId: string,
  societyId: string,
) => {
  const client = await getDatabasePool().connect()
  let scanResult: ScanResult = 'INVALID'
  let denialReason = 'Invalid QR code.'
  let parsed: ReturnType<typeof parseQrPayload> | null
  let tokenId: string | null = null
  let residentName: string | null = null
  let flatLabels: string[] = []

  try {
    try {
      parsed = parseQrPayload(input.token)
    } catch {
      parsed = null
    }

    if (parsed) {
      const tokenHash = sha256(input.token)
      const token = await client.query<{
        id: string
        status: string
        is_valid: boolean
        expires_at: string | null
        user_id: string
        society_id: string
        billing_period_id: string
        is_current_period: boolean
        access_is_granted: boolean | null
        unpaid_flat_numbers: string[] | null
        resident_name: string | null
        flat_labels: string[] | null
      }>(
        `
          select
            at.id,
            at.status,
            at.is_valid,
            coalesce(at.expires_at, at.valid_until)::text as expires_at,
            at.user_id,
            at.society_id,
            at.billing_period_id,
            (
              bp.start_date <= (now() at time zone sp.timezone)::date
              and bp.end_date >= (now() at time zone sp.timezone)::date
            ) as is_current_period,
            uas.is_access_granted as access_is_granted,
            uas.unpaid_flat_numbers,
            u.full_name as resident_name,
            coalesce(flat_lookup.flat_labels, array[]::text[]) as flat_labels
          from access_tokens at
          inner join billing_periods bp on bp.id = at.billing_period_id
          inner join society_profile sp on sp.id = at.society_id
          inner join users u on u.id = at.user_id and u.is_active = true
          left join user_access_status uas
            on uas.user_id = at.user_id
            and uas.billing_period_id = at.billing_period_id
          left join lateral (
            select array_agg(distinct concat(b.name, ' ', f.flat_number) order by concat(b.name, ' ', f.flat_number)) as flat_labels
            from flat_residents fr
            inner join flats f on f.id = fr.flat_id
            inner join blocks b on b.id = f.block_id
            where fr.user_id = at.user_id
              and fr.is_active = true
          ) flat_lookup on true
          where at.token_hash = $1 and at.society_id = $2
          limit 1
        `,
        [tokenHash, societyId],
      )
      const row = token.rows[0]
      tokenId = row?.id ?? null

      if (
        !row ||
        row.user_id !== parsed.userId ||
        row.billing_period_id !== parsed.billingPeriodId ||
        row.society_id !== societyId ||
        (parsed.tokenId && row.id !== parsed.tokenId)
      ) {
        scanResult = 'INVALID'
        denialReason = 'QR code is not recognized.'
      } else if (new Date(parsed.validUntil).getTime() <= Date.now() || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
        scanResult = 'EXPIRED'
        denialReason = 'QR code has expired.'
      } else if (!row.is_current_period) {
        scanResult = 'EXPIRED'
        denialReason = 'QR code is not for the current billing period.'
      } else if (row.status !== 'ACTIVE' || !row.is_valid) {
        scanResult = 'REVOKED'
        denialReason = 'QR code has been revoked.'
      } else {
        let accessAllowed = row.access_is_granted
        let unpaidFlatNumbers = row.unpaid_flat_numbers ?? []

        if (accessAllowed === null) {
          try {
            const access = await recomputeUserAccess(row.user_id, row.billing_period_id, client)
            accessAllowed = access?.is_access_granted ?? false
            unpaidFlatNumbers = access?.unpaid_flat_numbers ?? []
          } catch {
            accessAllowed = false
            denialReason = 'Access status could not be verified.'
          }
        }

        if (!accessAllowed) {
          scanResult = 'DENIED'
          if (denialReason === 'Invalid QR code.') {
            denialReason = unpaidFlatNumbers.length
            ? `Blocked by unpaid flat(s): ${unpaidFlatNumbers.join(', ')}`
            : 'Access is currently blocked.'
          }
        } else {
          residentName = row.resident_name
          flatLabels = row.flat_labels ?? []
          scanResult = 'GRANTED'
          denialReason = ''
        }
      }
    }

    await client.query(
        `
        insert into gate_scan_logs (
          society_id,
          billing_period_id,
          user_id,
          access_token_id,
          guard_user_id,
          scan_result,
          denial_reason,
          gate_name,
          device_id,
          scan_payload
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10::jsonb)
      `,
      [
        societyId,
        tokenId ? parsed?.billingPeriodId ?? null : null,
        tokenId ? parsed?.userId ?? null : null,
        tokenId,
        guardUserId,
        scanResult,
        denialReason || null,
        input.gateName ?? null,
        input.deviceId ?? null,
        JSON.stringify({ parsed: Boolean(parsed) }),
      ],
    )

    return {
      allowed: scanResult === 'GRANTED',
      result: scanResult,
      reason: denialReason || null,
      residentName,
      flatLabels,
    }
  } finally {
    client.release()
  }
}
