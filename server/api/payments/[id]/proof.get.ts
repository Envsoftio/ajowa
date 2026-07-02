import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { setEventHeader } from '~/server/utils/http-event'
import { readUuidParam } from '~/server/utils/master-data'
import { downloadPrivateFile } from '~/server/utils/storage'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const paymentId = readUuidParam(event)
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)
  const result = await queryRows<{
    proof_file_path: string | null
    original_file_name: string | null
    mime_type: string | null
  }>(
    `
      select
        p.proof_file_path,
        fo.original_file_name,
        fo.mime_type
      from payments p
      left join file_objects fo on fo.storage_object_key = p.proof_file_path
      where p.id = $1
        and p.society_id = $2
        and ($3::boolean = true or p.payer_user_id = $4)
      limit 1
    `,
    [paymentId, authMe.user.societyId, isStaff, authMe.user.id],
  )
  const proof = result.rows[0]

  if (!proof?.proof_file_path) {
    throw new AppError({ code: 'NOT_FOUND', statusCode: 404, message: 'Payment proof not found.' })
  }

  const blob = await downloadPrivateFile({
    storageTargetKey: 'payment_proofs',
    storageObjectKey: proof.proof_file_path,
  })
  const fileName = (proof.original_file_name ?? 'payment-proof').replace(/"/g, '')

  setEventHeader(event, 'content-type', proof.mime_type ?? 'application/octet-stream')
  setEventHeader(event, 'cache-control', 'private, no-store')
  setEventHeader(event, 'content-disposition', `inline; filename="${fileName}"`)

  return Buffer.from(await blob.arrayBuffer())
})
