import { createApiSuccess } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { getDatabasePool } from '~/server/utils/database'
import {
  getCamAdvanceAdjustedDueDate,
  getLateFeeStartDate,
  getPenaltyFreeUntilDate,
  resolveDueAmountsForDisplay,
  todayDate,
} from '~/server/utils/billing'
import { normalizeSocietySettings } from '~/server/utils/master-data'
import { camAdvanceCoverageLateralSql } from '~/server/utils/cam-advance'
import type { MaintenanceDue } from '~/types/domain'

type DueRow = {
  row_kind: 'DUE' | 'CAM_ADVANCE_COVERAGE'
  id: string
  society_id: string
  billing_period_id: string
  billing_period_label: string
  billing_period_due_date: string
  billing_period_charge_type: string
  billing_period_start_date: string
  billing_period_end_date: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  cam_advance_coverage_id: string | null
  cam_advance_covered_from: string | null
  cam_advance_paid_until: string | null
  due_date: string
  late_fee_starts_on: string | null
  cam_payment_arrangement_id: string | null
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
  is_cam_advance_covered: boolean
}

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const pool = getDatabasePool()
  const today = todayDate()

  const societyResult = await pool.query<{ settings: Record<string, unknown> }>(
    `select settings from society_profile where id = $1 limit 1`,
    [authMe.user.societyId],
  )

  const settings = normalizeSocietySettings(societyResult.rows[0]?.settings)
  const accessibleFlatIds = authMe.flatAccess.map((f) => f.flatId)

  if (accessibleFlatIds.length === 0) {
    return createApiSuccess(event, [])
  }

  const result = await pool.query<DueRow>(
    `
      with combined as (
        select
          'DUE'::text as row_kind,
          md.id::text as id,
          md.society_id,
          md.billing_period_id,
          bp.label as billing_period_label,
          bp.due_date::text as billing_period_due_date,
          bp.charge_type::text as billing_period_charge_type,
          bp.start_date::text as billing_period_start_date,
          bp.end_date::text as billing_period_end_date,
          md.flat_id,
          f.flat_number,
          b.name as block_name,
          b.sort_order as block_sort_order,
          f.unit_type,
          coverage.id::text as cam_advance_coverage_id,
          coverage.covered_from::text as cam_advance_covered_from,
          coverage.covered_until::text as cam_advance_paid_until,
          md.due_date::text as due_date,
          md.late_fee_starts_on::text as late_fee_starts_on,
          md.cam_payment_arrangement_id::text as cam_payment_arrangement_id,
          md.base_amount::text as base_amount,
          md.late_fee_amount::text as late_fee_amount,
          md.waived_amount::text as waived_amount,
          md.paid_amount::text as paid_amount,
          md.total_amount::text as total_amount,
          case
            when coverage.id is not null and md.balance_amount = 0 then '0'
            else md.balance_amount::text
          end as balance_amount,
          case
            when coverage.id is not null and md.balance_amount = 0 then 'PAID'
            else md.status::text
          end as status,
          md.charge_breakdown,
          md.generated_at::text,
          md.created_at::text,
          md.updated_at::text,
          fr.relationship_type::text,
          fr.is_billing_contact,
          (coverage.id is not null and md.balance_amount = 0) as is_cam_advance_covered
        from maintenance_dues md
        inner join billing_periods bp on bp.id = md.billing_period_id
        inner join flats f on f.id = md.flat_id
        inner join blocks b on b.id = f.block_id
        inner join flat_residents fr on fr.flat_id = md.flat_id and fr.user_id = $2 and fr.is_active = true
        left join lateral (
          ${camAdvanceCoverageLateralSql('f', 'bp')}
        ) coverage on bp.charge_type = 'CAM'
        where md.society_id = $1
          and md.flat_id = any($3::uuid[])

        union all

        select
          'CAM_ADVANCE_COVERAGE'::text as row_kind,
          concat('cam-advance:', bp.id::text, ':', f.id::text) as id,
          bp.society_id,
          bp.id as billing_period_id,
          bp.label as billing_period_label,
          bp.due_date::text as billing_period_due_date,
          bp.charge_type::text as billing_period_charge_type,
          bp.start_date::text as billing_period_start_date,
          bp.end_date::text as billing_period_end_date,
          f.id as flat_id,
          f.flat_number,
          b.name as block_name,
          b.sort_order as block_sort_order,
          f.unit_type,
          coverage.id::text as cam_advance_coverage_id,
          coverage.covered_from::text as cam_advance_covered_from,
          coverage.covered_until::text as cam_advance_paid_until,
          bp.due_date::text as due_date,
          null::text as late_fee_starts_on,
          null::text as cam_payment_arrangement_id,
          '0' as base_amount,
          '0' as late_fee_amount,
          '0' as waived_amount,
          '0' as paid_amount,
          '0' as total_amount,
          '0' as balance_amount,
          'PAID' as status,
          jsonb_build_array(jsonb_build_object(
            'label', 'CAM advance coverage',
            'amount', coalesce(coverage.amount, 0),
            'chargeType', 'CAM',
            'source', 'CAM_ADVANCE_COVERAGE',
            'coveredFrom', coverage.covered_from,
            'coveredUntil', coverage.covered_until,
            'reference', coverage.reference
          )) as charge_breakdown,
          coverage.created_at::text as generated_at,
          coverage.created_at::text,
          coverage.updated_at::text,
          fr.relationship_type::text,
          fr.is_billing_contact,
          true as is_cam_advance_covered
        from billing_periods bp
        inner join flats f on f.society_id = bp.society_id and f.is_active = true
        inner join blocks b on b.id = f.block_id
        inner join flat_residents fr on fr.flat_id = f.id and fr.user_id = $2 and fr.is_active = true
        inner join lateral (
          ${camAdvanceCoverageLateralSql('f', 'bp')}
        ) coverage on true
        where bp.society_id = $1
          and bp.charge_type = 'CAM'
          and f.id = any($3::uuid[])
          and not exists (
            select 1
            from maintenance_dues md
            where md.society_id = bp.society_id
              and md.billing_period_id = bp.id
              and md.flat_id = f.id
          )
      )
      select *
      from combined
      order by billing_period_start_date desc, block_sort_order asc, flat_number asc
    `,
    [authMe.user.societyId, authMe.user.id, accessibleFlatIds],
  )

  const items: MaintenanceDue[] = result.rows.map((row) => {
    const isCoverageRow = row.is_cam_advance_covered
    const baseAmount = Number(row.base_amount)
    const waivedAmount = Number(row.waived_amount)
    const paidAmount = Number(row.paid_amount)
    const chargeBreakdown = Array.isArray(row.charge_breakdown)
      ? row.charge_breakdown as MaintenanceDue['chargeBreakdown']
      : []
    const effectiveDueDate = getCamAdvanceAdjustedDueDate({
      dueDate: row.due_date,
      billingPeriodChargeType: row.billing_period_charge_type,
      billingPeriodStartDate: row.billing_period_start_date,
      billingPeriodEndDate: row.billing_period_end_date,
      chargeBreakdown,
    })
    const defaultLateFeeStartsOn = getLateFeeStartDate(effectiveDueDate, settings.graceDays)
    const effectiveLateFeeStartsOn = row.late_fee_starts_on
      ? row.late_fee_starts_on >= defaultLateFeeStartsOn
        ? row.late_fee_starts_on
        : defaultLateFeeStartsOn
      : null
    const computed = isCoverageRow
      ? {
          lateFeeAmount: Number(row.late_fee_amount),
          totalAmount: Number(row.total_amount),
          balanceAmount: Number(row.balance_amount),
          status: row.status as MaintenanceDue['status'],
        }
      : resolveDueAmountsForDisplay(
          {
            dueDate: effectiveDueDate,
            lateFeeStartsOn: effectiveLateFeeStartsOn,
            baseAmount,
            lateFeeAmount: Number(row.late_fee_amount),
            waivedAmount,
            paidAmount,
            totalAmount: Number(row.total_amount),
            balanceAmount: Number(row.balance_amount),
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
      billingPeriodChargeType: row.billing_period_charge_type as NonNullable<MaintenanceDue['billingPeriodChargeType']>,
      billingPeriodStartDate: row.billing_period_start_date,
      billingPeriodEndDate: row.billing_period_end_date,
      flatId: row.flat_id,
      flatNumber: row.flat_number,
      blockName: row.block_name,
      unitType: row.unit_type,
      dueDate: row.due_date,
      lateFeeStartsOn: effectiveLateFeeStartsOn,
      penaltyFreeUntilDate: isCoverageRow
        ? null
        : getPenaltyFreeUntilDate(effectiveDueDate, settings.graceDays, effectiveLateFeeStartsOn),
      camPaymentArrangementId: row.cam_payment_arrangement_id,
      baseAmount,
      lateFeeAmount: computed.lateFeeAmount,
      waivedAmount,
      paidAmount,
      totalAmount: computed.totalAmount,
      balanceAmount: computed.balanceAmount,
      status: computed.status,
      chargeBreakdown,
      generatedAt: row.generated_at,
      primaryResidentName: authMe.user.fullName,
      isCamAdvanceCovered: isCoverageRow,
      isAdvanceCoverageRow: row.row_kind === 'CAM_ADVANCE_COVERAGE',
      camAdvanceCoverageId: row.cam_advance_coverage_id,
      camAdvanceCoveredFrom: row.cam_advance_covered_from,
      camAdvancePaidUntil: row.cam_advance_paid_until,
      relationshipType: row.relationship_type,
      isBillingContact: row.is_billing_contact,
      canPayNow:
        !isCoverageRow &&
        row.is_billing_contact &&
        (row.relationship_type === 'OWNER' ||
          (row.relationship_type === 'TENANT' && settings.tenantPaymentsEnabled)),
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }
  })

  return createApiSuccess(event, items)
})
