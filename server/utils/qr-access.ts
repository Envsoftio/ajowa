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
  const [encoded, signature] = token.split('.')
  if (!encoded || !signature || !safeEqual(sign(encoded), signature)) {
    throw new AppError({ code: 'VALIDATION_ERROR', statusCode: 400, message: 'QR code is invalid.' })
  }

  return JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as {
    userId: string
    billingPeriodId: string
    societyId?: string
    validUntil: string
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
      select id
      from billing_periods
      where society_id = $1 and start_date <= current_date and end_date >= current_date
      order by start_date desc
      limit 1
    `,
    [societyId],
  )
  return result.rows[0]?.id ?? null
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

    const dueByFlat = new Map(dues.rows.map((row) => [row.flat_id, row]))
    const unpaidLabels = accessRows
      .filter((flat) => {
        const due = dueByFlat.get(flat.flat_id)
        return !due || !['PAID', 'WAIVED'].includes(due.status)
      })
      .map((flat) => flat.label)

    const totalDue = dues.rows.reduce((sum, due) => sum + Number(due.total_amount), 0)
    const totalPaid = dues.rows.reduce((sum, due) => sum + Number(due.paid_amount), 0)
    const totalBalance = dues.rows.reduce((sum, due) => sum + Number(due.balance_amount), 0)
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

export const recomputeUserAccessForActiveBillingPeriods = async (
  client: PoolClient,
  societyId: string,
  userIds: string[],
) => {
  const uniqueUserIds = [...new Set(userIds)].filter(Boolean)
  if (uniqueUserIds.length === 0) return

  const periods = await client.query<{ id: string }>(
    `
      select id
      from billing_periods
      where society_id = $1
        and start_date <= current_date
        and end_date >= current_date
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
    payload: { path: '/my/qr' },
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

    const existing = await client.query(
      `
        select id, qr_payload, qr_image_path, expires_at::text, valid_until::text, generated_at::text
        from access_tokens
        where user_id = $1 and billing_period_id = $2 and status = 'ACTIVE' and is_valid = true
        limit 1
      `,
      [userId, billingPeriodId],
    )

    if (existing.rows[0]) {
      await client.query('commit')
      return { access, token: existing.rows[0] }
    }

    const validUntil = new Date()
    validUntil.setDate(validUntil.getDate() + 32)
    const payload = {
      userId,
      billingPeriodId,
      societyId: grantedAccess.society_id,
      validUntil: validUntil.toISOString(),
    }
    const signedToken = signQrPayload(payload)
    const tokenId = randomUUID()
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
        validUntil.toISOString(),
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
      }>(
        `
          select id, status, is_valid, expires_at::text, user_id, society_id, billing_period_id
          from access_tokens
          where token_hash = $1 and society_id = $2
          limit 1
        `,
        [tokenHash, societyId],
      )
      const row = token.rows[0]
      tokenId = row?.id ?? null

      if (!row || row.user_id !== parsed.userId || row.billing_period_id !== parsed.billingPeriodId || row.society_id !== societyId) {
        scanResult = 'INVALID'
        denialReason = 'QR code is not recognized.'
      } else if (new Date(parsed.validUntil).getTime() <= Date.now() || (row.expires_at && new Date(row.expires_at).getTime() <= Date.now())) {
        scanResult = 'EXPIRED'
        denialReason = 'QR code has expired.'
      } else if (row.status !== 'ACTIVE' || !row.is_valid) {
        scanResult = 'REVOKED'
        denialReason = 'QR code has been revoked.'
      } else {
        const access = await recomputeUserAccess(row.user_id, row.billing_period_id, client)
        if (!access?.is_access_granted) {
          scanResult = 'DENIED'
          denialReason = access?.unpaid_flat_numbers.length
            ? `Blocked by unpaid flat(s): ${access.unpaid_flat_numbers.join(', ')}`
            : 'Access is currently blocked.'
        } else {
          const resident = await client.query<{ full_name: string; flat_labels: string[] }>(
            `
              select
                u.full_name,
                coalesce(array_agg(distinct concat(b.name, ' ', f.flat_number) order by concat(b.name, ' ', f.flat_number)), array[]::text[]) as flat_labels
              from users u
              left join flat_residents fr on fr.user_id = u.id and fr.is_active = true
              left join flats f on f.id = fr.flat_id
              left join blocks b on b.id = f.block_id
              where u.id = $1
              group by u.id
            `,
            [row.user_id],
          )
          residentName = resident.rows[0]?.full_name ?? null
          flatLabels = resident.rows[0]?.flat_labels ?? []
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
