import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  computeDueAmounts,
  getDaysOverdue,
  todayDate,
} from '~/server/utils/billing'
import { normalizeSocietySettings } from '~/server/utils/master-data'
import type { DefaulterSummary } from '~/types/domain'

type DefaulterRow = {
  user_id: string
  auth_user_id: string | null
  resident_name: string
  resident_email: string | null
  resident_mobile_number: string | null
  flat_id: string
  flat_number: string
  block_name: string
  relationship_type: string
  due_id: string
  due_status: string
  billing_period_label: string
  base_amount: string
  waived_amount: string
  total_amount: string
  paid_amount: string
  balance_amount: string
  due_date: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()
  const today = todayDate()

  const societyResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )
  const settings = normalizeSocietySettings(societyResult.rows[0]?.settings)

  // Fetch all unpaid dues with resident info
  const result = await pool.query<DefaulterRow>(
    `
      select
        u.id as user_id,
        u.auth_user_id,
        u.full_name as resident_name,
        u.email as resident_email,
        u.mobile_number as resident_mobile_number,
        f.id as flat_id,
        f.flat_number,
        b.name as block_name,
        u.relationship_type::text,
        md.id as due_id,
        md.status::text as due_status,
        bp.label as billing_period_label,
        md.base_amount::text,
        md.waived_amount::text,
        md.total_amount::text,
        md.paid_amount::text,
        md.balance_amount::text,
        bp.due_date::text
      from maintenance_dues md
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join lateral (
        select
          u.id,
          u.auth_user_id,
          u.full_name,
          u.email,
          u.mobile_number,
          fr.relationship_type
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        where fr.flat_id = md.flat_id
          and fr.is_active = true
          and u.is_active = true
        order by
          fr.is_billing_contact desc,
          fr.is_primary_contact desc,
          case fr.relationship_type
            when 'OWNER' then 1
            when 'TENANT' then 2
            else 3
          end,
          fr.created_at asc
        limit 1
      ) u on true
      where md.society_id = $1
        and md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
        and md.balance_amount > 0
        and not (
          bp.charge_type = 'CAM'
          and f.cam_advance_paid_until is not null
          and f.cam_advance_paid_until >= bp.end_date
        )
      order by md.balance_amount desc, b.name, f.flat_number
    `,
    [authMe.user.societyId],
  )

  // Group by user
  const userMap = new Map<string, DefaulterSummary>()

  for (const row of result.rows) {
    const existing = userMap.get(row.user_id)
    const computed = computeDueAmounts(
      {
        dueDate: row.due_date,
        baseAmount: Number(row.base_amount),
        waivedAmount: Number(row.waived_amount),
        paidAmount: Number(row.paid_amount),
        storedStatus: row.due_status,
      },
      today,
      settings.graceDays,
      settings.lateFeePerDay,
    )

    const daysOverdue = getDaysOverdue(row.due_date, today)
    const graceAdjustedDaysOverdue = Math.max(
      0,
      daysOverdue - settings.graceDays,
    )

    if (
      computed.balanceAmount <= 0 ||
      graceAdjustedDaysOverdue <= 0 ||
      ['PAID', 'WAIVED', 'CANCELLED'].includes(computed.status)
    ) {
      continue
    }

    const flatInfo = {
      flatId: row.flat_id,
      flatNumber: row.flat_number,
      blockName: row.block_name,
      relationshipType: row.relationship_type,
      dueId: row.due_id,
      dueStatus: computed.status,
      billingPeriodLabel: row.billing_period_label,
      dueDate: row.due_date,
      totalAmount: computed.totalAmount,
      paidAmount: Number(row.paid_amount),
      balanceAmount: computed.balanceAmount,
      daysOverdue,
    }

    if (existing) {
      existing.flats.push(flatInfo)
      existing.flatCount = existing.flats.length
      existing.totalDue += flatInfo.totalAmount
      existing.totalPaid += flatInfo.paidAmount
      existing.totalBalance += flatInfo.balanceAmount
      existing.maxDaysOverdue = Math.max(
        existing.maxDaysOverdue,
        flatInfo.daysOverdue,
      )
    } else {
      userMap.set(row.user_id, {
        userId: row.user_id,
        authUserId: row.auth_user_id,
        residentName: row.resident_name,
        residentEmail: row.resident_email,
        residentMobileNumber: row.resident_mobile_number,
        flatCount: 1,
        flats: [flatInfo],
        totalDue: flatInfo.totalAmount,
        totalPaid: flatInfo.paidAmount,
        totalBalance: flatInfo.balanceAmount,
        maxDaysOverdue: flatInfo.daysOverdue,
      })
    }
  }

  const defaulters = Array.from(userMap.values()).sort(
    (a, b) => b.totalBalance - a.totalBalance,
  )

  return createApiSuccess(event, defaulters)
})
