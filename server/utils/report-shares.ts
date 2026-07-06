import { createHash, randomBytes } from 'node:crypto'
import type { H3Event } from 'h3'
import { z } from 'zod'
import { AppError } from './errors'
import { getDatabasePool } from './database'
import { buildAppUrl, sendNotificationEmail } from './email'
import { queueAuditEvent } from './audit'
import {
  buildReport,
  mapSharedTypeToReportType,
  parseReportFilters,
  parseSharedReportType,
  sanitizeSharedReport,
  sharedReportTypeLabels,
  type ReportData,
  type SharedReportType,
} from './reports'
import type { AuthMe } from '~/types/auth'

type DeliveryChannel = 'EMAIL' | 'WHATSAPP' | 'COPY_LINK'
type ShareStatus = 'ACTIVE' | 'EXPIRED' | 'REVOKED' | 'CONSUMED'
type PublicShareState = 'OK' | 'INVALID' | 'EXPIRED' | 'REVOKED' | 'CONSUMED'

export type SharedReportLinkSummary = {
  id: string
  societyId: string
  ownerName: string
  ownerEmail: string | null
  flatLabel: string
  reportType: SharedReportType
  reportTypeLabel: string
  startDate: string
  endDate: string
  createdByName: string | null
  createdAt: string
  expiresAt: string
  revokedAt: string | null
  consumedAt: string | null
  status: ShareStatus
  accessCount: number
  lastAccessedAt: string | null
  deliveryState: string
  deliveryChannels: string[]
  deliveryFailure: string | null
  note: string | null
}

type ShareRow = {
  id: string
  token_hash: string
  society_id: string
  owner_user_id: string
  owner_name: string
  owner_email: string | null
  owner_mobile_number: string
  owner_whatsapp_number: string | null
  flat_id: string | null
  flat_label: string | null
  report_type: SharedReportType
  start_date: string
  end_date: string
  expires_at: string
  revoked_at: string | null
  consumed_at: string | null
  one_time_access: boolean
  access_count: number
  last_accessed_at: string | null
  delivery_state: string
  delivery_channels: string[]
  delivery_failure: string | null
  created_by_user_id: string | null
  created_by_name: string | null
  created_at: string
  note: string | null
  metadata: Record<string, unknown>
}

export const createShareSchema = z.object({
  ownerUserId: z.string().uuid(),
  flatId: z.string().uuid().optional().nullable(),
  reportType: z.enum(['INCOME_SUMMARY', 'EXPENSE_SUMMARY', 'INCOME_VS_EXPENSE', 'CATEGORY_EXPENSE_SUMMARY', 'FINANCIAL_STATEMENT']),
  startDate: z.string().date(),
  endDate: z.string().date(),
  expiresAt: z.string().datetime(),
  note: z.string().trim().max(500).optional().nullable(),
  oneTimeAccess: z.boolean().default(false),
  deliveryChannels: z.array(z.enum(['EMAIL', 'WHATSAPP', 'COPY_LINK'])).default(['COPY_LINK']),
})

export const revokeShareSchema = z.object({
  reason: z.string().trim().max(500).optional().nullable(),
})

export type CreateShareInput = z.infer<typeof createShareSchema>

const hashToken = (token: string) => createHash('sha256').update(token).digest('hex')

const generateShareToken = () => randomBytes(32).toString('base64url')

const resolveStatus = (row: Pick<ShareRow, 'expires_at' | 'revoked_at' | 'consumed_at'>): ShareStatus => {
  if (row.revoked_at) return 'REVOKED'
  if (row.consumed_at) return 'CONSUMED'
  if (new Date(row.expires_at).getTime() <= Date.now()) return 'EXPIRED'
  return 'ACTIVE'
}

const mapShareRow = (row: ShareRow): SharedReportLinkSummary => ({
  id: row.id,
  societyId: row.society_id,
  ownerName: row.owner_name,
  ownerEmail: row.owner_email,
  flatLabel: row.flat_label ?? '-',
  reportType: row.report_type,
  reportTypeLabel: sharedReportTypeLabels[row.report_type],
  startDate: row.start_date,
  endDate: row.end_date,
  createdByName: row.created_by_name,
  createdAt: row.created_at,
  expiresAt: row.expires_at,
  revokedAt: row.revoked_at,
  consumedAt: row.consumed_at,
  status: resolveStatus(row),
  accessCount: Number(row.access_count),
  lastAccessedAt: row.last_accessed_at,
  deliveryState: row.delivery_state,
  deliveryChannels: row.delivery_channels ?? [],
  deliveryFailure: row.delivery_failure,
  note: row.note,
})

const shareSelect = `
  srl.id,
  srl.token_hash,
  srl.society_id,
  srl.owner_user_id,
  owner.full_name as owner_name,
  owner.email as owner_email,
  owner.mobile_number as owner_mobile_number,
  owner.whatsapp_number as owner_whatsapp_number,
  srl.flat_id,
  concat(b.name, ' ', f.flat_number) as flat_label,
  srl.report_type::text as report_type,
  srl.start_date::text,
  srl.end_date::text,
  srl.expires_at::text,
  srl.revoked_at::text,
  srl.consumed_at::text,
  srl.one_time_access,
  srl.access_count,
  srl.last_accessed_at::text,
  srl.delivery_state::text,
  srl.delivery_channels,
  srl.delivery_failure,
  srl.created_by_user_id,
  creator.full_name as created_by_name,
  srl.created_at::text,
  srl.note,
  srl.metadata
`

const getStoredShareToken = (share: ShareRow): string | null => {
  const token = share.metadata?.token
  if (typeof token === 'string' && token.trim().length > 0) {
    return token
  }
  return null
}

const ensureShareToken = async (share: ShareRow) => {
  const storedToken = getStoredShareToken(share)

  if (storedToken && hashToken(storedToken) === share.token_hash) {
    return { share, token: storedToken }
  }

  const token = generateShareToken()
  const tokenHash = hashToken(token)

  await getDatabasePool().query(
    `
      update shared_report_links
      set token_hash = $1,
          metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object('token', $2)
      where id = $3
    `,
    [tokenHash, token, share.id],
  )

  const refreshed = await loadShareById(share.society_id, share.id)
  if (!refreshed) {
    throw new Error('Shared report link could not be loaded.')
  }

  return { share: refreshed, token }
}

const shareJoins = `
  join users owner on owner.id = srl.owner_user_id
  left join flats f on f.id = srl.flat_id
  left join blocks b on b.id = f.block_id
  left join users creator on creator.id = srl.created_by_user_id
`

const loadShareById = async (societyId: string, shareId: string) => {
  const result = await getDatabasePool().query<ShareRow>(
    `
      select ${shareSelect}
      from shared_report_links srl
      ${shareJoins}
      where srl.society_id = $1 and srl.id = $2
      limit 1
    `,
    [societyId, shareId],
  )
  return result.rows[0] ?? null
}

const assertOwnerFlat = async (societyId: string, ownerUserId: string, flatId?: string | null) => {
  const result = await getDatabasePool().query<{
    owner_name: string
    owner_email: string | null
    flat_id: string
    flat_label: string
  }>(
    `
      select
        u.full_name as owner_name,
        u.email as owner_email,
        f.id as flat_id,
        concat(b.name, ' ', f.flat_number) as flat_label
      from users u
      join flat_residents fr on fr.user_id = u.id and fr.relationship_type = 'OWNER' and fr.is_active = true
      join flats f on f.id = fr.flat_id
      join blocks b on b.id = f.block_id
      where u.society_id = $1
        and u.id = $2
        and ($3::uuid is null or f.id = $3::uuid)
      order by fr.is_primary_contact desc, b.name, f.flat_number
      limit 1
    `,
    [societyId, ownerUserId, flatId ?? null],
  )
  const row = result.rows[0]
  if (!row) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select an active owner and one of their linked flats.',
    })
  }
  return row
}

const findSimilarActiveShare = async (input: CreateShareInput, societyId: string, flatId: string) => {
  const result = await getDatabasePool().query<{ id: string }>(
    `
      select id
      from shared_report_links
      where society_id = $1
        and owner_user_id = $2
        and flat_id = $3
        and report_type = $4
        and start_date = $5
        and end_date = $6
        and expires_at > now()
        and revoked_at is null
        and consumed_at is null
      limit 1
    `,
    [societyId, input.ownerUserId, flatId, input.reportType, input.startDate, input.endDate],
  )
  return result.rows[0]?.id ?? null
}

const deliverShare = async (share: ShareRow, token: string, requestedChannels: DeliveryChannel[]) => {
  const link = buildAppUrl(`/shared/report/${token}`)
  const failures: string[] = []
  let deliveredState = requestedChannels.includes('COPY_LINK') ? 'COPIED' : 'PENDING'
  let deliveredAt: string | null = null

  if (requestedChannels.includes('EMAIL')) {
    if (!share.owner_email) {
      failures.push('Owner email is not available; copy the link or send it manually.')
    } else {
      const response = await sendNotificationEmail({
        to: share.owner_email,
        subject: `${sharedReportTypeLabels[share.report_type]} shared with you`,
        template: 'report-shared',
        context: {
          title: `${sharedReportTypeLabels[share.report_type]} Report`,
          body: `A secure finance report has been shared with you. The link is valid until ${share.expires_at}.`,
          actionUrl: link,
          actionLabel: 'Open shared report',
          ownerName: share.owner_name,
          reportType: sharedReportTypeLabels[share.report_type],
          flatLabel: share.flat_label ?? 'N/A',
          periodLabel: `${share.start_date} to ${share.end_date}`,
          expiresAt: share.expires_at,
        },
        societyId: share.society_id,
      })
      if (response.delivered) {
        deliveredState = 'EMAILED'
        deliveredAt = new Date().toISOString()
      } else {
        failures.push(response.reason ?? 'Email delivery is not configured.')
      }
    }
  }

  if (requestedChannels.includes('WHATSAPP')) {
    failures.push('WhatsApp delivery is not configured; copy the link or send it manually.')
  }

  await getDatabasePool().query(
    `
      update shared_report_links
      set delivery_state = $2,
          delivery_failure = $3,
          delivered_at = coalesce($4::timestamptz, delivered_at),
          delivery_channels = $5
      where id = $1
    `,
    [share.id, deliveredState, failures.length ? failures.join(' ') : null, deliveredAt, requestedChannels],
  )

  return { link, deliveryState: deliveredState, deliveryFailure: failures.join(' ') || null }
}

export const listSharedReportLinks = async (authMe: AuthMe, status?: string) => {
  const result = await getDatabasePool().query<ShareRow>(
    `
      select ${shareSelect}
      from shared_report_links srl
      ${shareJoins}
      where srl.society_id = $1
      order by srl.created_at desc
      limit 300
    `,
    [authMe.user.societyId],
  )
  const rows = result.rows.map(mapShareRow)
  return status ? rows.filter((row) => row.status === status) : rows
}

export const createSharedReportLink = async (event: H3Event, authMe: AuthMe, input: CreateShareInput) => {
  if (input.endDate < input.startDate) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The share period end date must be on or after the start date.',
    })
  }
  if (new Date(input.expiresAt).getTime() <= Date.now()) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'The share expiry must be in the future.',
    })
  }

  const ownerFlat = await assertOwnerFlat(authMe.user.societyId, input.ownerUserId, input.flatId)
  const similarActiveShareId = await findSimilarActiveShare(input, authMe.user.societyId, ownerFlat.flat_id)
  const token = generateShareToken()
  const tokenHash = hashToken(token)
  const client = await getDatabasePool().connect()
  let shareId: string

  try {
    await client.query('begin')
    const inserted = await client.query<{ id: string }>(
      `
        insert into shared_report_links (
          society_id,
          owner_user_id,
          flat_id,
          report_type,
          start_date,
          end_date,
          token_hash,
          expires_at,
          one_time_access,
          delivery_channels,
          created_by_user_id,
          note,
          metadata
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
        returning id
      `,
      [
        authMe.user.societyId,
        input.ownerUserId,
        ownerFlat.flat_id,
        input.reportType,
        input.startDate,
        input.endDate,
        tokenHash,
        input.expiresAt,
        input.oneTimeAccess,
        input.deliveryChannels,
        authMe.user.id,
        input.note ?? null,
        JSON.stringify({
          reportTypeLabel: sharedReportTypeLabels[input.reportType],
          flatLabel: ownerFlat.flat_label,
          similarActiveShareId,
          token,
        }),
      ],
    )
    shareId = inserted.rows[0]?.id ?? ''
    if (!shareId) throw new Error('Shared report link was not created.')

    queueAuditEvent(event, {
      module: 'REPORT',
      eventKey: 'shared_report.created',
      action: 'CREATED',
      severity: 'MEDIUM',
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      targetUserId: input.ownerUserId,
      metadata: {
        reportType: input.reportType,
        startDate: input.startDate,
        endDate: input.endDate,
        expiresAt: input.expiresAt,
        oneTimeAccess: input.oneTimeAccess,
      },
      relatedEntities: [
        { entityTable: 'society_profile', entityId: authMe.user.societyId },
        { entityTable: 'shared_report_links', entityId: shareId },
        { entityTable: 'users', entityId: input.ownerUserId, entityLabel: ownerFlat.owner_name },
        { entityTable: 'flats', entityId: ownerFlat.flat_id, entityLabel: ownerFlat.flat_label },
      ],
    })
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  if (!shareId) throw new Error('Shared report link was not created.')
  const share = await loadShareById(authMe.user.societyId, shareId)
  if (!share) throw new Error('Shared report link could not be loaded.')
  const delivery = await deliverShare(share, token, input.deliveryChannels)
  const refreshed = await loadShareById(authMe.user.societyId, shareId)

  return {
    share: mapShareRow(refreshed ?? share),
    link: delivery.link,
    token,
    similarActiveShareId,
    deliveryFailure: delivery.deliveryFailure,
  }
}

export const copySharedReportLink = async (event: H3Event, authMe: AuthMe, shareId: string) => {
  const share = await loadShareById(authMe.user.societyId, shareId)
  if (!share) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Shared report link not found.' })
  }

  if (share.revoked_at) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cannot copy a revoked shared report.',
    })
  }

  if (share.consumed_at && share.one_time_access) {
    return createSharedReportLink(event, authMe, {
      ownerUserId: share.owner_user_id,
      flatId: share.flat_id,
      reportType: share.report_type,
      startDate: share.start_date,
      endDate: share.end_date,
      expiresAt: share.expires_at,
      oneTimeAccess: share.one_time_access,
      note: share.note,
      deliveryChannels: ['COPY_LINK'],
    })
  }

  if (resolveStatus(share) !== 'ACTIVE') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Only active shares can be copied.',
    })
  }

  const { share: shareWithToken, token: activeToken } = await ensureShareToken(share)
  return {
    link: buildAppUrl(`/shared/report/${activeToken}`),
    share: mapShareRow(shareWithToken),
    deliveryFailure: null,
  }
}

export const emailSharedReportLink = async (event: H3Event, authMe: AuthMe, shareId: string) => {
  const share = await loadShareById(authMe.user.societyId, shareId)
  if (!share) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Shared report link not found.' })
  }

  if (share.revoked_at) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Cannot email a revoked shared report.',
    })
  }

  if (share.consumed_at && share.one_time_access) {
    return createSharedReportLink(event, authMe, {
      ownerUserId: share.owner_user_id,
      flatId: share.flat_id,
      reportType: share.report_type,
      startDate: share.start_date,
      endDate: share.end_date,
      expiresAt: share.expires_at,
      oneTimeAccess: share.one_time_access,
      note: share.note,
      deliveryChannels: ['EMAIL'],
    })
  }

  if (resolveStatus(share) !== 'ACTIVE') {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Only active shares can be sent by email.',
    })
  }

  const { share: shareWithToken, token: activeToken } = await ensureShareToken(share)
  const delivery = await deliverShare(shareWithToken, activeToken, ['EMAIL'])
  const refreshed = await loadShareById(authMe.user.societyId, share.id)

  return {
    share: mapShareRow(refreshed ?? share),
    link: delivery.link,
    deliveryFailure: delivery.deliveryFailure,
  }
}

export const revokeSharedReportLink = async (event: H3Event, authMe: AuthMe, shareId: string, reason?: string | null) => {
  const share = await loadShareById(authMe.user.societyId, shareId)
  if (!share) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Shared report link not found.' })
  }

  const client = await getDatabasePool().connect()
  try {
    await client.query('begin')
    await client.query(
      `
        update shared_report_links
        set revoked_at = now(),
            revoked_by_user_id = $2,
            revoked_reason = $3,
            delivery_state = 'REVOKED'
        where id = $1 and revoked_at is null
      `,
      [shareId, authMe.user.id, reason ?? null],
    )
    queueAuditEvent(event, {
      module: 'REPORT',
      eventKey: 'shared_report.revoked',
      action: 'STATE_CHANGED',
      severity: 'HIGH',
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      targetUserId: share.owner_user_id,
      metadata: { reason: reason ?? null, reportType: share.report_type },
      relatedEntities: [
        { entityTable: 'society_profile', entityId: authMe.user.societyId },
        { entityTable: 'shared_report_links', entityId: shareId },
      ],
    })
    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  return mapShareRow((await loadShareById(authMe.user.societyId, shareId)) ?? share)
}

export const deleteSharedReportLink = async (event: H3Event, authMe: AuthMe, shareId: string, reason?: string | null) => {
  const share = await loadShareById(authMe.user.societyId, shareId)
  if (!share) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Shared report link not found.' })
  }

  const client = await getDatabasePool().connect()
  try {
    await client.query('begin')

    const deleteResult = await client.query<{ id: string }>(
      `
        delete from shared_report_links
        where society_id = $1 and id = $2
        returning id
      `,
      [authMe.user.societyId, shareId],
    )

    if (!deleteResult.rows[0]?.id) {
      throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Shared report link not found.' })
    }

    queueAuditEvent(event, {
      module: 'REPORT',
      eventKey: 'shared_report.deleted',
      action: 'DELETED',
      severity: 'HIGH',
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      targetUserId: share.owner_user_id,
      metadata: {
        reason: reason ?? null,
        reportType: share.report_type,
        startDate: share.start_date,
        endDate: share.end_date,
      },
      relatedEntities: [
        { entityTable: 'society_profile', entityId: authMe.user.societyId },
        { entityTable: 'shared_report_links', entityId: shareId },
      ],
    })

    await client.query('commit')
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }

  return { deleted: true, id: shareId }
}

export const regenerateSharedReportLink = async (event: H3Event, authMe: AuthMe, shareId: string) => {
  const share = await loadShareById(authMe.user.societyId, shareId)
  if (!share) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Shared report link not found.' })
  }

  if (!share.revoked_at) {
    await revokeSharedReportLink(event, authMe, shareId, 'Regenerated with a new secure token.')
  }

  return createSharedReportLink(event, authMe, {
    ownerUserId: share.owner_user_id,
    flatId: share.flat_id,
    reportType: share.report_type,
    startDate: share.start_date,
    endDate: share.end_date,
    expiresAt: share.expires_at,
    oneTimeAccess: share.one_time_access,
    note: share.note,
    deliveryChannels: (share.delivery_channels.length ? share.delivery_channels : ['COPY_LINK']) as DeliveryChannel[],
  })
}

const publicStateFor = (share: ShareRow | null): PublicShareState => {
  if (!share) return 'INVALID'
  const status = resolveStatus(share)
  if (status === 'ACTIVE') return 'OK'
  return status
}

const adjustSharedReport = (report: ReportData, sharedType: SharedReportType) => {
  return sanitizeSharedReport({ ...report, title: sharedReportTypeLabels[sharedType] })
}

export const accessSharedReport = async (token: string, consume = true) => {
  const tokenHash = hashToken(token)
  const result = await getDatabasePool().query<ShareRow>(
    `
      select ${shareSelect}
      from shared_report_links srl
      ${shareJoins}
      where srl.token_hash = $1
      limit 1
    `,
    [tokenHash],
  )
  const share = result.rows[0] ?? null
  const state = publicStateFor(share)

  if (!share || state !== 'OK') {
    return { state, share: share ? mapShareRow(share) : null, report: null as ReportData | null }
  }

  if (consume) {
    await getDatabasePool().query(
      `
        update shared_report_links
        set access_count = access_count + 1,
            last_accessed_at = now(),
            consumed_at = case when one_time_access then now() else consumed_at end
        where id = $1
      `,
      [share.id],
    )
  }

  const reportType = parseSharedReportType(share.report_type)
  const filters = parseReportFilters(
    {
      reportType: mapSharedTypeToReportType(reportType),
      startDate: share.start_date,
      endDate: share.end_date,
      periodMode: 'CUSTOM',
      flatId: share.flat_id,
      ownerUserId: share.owner_user_id,
      limit: 10000,
    },
    { reportType: mapSharedTypeToReportType(reportType) },
  )
  const report = adjustSharedReport(
    await buildReport({ societyId: share.society_id, filters, exportMode: true }),
    reportType,
  )
  const updatedShare = await loadShareById(share.society_id, share.id)

  return { state, share: mapShareRow(updatedShare ?? share), report }
}
