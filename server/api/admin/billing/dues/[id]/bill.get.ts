import { requireRole } from '~/server/utils/auth'
import { generateMaintenanceBillPdf } from '~/server/utils/billing'
import { getEventQuery } from '~/server/utils/http-event'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const dueId = String(event.context.params?.id ?? '')
  const bill = await generateMaintenanceBillPdf(dueId, {
    societyId: authMe.user.societyId,
    isStaff: true,
  })
  const fileName = bill.fileName.replace(/"/g, '')
  const disposition = getEventQuery(event).download === '1' ? 'attachment' : 'inline'

  return new Response(new Uint8Array(bill.buffer), {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `${disposition}; filename="${fileName}"`,
    },
  })
})
