import { getDatabasePool } from '../server/utils/database'
import { refreshMaintenanceReceiptJournalForPayment } from '../server/utils/finance'
import { updatePaymentWithClient } from '../server/utils/payments'

const repairs = [
  {
    paymentId: '0b584a22-c2ba-4dc5-8abd-17fcfdb8021c',
    receiptNumber: 'AJOWA-2026-000419',
    flatNumber: 'T3-102',
  },
  {
    paymentId: 'c0f59c5e-9303-4fba-9c29-0bcb31d860c4',
    receiptNumber: 'AJOWA-2026-000420',
    flatNumber: 'T3-202',
  },
] as const

const apply = process.argv.includes('--apply')
const pool = getDatabasePool()

const main = async () => {
  const client = await pool.connect()

  try {
    await client.query('begin')
    await client.query(`set local lock_timeout = '5s'`)
    await client.query(`set local statement_timeout = '30s'`)

    const results = []
    for (const repair of repairs) {
      const paymentResult = await client.query<{
        id: string
        society_id: string
        verified_by_user_id: string | null
        amount: string
        receipt_number: string | null
        flat_id: string
        flat_number: string
      }>(
        `
          select
            p.id,
            p.society_id,
            p.verified_by_user_id,
            p.amount::text,
            p.receipt_number,
            f.id as flat_id,
            f.flat_number
          from payments p
          inner join flats f on f.id = p.received_for_flat_id
          where p.id = $1
          for update of p
        `,
        [repair.paymentId],
      )
      const payment = paymentResult.rows[0]
      if (
        !payment ||
        payment.receipt_number !== repair.receiptNumber ||
        payment.flat_number !== repair.flatNumber
      ) {
        throw new Error(
          `Repair target identity mismatch for ${repair.receiptNumber}.`,
        )
      }

      const beforeAllocations = await client.query<{
        charge_type: string
        allocated_amount: string
      }>(
        `
          select bp.charge_type::text, pa.allocated_amount::text
          from payment_allocations pa
          inner join maintenance_dues md on md.id = pa.maintenance_due_id
          inner join billing_periods bp on bp.id = md.billing_period_id
          where pa.payment_id = $1
          order by pa.allocation_order, pa.id
          for update of pa
        `,
        [payment.id],
      )
      const beforeTypes = new Set(
        beforeAllocations.rows.map((row) => row.charge_type),
      )
      if (!beforeTypes.has('CAM') || !beforeTypes.has('DG_SET')) {
        throw new Error(
          `${repair.receiptNumber} is no longer a mixed CAM/DG payment.`,
        )
      }

      const camDueResult = await client.query<{ id: string }>(
        `
          select md.id
          from maintenance_dues md
          inner join billing_periods bp on bp.id = md.billing_period_id
          where md.flat_id = $1
            and bp.charge_type = 'CAM'
            and md.status not in ('WAIVED', 'CANCELLED')
          order by bp.start_date desc, md.created_at desc
          limit 1
        `,
        [payment.flat_id],
      )
      const camDueId = camDueResult.rows[0]?.id
      if (!camDueId) {
        throw new Error(`No CAM due found for ${repair.flatNumber}.`)
      }

      const actorUserId =
        payment.verified_by_user_id ??
        (
          await client.query<{ id: string }>(
            `
            select id
            from users
            where society_id = $1
              and role in ('ADMIN', 'MANAGER')
              and is_active = true
              and deleted_at is null
            order by case when role = 'ADMIN' then 0 else 1 end, created_at
            limit 1
          `,
            [payment.society_id],
          )
        ).rows[0]?.id
      if (!actorUserId) {
        throw new Error(`No audit actor available for ${repair.receiptNumber}.`)
      }

      const editResult = await updatePaymentWithClient(client, {
        paymentId: payment.id,
        societyId: payment.society_id,
        actorUserId,
        changes: {
          chargeType: 'CAM',
          allocationMode: 'SELECTED_PERIODS',
          selectedDueIds: [camDueId],
          allowDuplicateUtr: false,
        },
      })
      const journal = await refreshMaintenanceReceiptJournalForPayment(client, {
        paymentId: payment.id,
        societyId: payment.society_id,
      })

      const afterAllocations = await client.query<{
        charge_type: string
        allocated_amount: string
      }>(
        `
          select bp.charge_type::text, pa.allocated_amount::text
          from payment_allocations pa
          inner join maintenance_dues md on md.id = pa.maintenance_due_id
          inner join billing_periods bp on bp.id = md.billing_period_id
          where pa.payment_id = $1
        `,
        [payment.id],
      )
      const afterTotal = afterAllocations.rows.reduce(
        (sum, row) => sum + Number(row.allocated_amount),
        0,
      )
      if (
        afterAllocations.rows.length !== 1 ||
        afterAllocations.rows[0]?.charge_type !== 'CAM' ||
        Math.round(afterTotal * 100) !==
          Math.round(Number(payment.amount) * 100)
      ) {
        throw new Error(
          `Post-repair allocation assertion failed for ${repair.receiptNumber}.`,
        )
      }

      const audit = await client.query<{ id: string }>(
        `
          insert into audit_events (
            society_id,
            module,
            event_key,
            action,
            severity,
            actor_user_id,
            flat_id,
            metadata,
            before_state,
            after_state
          )
          values ($1, 'PAYMENTS', 'payment.cam_dg_allocation_repaired', 'UPDATED', 'CRITICAL', $2, $3, $4::jsonb, $5::jsonb, $6::jsonb)
          returning id
        `,
        [
          payment.society_id,
          actorUserId,
          payment.flat_id,
          JSON.stringify({
            paymentId: payment.id,
            receiptNumber: repair.receiptNumber,
            repair: 'CAM_DG_PAYMENT_ISOLATION',
            journalVoucherNumber: journal?.voucherNumber ?? null,
          }),
          JSON.stringify({ allocations: beforeAllocations.rows }),
          JSON.stringify({ allocations: afterAllocations.rows }),
        ],
      )
      await client.query(
        `
          insert into audit_event_entities (
            audit_event_id,
            entity_table,
            entity_id,
            entity_label
          )
          values ($1, 'payments', $2, $3)
        `,
        [audit.rows[0]?.id, payment.id, repair.receiptNumber],
      )

      results.push({
        receiptNumber: repair.receiptNumber,
        flatNumber: repair.flatNumber,
        amount: Number(payment.amount),
        beforeAllocations: beforeAllocations.rows,
        afterAllocations: afterAllocations.rows,
        receiptInvalidated: editResult.receiptInvalidated,
        journalVoucherNumber: journal?.voucherNumber ?? null,
      })
    }

    if (apply) {
      await client.query('commit')
    } else {
      await client.query('rollback')
    }

    console.log(JSON.stringify({ applied: apply, results }, null, 2))
  } catch (error) {
    await client.query('rollback')
    throw error
  } finally {
    client.release()
    await pool.end()
  }
}

await main()
