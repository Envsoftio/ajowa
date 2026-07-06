import { requireActiveUser } from '~/server/utils/auth'
import { getMaintenanceBillData } from '~/server/utils/billing'
import { getEventQuery } from '~/server/utils/http-event'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const dueId = String(event.context.params?.id ?? '')
  const bill = await getMaintenanceBillData(dueId, {
    societyId: authMe.user.societyId,
    userId: authMe.user.id,
  })
  const fileName = `${bill.fileName}.pdf`.replace(/"/g, '')
  const disposition = getEventQuery(event).download === '1' ? 'attachment' : 'inline'

  return new Response(null, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${disposition}; filename="${fileName}"`,
    },
  })
})
