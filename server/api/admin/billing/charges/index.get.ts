import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { normalizeSocietySettings } from '~/server/utils/master-data'
import type { BillingChargeConfig, ChargeBreakdownItem } from '~/types/domain'

type ChargeRow = {
  id: string
  society_id: string
  billing_period_id: string | null
  scope: string
  flat_type: string | null
  flat_id: string | null
  flat_number: string | null
  block_name: string | null
  charge_name: string
  amount: string
  effective_start_date: string | null
  effective_end_date: string | null
  charge_breakdown: ChargeBreakdownItem[]
  is_active: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()

  // Fetch policy settings for grace/late fee
  const societyResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )

  const settings = normalizeSocietySettings(societyResult.rows[0]?.settings)

  const result = await pool.query<ChargeRow>(
    `
      select
        mc.id,
        mc.society_id,
        mc.billing_period_id,
        mc.scope::text,
        mc.flat_type,
        mc.flat_id,
        f.flat_number,
        b.name as block_name,
        mc.charge_name,
        mc.amount::text,
        mc.effective_start_date::text,
        mc.effective_end_date::text,
        mc.charge_breakdown,
        mc.is_active
      from maintenance_charges mc
      left join flats f on f.id = mc.flat_id
      left join blocks b on b.id = f.block_id
      where mc.society_id = $1
        and mc.is_active = true
      order by mc.scope, mc.flat_type, mc.charge_name
    `,
    [authMe.user.societyId],
  )

  const defaultCharges: ChargeBreakdownItem[] = []
  const flatTypeCharges: BillingChargeConfig['flatTypeCharges'] = []
  const flatOverrideCharges: BillingChargeConfig['flatOverrideCharges'] = []

  for (const row of result.rows) {
    const breakdown = Array.isArray(row.charge_breakdown) ? row.charge_breakdown : []

    if (row.scope === 'SOCIETY_DEFAULT') {
      defaultCharges.push(...breakdown)
    } else if (row.scope === 'FLAT_TYPE' && row.flat_type) {
      const existing = flatTypeCharges.find((item) => item.flatType === row.flat_type)
      if (existing) {
        existing.charges.push(...breakdown)
      } else {
        flatTypeCharges.push({
          flatType: row.flat_type,
          label: row.charge_name,
          charges: breakdown,
        })
      }
    } else if (row.scope === 'FLAT' && row.flat_id) {
      const existing = flatOverrideCharges.find((item) => item.flatId === row.flat_id)
      if (existing) {
        existing.charges.push(...breakdown)
      } else {
        flatOverrideCharges.push({
          flatId: row.flat_id,
          flatNumber: row.flat_number ?? '',
          blockName: row.block_name ?? '',
          charges: breakdown,
        })
      }
    }
  }

  const config: BillingChargeConfig = {
    periodId: null,
    graceDays: settings.graceDays,
    lateFeePerDay: settings.lateFeePerDay,
    billingTenure: settings.billingTenure,
    excessPaymentHandling: settings.excessPaymentHandling,
    defaultCharges,
    flatTypeCharges,
    flatOverrideCharges,
  }

  return createApiSuccess(event, config)
})
