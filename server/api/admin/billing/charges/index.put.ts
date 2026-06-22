import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { normalizeSocietySettings, validatePayload, writeMasterAudit } from '~/server/utils/master-data'
import { chargeConfigSchema } from '~/server/utils/billing'
import type { ChargeBreakdownItem } from '~/types/domain'

type ChargeInputItem = {
  label: string
  chargeType?: ChargeBreakdownItem['chargeType'] | undefined
  [key: string]: unknown
}

const inferChargeType = (item: ChargeInputItem): ChargeBreakdownItem['chargeType'] => {
  if (item.chargeType) return item.chargeType
  if (/^cam(?:\s+charges?)?$/i.test(item.label.trim())) return 'CAM'
  if (/\b(dg\s*set|dgset|generator|power\s*back\s*up|power\s*backup)\b/i.test(item.label)) {
    return 'DG_SET'
  }

  return 'OTHER'
}

const buildStoredChargeBreakdown = (
  item: ChargeInputItem,
  amount: number,
  calculationMethod: NonNullable<ChargeBreakdownItem['calculationMethod']>,
  ratePerSqFt: number | null,
) =>
  JSON.stringify([
    {
      ...item,
      amount,
      calculationMethod,
      chargeType: inferChargeType(item),
      ...(ratePerSqFt ? { ratePerSqFt } : {}),
    },
  ])

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const body = validatePayload(chargeConfigSchema, await readJsonBody(event))
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    // Update society settings for grace days and late fee
    const societyResult = await client.query<{ settings: Record<string, unknown> }>(
      `select settings from society_profile where id = $1 limit 1`,
      [authMe.user.societyId],
    )

    const currentSettings = normalizeSocietySettings(societyResult.rows[0]?.settings)
    const existingCharges = await client.query<{
      scope: string
      flat_type: string | null
      flat_id: string | null
      charge_name: string
      amount: string
      calculation_method: string
      rate_per_sq_ft: string | null
      charge_breakdown: unknown
    }>(
      `
        select scope::text, flat_type, flat_id, charge_name, amount::text, calculation_method::text, rate_per_sq_ft::text, charge_breakdown
        from maintenance_charges
        where society_id = $1 and is_active = true and billing_period_id is null
        order by scope, flat_type, flat_id, charge_name
      `,
      [authMe.user.societyId],
    )
    const updatedSettings = {
      ...currentSettings,
      graceDays: body.graceDays,
      lateFeePerDay: body.lateFeePerDay,
      billingTenure: body.billingTenure,
      excessPaymentHandling: body.excessPaymentHandling,
    }

    await client.query(
      `update society_profile set settings = $1, updated_at = now() where id = $2`,
      [JSON.stringify(updatedSettings), authMe.user.societyId],
    )

    // Delete existing active maintenance_charges for this society and recreate
    await client.query(
      `delete from maintenance_charges where society_id = $1 and is_active = true and billing_period_id is null`,
      [authMe.user.societyId],
    )

    // Insert default charges
    for (const item of body.defaultCharges ?? []) {
      const calculationMethod = item.calculationMethod ?? 'FIXED'
      const amount = Number(item.amount)
      const ratePerSqFt = calculationMethod === 'AREA_RATE' ? amount : null
      await client.query(
        `
          insert into maintenance_charges (
            society_id, scope, charge_name, amount, calculation_method, rate_per_sq_ft, charge_breakdown, is_active
          )
          values ($1, 'SOCIETY_DEFAULT', $2, $3, $4, $5, $6, true)
        `,
        [
          authMe.user.societyId,
          item.label,
          amount,
          calculationMethod,
          ratePerSqFt,
          buildStoredChargeBreakdown(item, amount, calculationMethod, ratePerSqFt),
        ],
      )
    }

    // Insert flat type charges
    for (const typeConfig of body.flatTypeCharges ?? []) {
      if (typeConfig.charges.length === 0) continue
      for (const item of typeConfig.charges) {
        const calculationMethod = item.calculationMethod ?? 'FIXED'
        const amount = Number(item.amount)
        const ratePerSqFt = calculationMethod === 'AREA_RATE' ? amount : null
        await client.query(
          `
            insert into maintenance_charges (
              society_id, scope, flat_type, charge_name, amount, calculation_method, rate_per_sq_ft, charge_breakdown, is_active
            )
            values ($1, 'FLAT_TYPE', $2, $3, $4, $5, $6, $7, true)
          `,
          [
            authMe.user.societyId,
            typeConfig.flatType,
            item.label,
            amount,
            calculationMethod,
            ratePerSqFt,
            buildStoredChargeBreakdown(item, amount, calculationMethod, ratePerSqFt),
          ],
        )
      }
    }

    // Insert flat override charges
    for (const flatConfig of body.flatOverrideCharges ?? []) {
      if (flatConfig.charges.length === 0) continue
      for (const item of flatConfig.charges) {
        const calculationMethod = item.calculationMethod ?? 'FIXED'
        const amount = Number(item.amount)
        const ratePerSqFt = calculationMethod === 'AREA_RATE' ? amount : null
        await client.query(
          `
            insert into maintenance_charges (
              society_id, scope, flat_id, charge_name, amount, calculation_method, rate_per_sq_ft, charge_breakdown, is_active
            )
            values ($1, 'FLAT', $2, $3, $4, $5, $6, $7, true)
          `,
          [
            authMe.user.societyId,
            flatConfig.flatId,
            item.label,
            amount,
            calculationMethod,
            ratePerSqFt,
            buildStoredChargeBreakdown(item, amount, calculationMethod, ratePerSqFt),
          ],
        )
      }
    }

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'UPDATED',
      eventKey: 'billing_charges.updated',
      beforeState: {
        graceDays: currentSettings.graceDays,
        lateFeePerDay: currentSettings.lateFeePerDay,
        billingTenure: currentSettings.billingTenure,
        excessPaymentHandling: currentSettings.excessPaymentHandling,
        charges: existingCharges.rows,
      },
      afterState: body as unknown as Record<string, unknown>,
      relatedEntities: [
        { entityTable: 'society_profile', entityId: authMe.user.societyId, entityLabel: 'AJOWA' },
      ],
    })

    await client.query('commit')
    return createApiSuccess(event, { ok: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
