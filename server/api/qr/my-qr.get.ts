import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { ensureQrForAccess, getCurrentBillingPeriodId } from '~/server/utils/qr-access'

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const client = await getDatabasePool().connect()

  try {
    const billingPeriodId = await getCurrentBillingPeriodId(client, authMe.user.societyId)
    if (!billingPeriodId) {
      return createApiSuccess(event, {
        access: null,
        qr: null,
        message: 'No active billing period is configured.',
      })
    }

    const { access, token } = await ensureQrForAccess(authMe.user.id, billingPeriodId)

    return createApiSuccess(event, {
      access: access
        ? {
            isGranted: access.is_access_granted,
            basis: access.access_basis,
            unpaidFlats: access.unpaid_flat_numbers,
            totalFlats: access.total_flats,
            totalPaidFlats: access.total_paid_flats,
            totalUnpaidFlats: access.total_unpaid_flats,
            totalDue: Number(access.total_due_all_flats),
            totalPaid: Number(access.total_paid_all_flats),
            totalBalance: Number(access.total_balance_all_flats),
            overrideState: access.override_state,
            overrideReason: access.override_reason,
            computedAt: access.computed_at,
          }
        : null,
      qr: token
        ? {
            id: token.id,
            imageDataUrl: token.qr_image_path,
            validUntil: token.valid_until ?? token.expires_at,
            generatedAt: token.generated_at,
          }
        : null,
    })
  } finally {
    client.release()
  }
})
