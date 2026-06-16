import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  computePeriodCloseSummary,
  mapPeriodCloseRow,
  periodCloseSchema,
  writeFinanceAudit,
  type PeriodCloseRow,
} from '~/server/utils/finance'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN'])
  const input = validateInput(periodCloseSchema, await readJsonBody(event))
  const client = await getDatabasePool().connect()

  try {
    await client.query('begin')
    const summary = await computePeriodCloseSummary(client, {
      societyId: authMe.user.societyId,
      startDate: input.startDate,
      endDate: input.endDate,
    })
    const result = await client.query<PeriodCloseRow>(
      `
        insert into financial_period_close (
          society_id,
          start_date,
          end_date,
          notes,
          opening_balance,
          income_total,
          expense_total,
          closing_balance,
          validation_snapshot,
          closed_by_user_id
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        returning
          id,
          society_id,
          start_date::text,
          end_date::text,
          notes,
          opening_balance::text,
          income_total::text,
          expense_total::text,
          closing_balance::text,
          validation_snapshot,
          closed_at::text,
          closed_by_user_id,
          null::text as closed_by_name,
          is_reopened,
          reopened_at::text,
          reopened_by_user_id,
          null::text as reopened_by_name,
          reopen_reason,
          created_at::text,
          updated_at::text
      `,
      [
        authMe.user.societyId,
        input.startDate,
        input.endDate,
        input.notes ?? null,
        summary.openingBalance,
        summary.incomeTotal,
        summary.expenseTotal,
        summary.closingBalance,
        JSON.stringify(summary.validationSnapshot),
        authMe.user.id,
      ],
    )
    const period = result.rows[0]
    await writeFinanceAudit({
      client,
      event,
      societyId: authMe.user.societyId,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'STATE_CHANGED',
      eventKey: 'finance.periods.closed',
      afterState: { ...input, ...summary },
      relatedEntities: period ? [{ entityTable: 'financial_period_close', entityId: period.id }] : [],
    })
    await client.query('commit')
    return createApiSuccess(event, { item: period ? mapPeriodCloseRow(period) : null })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
