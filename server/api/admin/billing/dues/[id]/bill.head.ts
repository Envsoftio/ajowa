import { requireRole } from '~/server/utils/auth'
import { getMaintenanceBillData } from '~/server/utils/billing'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const dueId = String(event.context.params?.id ?? '')
  const bill = await getMaintenanceBillData(dueId, {
    societyId: authMe.user.societyId,
    isStaff: true,
  })
  const fileName = `${bill.fileName}.pdf`.replace(/"/g, '')

  return new Response(null, {
    headers: {
      'content-type': 'application/pdf',
      'content-disposition': `inline; filename="${fileName}"`,
    },
  })
})
