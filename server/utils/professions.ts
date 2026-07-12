import type { PoolClient } from 'pg'
import { AppError } from './errors'
import type { ResidentProfessionProfileInput } from './master-data'
import type { AuthMe } from '~/types/auth'
import type { ResidentProfessionProfile } from '~/types/domain'

type Queryable = Pick<PoolClient, 'query'>

export type ResidentProfessionProfileRow = {
  id: string
  society_id: string
  user_id: string
  profession_id: string
  profession_name: string
  profession_description: string | null
  is_active: boolean
  is_public: boolean
  is_profession_public_allowed: boolean
  admin_note: string | null
  profession_consent_source: ResidentProfessionProfile['professionConsentSource']
  profession_consent_proof_file_path: string | null
  profession_consent_proof_file_name: string | null
  profession_consent_note: string | null
  profession_consent_recorded_at: string | null
  profession_consent_recorded_by_user_id: string | null
  profession_consent_recorded_by_name: string | null
  share_phone: boolean
  phone_source: ResidentProfessionProfile['phoneSource']
  public_phone: string | null
  share_email: boolean
  email_source: ResidentProfessionProfile['emailSource']
  public_email: string | null
  contact_consent_source: ResidentProfessionProfile['contactConsentSource']
  contact_consent_proof_file_path: string | null
  contact_consent_proof_file_name: string | null
  contact_consent_note: string | null
  contact_consent_recorded_at: string | null
  contact_consent_recorded_by_user_id: string | null
  contact_consent_recorded_by_name: string | null
  revoked_at: string | null
  revoked_by_user_id: string | null
  revoked_by_name: string | null
  revocation_reason: string | null
  created_at: string
  updated_at: string
}

type ExistingProfileRow = {
  id: string
  profession_id: string
  is_active: boolean
  is_public: boolean
  admin_note: string | null
  profession_consent_source: string | null
  profession_consent_proof_file_path: string | null
  profession_consent_note: string | null
  profession_consent_recorded_at: string | null
  profession_consent_recorded_by_user_id: string | null
  share_phone: boolean
  phone_source: string | null
  public_phone: string | null
  share_email: boolean
  email_source: string | null
  public_email: string | null
  contact_consent_source: string | null
  contact_consent_proof_file_path: string | null
  contact_consent_note: string | null
  contact_consent_recorded_at: string | null
  contact_consent_recorded_by_user_id: string | null
  revoked_at: string | null
  revoked_by_user_id: string | null
  revocation_reason: string | null
}

type ProfessionLookupRow = {
  id: string
  name: string
  is_active: boolean
  is_public_allowed: boolean
}

type ResidentContactRow = {
  full_name: string
  email: string | null
  mobile_number: string | null
}

export const residentProfessionProfileSelectSql = `
  select
    rpp.id,
    rpp.society_id,
    rpp.user_id,
    rpp.profession_id,
    p.name as profession_name,
    p.description as profession_description,
    rpp.is_active,
    rpp.is_public,
    p.is_public_allowed as is_profession_public_allowed,
    rpp.admin_note,
    rpp.profession_consent_source,
    rpp.profession_consent_proof_file_path,
    profession_proof.original_file_name as profession_consent_proof_file_name,
    rpp.profession_consent_note,
    rpp.profession_consent_recorded_at::text,
    rpp.profession_consent_recorded_by_user_id,
    profession_recorder.full_name as profession_consent_recorded_by_name,
    rpp.share_phone,
    rpp.phone_source,
    rpp.public_phone,
    rpp.share_email,
    rpp.email_source,
    rpp.public_email::text,
    rpp.contact_consent_source,
    rpp.contact_consent_proof_file_path,
    contact_proof.original_file_name as contact_consent_proof_file_name,
    rpp.contact_consent_note,
    rpp.contact_consent_recorded_at::text,
    rpp.contact_consent_recorded_by_user_id,
    contact_recorder.full_name as contact_consent_recorded_by_name,
    rpp.revoked_at::text,
    rpp.revoked_by_user_id,
    revoker.full_name as revoked_by_name,
    rpp.revocation_reason,
    rpp.created_at::text,
    rpp.updated_at::text
  from resident_profession_profiles rpp
  inner join professions p on p.id = rpp.profession_id
  left join file_objects profession_proof
    on profession_proof.storage_target_key = 'resident_documents'
    and profession_proof.storage_object_key = rpp.profession_consent_proof_file_path
  left join file_objects contact_proof
    on contact_proof.storage_target_key = 'resident_documents'
    and contact_proof.storage_object_key = rpp.contact_consent_proof_file_path
  left join users profession_recorder on profession_recorder.id = rpp.profession_consent_recorded_by_user_id
  left join users contact_recorder on contact_recorder.id = rpp.contact_consent_recorded_by_user_id
  left join users revoker on revoker.id = rpp.revoked_by_user_id
`

export const mapResidentProfessionProfile = (
  row: ResidentProfessionProfileRow,
): ResidentProfessionProfile => ({
  id: row.id,
  societyId: row.society_id,
  userId: row.user_id,
  professionId: row.profession_id,
  professionName: row.profession_name,
  professionDescription: row.profession_description,
  isActive: row.is_active,
  isPublic: row.is_public,
  isProfessionPublicAllowed: row.is_profession_public_allowed,
  adminNote: row.admin_note,
  professionConsentSource: row.profession_consent_source,
  professionConsentProofFilePath: row.profession_consent_proof_file_path,
  professionConsentProofFileName: row.profession_consent_proof_file_name,
  professionConsentNote: row.profession_consent_note,
  professionConsentRecordedAt: row.profession_consent_recorded_at,
  professionConsentRecordedByUserId: row.profession_consent_recorded_by_user_id,
  professionConsentRecordedByName: row.profession_consent_recorded_by_name,
  sharePhone: row.share_phone,
  phoneSource: row.phone_source,
  publicPhone: row.public_phone,
  shareEmail: row.share_email,
  emailSource: row.email_source,
  publicEmail: row.public_email,
  contactConsentSource: row.contact_consent_source,
  contactConsentProofFilePath: row.contact_consent_proof_file_path,
  contactConsentProofFileName: row.contact_consent_proof_file_name,
  contactConsentNote: row.contact_consent_note,
  contactConsentRecordedAt: row.contact_consent_recorded_at,
  contactConsentRecordedByUserId: row.contact_consent_recorded_by_user_id,
  contactConsentRecordedByName: row.contact_consent_recorded_by_name,
  revokedAt: row.revoked_at,
  revokedByUserId: row.revoked_by_user_id,
  revokedByName: row.revoked_by_name,
  revocationReason: row.revocation_reason,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
})

const nullableText = (value: string | null | undefined) => {
  const trimmed = value?.trim()
  return trimmed ? trimmed : null
}

const valueOrFallback = <T>(
  value: T | null | undefined,
  fallback: T | null | undefined,
) => (value === undefined ? (fallback ?? null) : (value ?? null))

const textOrFallback = (
  value: string | null | undefined,
  fallback: string | null | undefined,
) => (value === undefined ? (fallback ?? null) : nullableText(value))

const profilesMatch = (
  before: ExistingProfileRow | null,
  fields: Array<keyof ExistingProfileRow>,
  next: Record<string, unknown>,
) =>
  Boolean(before) &&
  fields.every(
    (field) => (before as Record<string, unknown>)[field] === next[field],
  )

const readExistingProfile = async (
  client: Queryable,
  societyId: string,
  userId: string,
) => {
  const result = await client.query<ExistingProfileRow>(
    `
      select
        id,
        profession_id,
        is_active,
        is_public,
        admin_note,
        profession_consent_source,
        profession_consent_proof_file_path,
        profession_consent_note,
        profession_consent_recorded_at::text,
        profession_consent_recorded_by_user_id,
        share_phone,
        phone_source,
        public_phone,
        share_email,
        email_source,
        public_email::text,
        contact_consent_source,
        contact_consent_proof_file_path,
        contact_consent_note,
        contact_consent_recorded_at::text,
        contact_consent_recorded_by_user_id,
        revoked_at::text,
        revoked_by_user_id,
        revocation_reason
      from resident_profession_profiles
      where user_id = $1 and society_id = $2
      limit 1
    `,
    [userId, societyId],
  )

  return result.rows[0] ?? null
}

export const getResidentProfessionProfile = async (
  client: Queryable,
  societyId: string,
  userId: string,
) => {
  const result = await client.query<ResidentProfessionProfileRow>(
    `
      ${residentProfessionProfileSelectSql}
      where rpp.user_id = $1 and rpp.society_id = $2
      limit 1
    `,
    [userId, societyId],
  )

  const row = result.rows[0]
  return row ? mapResidentProfessionProfile(row) : null
}

const readProfession = async (
  client: Queryable,
  societyId: string,
  professionId: string,
) => {
  const result = await client.query<ProfessionLookupRow>(
    `
      select id, name, is_active, is_public_allowed
      from professions
      where id = $1 and society_id = $2
      limit 1
    `,
    [professionId, societyId],
  )

  return result.rows[0] ?? null
}

const readResidentContact = async (
  client: Queryable,
  societyId: string,
  userId: string,
) => {
  const result = await client.query<ResidentContactRow>(
    `
      select full_name, email::text, mobile_number
      from users
      where id = $1 and society_id = $2 and role = 'RESIDENT'
      limit 1
    `,
    [userId, societyId],
  )

  const resident = result.rows[0]

  if (!resident) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Resident not found.',
    })
  }

  return resident
}

const resolvePublicPhone = (
  input: ResidentProfessionProfileInput,
  resident: ResidentContactRow,
) => {
  if (!input.sharePhone) {
    return null
  }

  if (input.phoneSource === 'REGISTERED_MOBILE') {
    const value = nullableText(resident.mobile_number)

    if (!value) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message:
          'The resident does not have a registered mobile number to share.',
      })
    }

    return value
  }

  return nullableText(input.publicPhone)
}

const resolvePublicEmail = (
  input: ResidentProfessionProfileInput,
  resident: ResidentContactRow,
) => {
  if (!input.shareEmail) {
    return null
  }

  if (input.emailSource === 'REGISTERED_EMAIL') {
    const value = nullableText(resident.email)

    if (!value) {
      throw new AppError({
        code: 'VALIDATION_ERROR',
        statusCode: 400,
        message:
          'The resident does not have a registered email address to share.',
      })
    }

    return value
  }

  return nullableText(input.publicEmail)
}

export const upsertResidentProfessionProfile = async ({
  client,
  authMe,
  userId,
  input,
}: {
  client: PoolClient
  authMe: AuthMe
  userId: string
  input: ResidentProfessionProfileInput | null | undefined
}) => {
  if (input === undefined) {
    return getResidentProfessionProfile(client, authMe.user.societyId, userId)
  }

  const before = await readExistingProfile(
    client,
    authMe.user.societyId,
    userId,
  )

  if (!input?.professionId) {
    if (before) {
      await client.query(
        `
          update resident_profession_profiles
          set
            is_active = false,
            is_public = false,
            share_phone = false,
            share_email = false,
            revoked_at = case when is_public = true then now() else revoked_at end,
            revoked_by_user_id = case when is_public = true then $3 else revoked_by_user_id end,
            revocation_reason = coalesce($4, revocation_reason),
            updated_at = now()
          where user_id = $1 and society_id = $2
        `,
        [
          userId,
          authMe.user.societyId,
          authMe.user.id,
          nullableText(input?.revocationReason),
        ],
      )
    }

    return null
  }

  const profession = await readProfession(
    client,
    authMe.user.societyId,
    input.professionId,
  )

  if (!profession) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select a valid profession.',
    })
  }

  const isSameExistingProfession = before?.profession_id === input.professionId

  if (
    !profession.is_active &&
    (!isSameExistingProfession || (input.isPublic && !before?.is_public))
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message: 'Select an active profession.',
    })
  }

  if (
    input.isPublic &&
    !profession.is_public_allowed &&
    !(isSameExistingProfession && before?.is_public)
  ) {
    throw new AppError({
      code: 'VALIDATION_ERROR',
      statusCode: 400,
      message:
        'This profession is not enabled for member directory visibility.',
    })
  }

  const resident = await readResidentContact(
    client,
    authMe.user.societyId,
    userId,
  )
  const publicPhone = resolvePublicPhone(input, resident)
  const publicEmail = resolvePublicEmail(input, resident)
  const now = new Date().toISOString()
  const nextProfession = {
    profession_id: input.professionId,
    profession_consent_source: input.isPublic
      ? input.professionConsentSource
      : valueOrFallback(
          input.professionConsentSource,
          before?.profession_consent_source,
        ),
    profession_consent_proof_file_path: textOrFallback(
      input.professionConsentProofFilePath,
      before?.profession_consent_proof_file_path,
    ),
    profession_consent_note: textOrFallback(
      input.professionConsentNote,
      before?.profession_consent_note,
    ),
  }
  const professionConsentUnchanged = profilesMatch(
    before,
    [
      'profession_id',
      'profession_consent_source',
      'profession_consent_proof_file_path',
      'profession_consent_note',
    ],
    nextProfession,
  )
  const professionConsentRecordedAt = input.isPublic
    ? professionConsentUnchanged
      ? (before?.profession_consent_recorded_at ?? now)
      : now
    : nextProfession.profession_consent_source
      ? (before?.profession_consent_recorded_at ?? now)
      : null
  const professionConsentRecordedBy = input.isPublic
    ? professionConsentUnchanged
      ? (before?.profession_consent_recorded_by_user_id ?? authMe.user.id)
      : authMe.user.id
    : nextProfession.profession_consent_source
      ? (before?.profession_consent_recorded_by_user_id ?? authMe.user.id)
      : null

  const nextContact = {
    share_phone: input.sharePhone,
    phone_source: input.sharePhone ? input.phoneSource : null,
    public_phone: publicPhone,
    share_email: input.shareEmail,
    email_source: input.shareEmail ? input.emailSource : null,
    public_email: publicEmail,
    contact_consent_source:
      input.sharePhone || input.shareEmail
        ? input.contactConsentSource
        : valueOrFallback(
            input.contactConsentSource,
            before?.contact_consent_source,
          ),
    contact_consent_proof_file_path: textOrFallback(
      input.contactConsentProofFilePath,
      before?.contact_consent_proof_file_path,
    ),
    contact_consent_note: textOrFallback(
      input.contactConsentNote,
      before?.contact_consent_note,
    ),
  }
  const contactConsentUnchanged = profilesMatch(
    before,
    [
      'share_phone',
      'phone_source',
      'public_phone',
      'share_email',
      'email_source',
      'public_email',
      'contact_consent_source',
      'contact_consent_proof_file_path',
      'contact_consent_note',
    ],
    nextContact,
  )
  const sharesContact = input.sharePhone || input.shareEmail
  const contactConsentRecordedAt = sharesContact
    ? contactConsentUnchanged
      ? (before?.contact_consent_recorded_at ?? now)
      : now
    : nextContact.contact_consent_source
      ? (before?.contact_consent_recorded_at ?? now)
      : null
  const contactConsentRecordedBy = sharesContact
    ? contactConsentUnchanged
      ? (before?.contact_consent_recorded_by_user_id ?? authMe.user.id)
      : authMe.user.id
    : nextContact.contact_consent_source
      ? (before?.contact_consent_recorded_by_user_id ?? authMe.user.id)
      : null
  const isRevoking = Boolean(before?.is_public && !input.isPublic)

  await client.query(
    `
      insert into resident_profession_profiles (
        society_id,
        user_id,
        profession_id,
        is_active,
        is_public,
        admin_note,
        profession_consent_source,
        profession_consent_proof_file_path,
        profession_consent_note,
        profession_consent_recorded_at,
        profession_consent_recorded_by_user_id,
        share_phone,
        phone_source,
        public_phone,
        share_email,
        email_source,
        public_email,
        contact_consent_source,
        contact_consent_proof_file_path,
        contact_consent_note,
        contact_consent_recorded_at,
        contact_consent_recorded_by_user_id,
        revoked_at,
        revoked_by_user_id,
        revocation_reason
      )
      values (
        $1, $2, $3, true, $4, $5, $6, $7, $8, $9, $10,
        $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21,
        $22, $23, $24
      )
      on conflict (user_id)
      do update
      set
        society_id = excluded.society_id,
        profession_id = excluded.profession_id,
        is_active = true,
        is_public = excluded.is_public,
        admin_note = excluded.admin_note,
        profession_consent_source = excluded.profession_consent_source,
        profession_consent_proof_file_path = excluded.profession_consent_proof_file_path,
        profession_consent_note = excluded.profession_consent_note,
        profession_consent_recorded_at = excluded.profession_consent_recorded_at,
        profession_consent_recorded_by_user_id = excluded.profession_consent_recorded_by_user_id,
        share_phone = excluded.share_phone,
        phone_source = excluded.phone_source,
        public_phone = excluded.public_phone,
        share_email = excluded.share_email,
        email_source = excluded.email_source,
        public_email = excluded.public_email,
        contact_consent_source = excluded.contact_consent_source,
        contact_consent_proof_file_path = excluded.contact_consent_proof_file_path,
        contact_consent_note = excluded.contact_consent_note,
        contact_consent_recorded_at = excluded.contact_consent_recorded_at,
        contact_consent_recorded_by_user_id = excluded.contact_consent_recorded_by_user_id,
        revoked_at = excluded.revoked_at,
        revoked_by_user_id = excluded.revoked_by_user_id,
        revocation_reason = excluded.revocation_reason,
        updated_at = now()
    `,
    [
      authMe.user.societyId,
      userId,
      input.professionId,
      input.isPublic,
      textOrFallback(input.adminNote, before?.admin_note),
      nextProfession.profession_consent_source,
      nextProfession.profession_consent_proof_file_path,
      nextProfession.profession_consent_note,
      professionConsentRecordedAt,
      professionConsentRecordedBy,
      input.sharePhone,
      nextContact.phone_source,
      nextContact.public_phone,
      input.shareEmail,
      nextContact.email_source,
      nextContact.public_email,
      nextContact.contact_consent_source,
      nextContact.contact_consent_proof_file_path,
      nextContact.contact_consent_note,
      contactConsentRecordedAt,
      contactConsentRecordedBy,
      input.isPublic ? null : isRevoking ? now : (before?.revoked_at ?? null),
      input.isPublic
        ? null
        : isRevoking
          ? authMe.user.id
          : (before?.revoked_by_user_id ?? null),
      input.isPublic
        ? null
        : textOrFallback(input.revocationReason, before?.revocation_reason),
    ],
  )

  return getResidentProfessionProfile(client, authMe.user.societyId, userId)
}
