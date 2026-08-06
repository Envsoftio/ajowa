import { createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { z } from 'zod'
import { AppError } from './errors'
import { writeMasterAudit } from './master-data'
import { readMultipartFormParts } from './multipart'
import { replacePrivateFile, uploadPrivateFile } from './storage'
import { recomputeUserAccessForActiveBillingPeriods } from './qr-access'
import type { AuthMe } from '~/types/auth'
import type { H3Event } from 'h3'

export const MAX_OWNER_FAMILY_MEMBERS = 5

const ONE_MEGABYTE = 1024 * 1024
const imageMimeTypes = new Set(['image/jpeg', 'image/png', 'image/webp'])

export const familyMemberSchema = z.object({
  flatId: z.string().uuid(),
  fullName: z.string().trim().min(2).max(160),
  mobileNumber: z.string().trim().max(40).nullable().optional(),
  relationshipNote: z.string().trim().max(120).nullable().optional(),
})

export type FamilyMemberRow = {
  relationship_id: string
  user_id: string
  full_name: string
  mobile_number: string | null
  profile_image_path: string | null
  updated_at: string
  flat_id: string
  flat_label: string
  relationship_note: string | null
  is_active: boolean
}

export const mapFamilyMember = (row: FamilyMemberRow) => ({
  relationshipId: row.relationship_id,
  userId: row.user_id,
  fullName: row.full_name,
  mobileNumber: row.mobile_number,
  profileImagePath: row.profile_image_path,
  profileImageUrl: row.profile_image_path
    ? `/api/my/family-members/${row.user_id}/photo?v=${encodeURIComponent(row.updated_at)}`
    : null,
  flatId: row.flat_id,
  flatLabel: row.flat_label,
  relationshipNote: row.relationship_note,
  isActive: row.is_active,
  updatedAt: row.updated_at,
})

export const getOwnedFlatRows = async (
  client: PoolClient,
  authMe: AuthMe,
) => {
  const result = await client.query<{ flat_id: string; label: string }>(
    `
      select distinct
        fr.flat_id,
        concat(b.name, ' ', f.flat_number) as label
      from flat_residents fr
      inner join flats f on f.id = fr.flat_id
      inner join blocks b on b.id = f.block_id
      where fr.user_id = $1
        and f.society_id = $2
        and fr.relationship_type = 'OWNER'
        and fr.is_active = true
        and (fr.ended_at is null or fr.ended_at > now())
      order by label
    `,
    [authMe.user.id, authMe.user.societyId],
  )

  return result.rows
}

export const assertOwnsFlat = async (
  client: PoolClient,
  authMe: AuthMe,
  flatId: string,
) => {
  const ownedFlats = await getOwnedFlatRows(client, authMe)
  const flat = ownedFlats.find((row) => row.flat_id === flatId)

  if (!flat) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You can manage family members only for flats where you are an active owner.',
    })
  }

  return { flat, ownedFlats }
}

export const countActiveFamilyMembers = async (
  client: PoolClient,
  societyId: string,
  flatIds: string[],
  excludeUserId?: string,
) => {
  if (flatIds.length === 0) return 0

  const result = await client.query<{ count: string }>(
    `
      select count(distinct fr.user_id)::text as count
      from flat_residents fr
      inner join flats f on f.id = fr.flat_id
      inner join users u on u.id = fr.user_id
      where fr.flat_id = any($1::uuid[])
        and f.society_id = $2
        and fr.relationship_type = 'FAMILY_MEMBER'
        and fr.is_active = true
        and u.is_active = true
        and u.can_login = false
        and u.deleted_at is null
        and ($3::uuid is null or fr.user_id <> $3::uuid)
    `,
    [flatIds, societyId, excludeUserId ?? null],
  )

  return Number(result.rows[0]?.count ?? 0)
}

export const lockFamilyMemberScopes = async (
  client: PoolClient,
  societyId: string,
  flatIds: string[],
) => {
  const sortedFlatIds = [...new Set(flatIds)].sort()

  for (const flatId of sortedFlatIds) {
    await client.query(
      `select pg_advisory_xact_lock(hashtextextended($1, 0))`,
      [`family-members:${societyId}:${flatId}`],
    )
  }
}

export const getManagedFamilyMember = async (
  client: PoolClient,
  authMe: AuthMe,
  userId: string,
) => {
  const result = await client.query<FamilyMemberRow>(
    `
      select
        fr.id as relationship_id,
        u.id as user_id,
        u.full_name,
        u.mobile_number,
        u.profile_image_path,
        u.updated_at::text,
        fr.flat_id,
        concat(b.name, ' ', f.flat_number) as flat_label,
        fr.relationship_note,
        fr.is_active
      from flat_residents owner_fr
      inner join flat_residents fr
        on fr.flat_id = owner_fr.flat_id
        and fr.relationship_type = 'FAMILY_MEMBER'
      inner join users u on u.id = fr.user_id
      inner join flats f on f.id = fr.flat_id
      inner join blocks b on b.id = f.block_id
      where owner_fr.user_id = $1
        and owner_fr.relationship_type = 'OWNER'
        and owner_fr.is_active = true
        and (owner_fr.ended_at is null or owner_fr.ended_at > now())
        and f.society_id = $2
        and u.id = $3
        and u.role = 'RESIDENT'
        and u.can_login = false
        and u.deleted_at is null
      limit 1
    `,
    [authMe.user.id, authMe.user.societyId, userId],
  )

  const member = result.rows[0]

  if (!member) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Family member not found.',
    })
  }

  return member
}

export const getFamilyMemberPhotoStorageObjectKey = (userId: string, fileName: string) => {
  const extension = fileName.includes('.') ? fileName.split('.').pop()?.toLowerCase() ?? 'webp' : 'webp'
  return `resident-profile-photo/${userId}/profile.${extension}`
}

export const uploadFamilyMemberPhoto = async ({
  event,
  client,
  authMe,
  userId,
}: {
  event: H3Event
  client: PoolClient
  authMe: AuthMe
  userId: string
}) => {
  const member = await getManagedFamilyMember(client, authMe, userId)
  const parts = await readMultipartFormParts(event)
  const filePart = parts.find((part) => part.name === 'file' && part.filename)
  const fileMimeType = filePart?.type || 'application/octet-stream'

  if (!filePart?.filename || !filePart.data?.byteLength) {
    throw createError({ statusCode: 400, statusMessage: 'Family member photo file is required.' })
  }

  if (!imageMimeTypes.has(fileMimeType)) {
    throw createError({ statusCode: 400, statusMessage: 'Upload a PNG, JPG, JPEG, or WebP photo.' })
  }

  if (filePart.data.byteLength <= 0 || filePart.data.byteLength > ONE_MEGABYTE) {
    throw createError({ statusCode: 400, statusMessage: 'Family member photo must be 1 MB or smaller.' })
  }

  const storageObjectKey = getFamilyMemberPhotoStorageObjectKey(userId, filePart.filename)
  const fileResult = await client.query<{ file_id: string | null }>(
    `
      select fo.id as file_id
      from file_objects fo
      left join users u on u.id = $2
      where fo.storage_object_key = $1
         or fo.storage_object_key = u.profile_image_path
         or (fo.related_record_type = 'users' and fo.related_record_id = $2 and fo.storage_target_key = 'resident_documents')
      order by
        case when fo.storage_object_key = $1 then 0 else 1 end,
        case when fo.upload_status = 'READY' then 0 else 1 end,
        fo.updated_at desc
      limit 1
    `,
    [storageObjectKey, userId],
  )

  const checksum = createHash('sha256').update(filePart.data).digest('hex')
  const fileInput = {
    storageTargetKey: 'resident_documents',
    storageObjectKey,
    originalFileName: filePart.filename,
    mimeType: fileMimeType,
    sizeBytes: filePart.data.byteLength,
    body: filePart.data,
    uploadedBy: authMe.user.id,
    relation: {
      recordType: 'users',
      recordId: userId,
    },
    checksum,
  } as const

  if (fileResult.rows[0]?.file_id) {
    await replacePrivateFile({
      ...fileInput,
      fileId: fileResult.rows[0].file_id,
    })
  } else {
    await uploadPrivateFile(fileInput)
  }

  const updated = await client.query<{ profile_image_path: string; updated_at: string }>(
    `
      update users
      set profile_image_path = $3,
          updated_at = now()
      where id = $1
        and society_id = $2
        and role = 'RESIDENT'
        and can_login = false
        and deleted_at is null
      returning profile_image_path, updated_at::text
    `,
    [userId, authMe.user.societyId, storageObjectKey],
  )

  await writeMasterAudit({
    client,
    event,
    actorUserId: authMe.user.id,
    actorAuthUserId: authMe.authUser.id,
    action: 'UPDATED',
    eventKey: 'family_member.photo.updated',
    beforeState: {
      fullName: member.full_name,
      profileImagePath: member.profile_image_path,
    },
    afterState: {
      fullName: member.full_name,
      profileImagePath: updated.rows[0]?.profile_image_path ?? storageObjectKey,
    },
    relatedEntities: [{ entityTable: 'users', entityId: userId, entityLabel: member.full_name }],
    targetUserId: userId,
  })

  return {
    profileImagePath: updated.rows[0]?.profile_image_path ?? storageObjectKey,
    profileImageUrl: `/api/my/family-members/${userId}/photo?v=${encodeURIComponent(updated.rows[0]?.updated_at ?? new Date().toISOString())}`,
    updatedAt: updated.rows[0]?.updated_at ?? new Date().toISOString(),
  }
}

export const recomputeFamilyAccess = async (
  client: PoolClient,
  societyId: string,
  userIds: string[],
) => {
  await recomputeUserAccessForActiveBillingPeriods(client, societyId, userIds)
}
