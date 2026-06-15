import { createApiSuccess, readJsonBody } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { validatePayload } from '~/server/utils/master-data'
import { chargeConfigSchema } from '~/server/utils/billing'

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

    const currentSettings = (societyResult.rows[0]?.settings ?? {}) as Record<string, unknown>
    const updatedSettings = {
      ...currentSettings,
      graceDays: body.graceDays,
      lateFeePerDay: body.lateFeePerDay,
    }

    await client.query(
      `update society_profile set settings = $1, updated_at = now() where id = $2`,
      [JSON.stringify(updatedSettings), authMe.user.societyId],
    )

    // Delete existing active maintenance_charges for this society and recreate
    await client.query(
      `delete from maintenance_charges where society_id = $1 and is_active = true`,
      [authMe.user.societyId],
    )

    // Insert default charges
    for (const item of body.defaultCharges ?? []) {
      await client.query(
        `
          insert into maintenance_charges (society_id, scope, charge_name, amount, charge_breakdown, is_active)
          values ($1, 'SOCIETY_DEFAULT', $2, $3, $4, true)
        `,
        [authMe.user.societyId, item.label, item.amount, JSON.stringify([item])],
      )
    }

    // Insert flat type charges
    for (const typeConfig of body.flatTypeCharges ?? []) {
      if (typeConfig.charges.length === 0) continue
      for (const item of typeConfig.charges) {
        await client.query(
          `
            insert into maintenance_charges (society_id, scope, flat_type, charge_name, amount, charge_breakdown, is_active)
            values ($1, 'FLAT_TYPE', $2, $3, $4, $5, true)
          `,
          [authMe.user.societyId, typeConfig.flatType, item.label, item.amount, JSON.stringify([item])],
        )
      }
    }

    // Insert flat override charges
    for (const flatConfig of body.flatOverrideCharges ?? []) {
      if (flatConfig.charges.length === 0) continue
      for (const item of flatConfig.charges) {
        await client.query(
          `
            insert into maintenance_charges (society_id, scope, flat_id, charge_name, amount, charge_breakdown, is_active)
            values ($1, 'FLAT', $2, $3, $4, $5, true)
          `,
          [authMe.user.societyId, flatConfig.flatId, item.label, item.amount, JSON.stringify([item])],
        )
      }
    }

    await client.query('commit')
    return createApiSuccess(event, { ok: true })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})