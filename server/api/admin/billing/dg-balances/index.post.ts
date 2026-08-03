import { z } from 'zod'
import {
  createApiSuccess,
  readJsonBody,
  validateInput,
} from '~/server/utils/api'
import { requirePermission } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { AppError } from '~/server/utils/errors'
import { writeMasterAudit } from '~/server/utils/master-data'
import { consumeDgAdvanceCreditsForFlatWithClient } from '~/server/utils/payments'

const openingBalanceSchema = z
  .object({
    flatId: z.string().uuid(),
    asOfDate: z.string().date(),
    dueDate: z.string().date(),
    principalAmount: z.coerce.number().positive().max(99_999_999.99),
    interestAmount: z.coerce
      .number()
      .nonnegative()
      .max(0)
      .default(0),
    note: z.string().trim().min(3).max(1000),
  })
  .refine((value) => value.dueDate >= value.asOfDate, {
    path: ['dueDate'],
    message: 'Due date cannot be before the previous cycle date.',
  })

const roundMoney = (value: number) => Math.round(value * 100) / 100

export default defineEventHandler(async (event) => {
  const authMe = await requirePermission(event, 'billing.manage')
  const input = validateInput(openingBalanceSchema, await readJsonBody(event))
  const principalAmount = roundMoney(input.principalAmount)
  const interestAmount = roundMoney(input.interestAmount)
  const totalAmount = roundMoney(principalAmount + interestAmount)
  const pool = getDatabasePool()
  const client = await pool.connect()

  try {
    await client.query('begin')

    const flatResult = await client.query<{
      id: string
      flat_number: string
      block_name: string
    }>(
      `
        select f.id, f.flat_number, b.name as block_name
        from flats f
        inner join blocks b on b.id = f.block_id
        where f.id = $1 and f.society_id = $2 and f.is_active = true
        for update of f
      `,
      [input.flatId, authMe.user.societyId],
    )
    const flat = flatResult.rows[0]
    if (!flat) {
      throw new AppError({
        code: 'NOT_FOUND',
        statusCode: 404,
        message: 'Active flat not found.',
      })
    }

    const periodLabel = `DG Carried-forward Balance ${input.asOfDate}`
    const periodInsert = await client.query<{ id: string; is_locked: boolean }>(
      `
        insert into billing_periods (
          society_id, label, frequency, charge_type,
          start_date, end_date, due_date
        )
        values ($1, $2, 'CUSTOM', 'DG_SET', $3::date, $3::date, $4::date)
        on conflict (society_id, charge_type, start_date, end_date) do nothing
        returning id, is_locked
      `,
      [authMe.user.societyId, periodLabel, input.asOfDate, input.dueDate],
    )
    const periodResult = periodInsert.rows[0]
      ? periodInsert
      : await client.query<{ id: string; is_locked: boolean }>(
          `
            select id, is_locked
            from billing_periods
            where society_id = $1
              and charge_type = 'DG_SET'
              and start_date = $2::date
              and end_date = $2::date
            for update
          `,
          [authMe.user.societyId, input.asOfDate],
        )
    const period = periodResult.rows[0]
    if (!period) {
      throw new AppError({
        code: 'INTERNAL_ERROR',
        statusCode: 500,
        message: 'DG carried-forward balance period could not be created.',
      })
    }
    if (period.is_locked) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'The DG previous cycle date belongs to a locked billing period.',
      })
    }

    const dueResult = await client.query<{ id: string }>(
      `
        insert into maintenance_dues (
          society_id,
          billing_period_id,
          flat_id,
          due_date,
          generated_at,
          base_amount,
          late_fee_amount,
          waived_amount,
          paid_amount,
          total_amount,
          balance_amount,
          status,
          charge_breakdown,
          origin,
          opening_balance_as_of,
          opening_balance_note,
          opening_balance_created_by_user_id
        )
        values (
          $1, $2, $3, $4::date, current_date,
          $5, 0, 0, 0, $5, $5, 'OPEN', $6::jsonb,
          'DG_OPENING_BALANCE', $7::date, $8, $9
        )
        on conflict (billing_period_id, flat_id) do nothing
        returning id
      `,
      [
        authMe.user.societyId,
        period.id,
        input.flatId,
        input.dueDate,
        totalAmount,
        JSON.stringify([
          {
            label: 'DG carried-forward balance',
            amount: principalAmount,
            chargeType: 'DG_SET',
            source: 'DG_OPENING_BALANCE',
            interestAmount,
          },
        ]),
        input.asOfDate,
        input.note,
        authMe.user.id,
      ],
    )
    const dueId = dueResult.rows[0]?.id
    if (!dueId) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message:
          'This flat already has a DG balance for the selected previous cycle date.',
      })
    }

    const adjustment = await consumeDgAdvanceCreditsForFlatWithClient(client, {
      societyId: authMe.user.societyId,
      flatId: input.flatId,
      recomputeAccess: true,
    })

    const refreshedResult = await client.query<{
      balance_amount: string
      status: string
    }>(
      'select balance_amount::text, status::text from maintenance_dues where id = $1',
      [dueId],
    )
    const refreshed = refreshedResult.rows[0]

    await writeMasterAudit({
      client,
      event,
      actorUserId: authMe.user.id,
      actorAuthUserId: authMe.authUser.id,
      action: 'CREATED',
      eventKey: 'dg_opening_balance.created',
      afterState: {
        flatId: input.flatId,
        asOfDate: input.asOfDate,
        dueDate: input.dueDate,
        principalAmount,
        interestAmount,
        totalAmount,
        advanceAppliedAmount: adjustment.consumedAmount,
        balanceAmount: Number(refreshed?.balance_amount ?? totalAmount),
        note: input.note,
      },
      metadata: {
        billingPeriodId: period.id,
        flatId: input.flatId,
      },
      relatedEntities: [
        {
          entityTable: 'maintenance_dues',
          entityId: dueId,
          entityLabel: `${flat.block_name} ${flat.flat_number} - ${periodLabel}`,
        },
      ],
    })

    await client.query('commit')

    return createApiSuccess(event, {
      id: dueId,
      billingPeriodId: period.id,
      totalAmount,
      advanceAppliedAmount: adjustment.consumedAmount,
      balanceAmount: Number(refreshed?.balance_amount ?? totalAmount),
      status: refreshed?.status ?? 'OPEN',
    })
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
  }
})
