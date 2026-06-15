import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import { getDaysOverdue, todayDate } from '~/server/utils/billing'
import type { DefaulterSummary } from '~/types/domain'

type DefaulterRow = {
  user_id: string
  auth_user_id: string
  resident_name: string
  resident_email: string
  resident_mobile_number: string
  flat_id: string
  flat_number: string
  block_name: string
  relationship_type: string
  due_id: string
  due_status: string
  billing_period_label: string
  total_amount: string
  paid_amount: string
  balance_amount: string
  due_date: string
}

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const pool = getDatabasePool()
  const today = todayDate()

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
        fr.relationship_type::text,
        md.id as due_id,
        md.status::text as due_status,
        bp.label as billing_period_label,
        md.total_amount::text,
        md.paid_amount::text,
        md.balance_amount::text,
        bp.due_date::text
      from maintenance_dues md
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join flat_residents fr on fr.flat_id = md.flat_id and fr.is_active = true
      inner join users u on u.id = fr.user_id
      where md.society_id = $1
        and md.status in ('OPEN', 'PARTIALLY_PAID', 'OVERDUE')
        and md.balance_amount > 0
      order by md.balance_amount desc, b.name, f.flat_number
    `,
    [authMe.user.societyId],
  )

  // Group by user
  const userMap = new Map<string, DefaulterSummary>()

  for (const row of result.rows) {
    const existing = userMap.get(row.user_id)

    const flatInfo = {
      flatId: row.flat_id,
      flatNumber: row.flat_number,
      blockName: row.block_name,
      relationshipType: row.relationship_type,
      dueId: row.due_id,
      dueStatus: row.due_status,
      billingPeriodLabel: row.billing_period_label,
      totalAmount: Number(row.total_amount),
      paidAmount: Number(row.paid_amount),
      balanceAmount: Number(row.balance_amount),
      daysOverdue: getDaysOverdue(row.due_date, today),
    }

    if (existing) {
      existing.flats.push(flatInfo)
      existing.flatCount = existing.flats.length
      existing.totalDue += flatInfo.totalAmount
      existing.totalPaid += flatInfo.paidAmount
      existing.totalBalance += flatInfo.balanceAmount
      existing.maxDaysOverdue = Math.max(existing.maxDaysOverdue, flatInfo.daysOverdue)
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

  const defaulters = Array.from(userMap.values()).sort((a, b) => b.totalBalance - a.totalBalance)

  return createApiSuccess(event, defaulters)
})