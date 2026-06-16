import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { computeDueAmounts, todayDate } from '~/server/utils/billing'
import { normalizeSocietySettings } from '~/server/utils/master-data'
import type { MaintenanceDue } from '~/types/domain'

type DueRow = {
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_due_date: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  due_date: string
  base_amount: string
  late_fee_amount: string
  waived_amount: string
  paid_amount: string
  total_amount: string
  balance_amount: string
  status: string
  charge_breakdown: unknown
  generated_at: string
  created_at: string
  updated_at: string
  relationship_type: string
  is_billing_contact: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const pool = getDatabasePool()
  const today = todayDate()

  // Get society grace/late fee settings
  const societyResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )

  const settings = normalizeSocietySettings(societyResult.rows[0]?.settings)

  // Determine which flats this resident can see
  const accessibleFlatIds = authMe.flatAccess.map((f) => f.flatId)

  if (accessibleFlatIds.length === 0) {
    return createApiSuccess(event, [])
  }

  const result = await pool.query<DueRow>(
    `
      select
        md.id,
        md.society_id,
        md.billing_period_id,
        bp.label as billing_period_label,
        bp.due_date::text as billing_period_due_date,
        md.flat_id,
        f.flat_number,
        b.name as block_name,
        f.unit_type,
        md.due_date::text,
        md.base_amount::text,
        md.late_fee_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.total_amount::text,
        md.balance_amount::text,
        md.status::text,
        md.charge_breakdown,
        md.generated_at::text,
        md.created_at::text,
        md.updated_at::text,
        fr.relationship_type::text,
        fr.is_billing_contact
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      inner join flat_residents fr on fr.flat_id = md.flat_id and fr.user_id = $2 and fr.is_active = true
      where md.society_id = $1
        and md.flat_id = any($3::uuid[])
      order by bp.start_date desc, b.name, f.flat_number
    `,
    [authMe.user.societyId, authMe.user.id, accessibleFlatIds],
  )

  const items: MaintenanceDue[] = result.rows.map((row) => {
    const baseAmount = Number(row.base_amount)
    const waivedAmount = Number(row.waived_amount)
    const paidAmount = Number(row.paid_amount)
    const computed = computeDueAmounts(
      {
        dueDate: row.due_date,
        baseAmount,
        waivedAmount,
        paidAmount,
        storedStatus: row.status,
      },
      today,
      settings.graceDays,
      settings.lateFeePerDay,
    )

    return {
      id: row.id,
      societyId: row.society_id,
      billingPeriodId: row.billing_period_id,
      billingPeriodLabel: row.billing_period_label,
      billingPeriodDueDate: row.billing_period_due_date,
      flatId: row.flat_id,
      flatNumber: row.flat_number,
      blockName: row.block_name,
      unitType: row.unit_type,
      dueDate: row.due_date,
      baseAmount,
      lateFeeAmount: computed.lateFeeAmount,
      waivedAmount,
      paidAmount,
      totalAmount: computed.totalAmount,
      balanceAmount: computed.balanceAmount,
      status: computed.status,
      chargeBreakdown: Array.isArray(row.charge_breakdown) ? row.charge_breakdown : [],
      generatedAt: row.generated_at,
      primaryResidentName: authMe.user.fullName,
      relationshipType: row.relationship_type,
      isBillingContact: row.is_billing_contact,
      canPayNow:
        row.is_billing_contact &&
        (['OWNER', 'CO_OWNER', 'SHOP_OWNER'].includes(row.relationship_type) ||
          (['TENANT', 'SHOP_TENANT', 'COMMERCIAL_OCCUPANT'].includes(row.relationship_type) &&
            settings.tenantPaymentsEnabled)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  return createApiSuccess(event, items)
})
