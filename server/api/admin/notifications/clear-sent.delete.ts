import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const client = await getDatabasePool().connect()

  try {
    const result = await client.query<{ id: string }>(
      `
        delete from notification_events ne
        where ne.society_id = $1
          and (
            ne.status in (
              'PROCESSED'::notification_event_status,
              'SENT'::notification_event_status,
              'DELIVERED'::notification_event_status,
              'READ'::notification_event_status
            )
            or (
              exists (
                select 1
                from notification_jobs nj
                where nj.notification_event_id = ne.id
              )
              and not exists (
                select 1
                from notification_jobs nj
                where nj.notification_event_id = ne.id
                  and nj.status not in (
                    'SENT'::notification_job_status,
                    'DELIVERED'::notification_job_status,
                    'READ'::notification_job_status
                  )
              )
            )
          )
        returning ne.id
      `,
      [authMe.user.societyId],
    )

    return createApiSuccess(event, { deleted: result.rowCount ?? 0 })
  } finally {
    client.release()
  }
})
