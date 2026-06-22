import pdfMake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'
import * as QRCode from 'qrcode'
import { z } from 'zod'
import type { ChargeBreakdownItem } from '~/types/domain'
import { AppError } from './errors'
import { getDatabasePool } from './database'
import { normalizeSocietySettings } from './master-data'

pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs

export const chargeBreakdownItemSchema = z.object({
  label: z.string().trim().min(1).max(200),
  amount: z.coerce.number().positive(),
  chargeType: z.enum(['CAM', 'DG_SET', 'OTHER']).optional(),
  calculationMethod: z.enum(['FIXED', 'AREA_RATE']).optional().default('FIXED'),
  ratePerSqFt: z.coerce.number().positive().optional(),
  areaSqFt: z.coerce.number().positive().optional(),
  source: z.string().trim().max(80).optional(),
  electricityType: z.string().trim().max(80).nullable().optional(),
  meterNo: z.string().trim().max(80).nullable().optional(),
  openingReading: z.coerce.number().nonnegative().nullable().optional(),
  closingReading: z.coerce.number().nonnegative().nullable().optional(),
  consumedUnits: z.coerce.number().nonnegative().nullable().optional(),
  ratePerUnit: z.coerce.number().nonnegative().nullable().optional(),
  tariffRateLabel: z.string().trim().max(80).nullable().optional(),
  connectionLoad: z.string().trim().max(80).nullable().optional(),
  state: z.string().trim().max(80).nullable().optional(),
  stateCode: z.string().trim().max(20).nullable().optional(),
  previousOutstanding: z.coerce.number().nonnegative().nullable().optional(),
  interestAmount: z.coerce.number().nonnegative().nullable().optional(),
}).superRefine((item, ctx) => {
  if (item.calculationMethod === 'AREA_RATE' && !item.ratePerSqFt && !item.amount) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['ratePerSqFt'],
      message: 'Area-rate charges require a rate per sq ft.',
    })
  }
})

export const chargeBreakdownSchema = z.array(chargeBreakdownItemSchema).min(1)

export const billingPeriodSchema = z.object({
  label: z.string().trim().min(2).max(200),
  frequency: z.enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM']),
  startDate: z.string().date(),
  endDate: z.string().date(),
  dueDate: z.string().date(),
})

export const billingPeriodUpdateSchema = billingPeriodSchema.partial().extend({
  isLocked: z.boolean().optional(),
  lockReason: z.string().trim().max(500).nullable().optional(),
})

export const chargeConfigSchema = z.object({
  graceDays: z.coerce.number().int().nonnegative().default(0),
  lateFeePerDay: z.coerce.number().nonnegative().default(50),
  billingTenure: z
    .enum(['MONTHLY', 'QUARTERLY', 'HALF_YEARLY', 'YEARLY', 'CUSTOM'])
    .default('MONTHLY'),
  excessPaymentHandling: z
    .enum(['KEEP_AS_ADVANCE', 'REFUND', 'MANUAL_REVIEW'])
    .default('KEEP_AS_ADVANCE'),
  defaultCharges: chargeBreakdownSchema.optional().default([]),
  flatTypeCharges: z
    .array(
      z.object({
        flatType: z.string().trim().min(1),
        label: z.string().trim().min(1).optional(),
        charges: chargeBreakdownSchema,
      }),
    )
    .optional()
    .default([]),
  flatOverrideCharges: z
    .array(
      z.object({
        flatId: z.string().uuid(),
        flatNumber: z.string().trim().min(1).optional(),
        blockName: z.string().trim().optional(),
        charges: chargeBreakdownSchema,
      }),
    )
    .optional()
    .default([]),
})

export const dueGenerationSchema = z.object({
  billingPeriodId: z.string().uuid(),
  flatIds: z.array(z.string().uuid()).optional(),
})

export const dueWaiveSchema = z.object({
  waived: z.boolean(),
  reason: z.string().trim().min(2).max(500),
})

export const dueReminderSchema = z.object({
  dueIds: z.array(z.string().uuid()).min(1).max(500),
})

export const dueBillSendSchema = z.object({
  dueIds: z.array(z.string().uuid()).min(1).max(500),
  channels: z.array(z.enum(['EMAIL', 'WHATSAPP'])).min(1).max(2).default(['EMAIL']),
})

export type BillingPeriodInput = z.infer<typeof billingPeriodSchema>
export type BillingPeriodUpdateInput = z.infer<typeof billingPeriodUpdateSchema>
export type ChargeConfigInput = z.infer<typeof chargeConfigSchema>
export type DueGenerationInput = z.infer<typeof dueGenerationSchema>
export type DueWaiveInput = z.infer<typeof dueWaiveSchema>
export type DueReminderInput = z.infer<typeof dueReminderSchema>
export type DueBillSendInput = z.infer<typeof dueBillSendSchema>

export const todayDate = () => new Date().toISOString().slice(0, 10)

export type DueAmountInput = {
  dueDate: string
  baseAmount: number
  paidAmount: number
  waivedAmount: number
  storedStatus: string
}

export type ComputedDueAmounts = {
  lateFeeAmount: number
  totalAmount: number
  balanceAmount: number
  status: import('~/types/domain').DueStatus
}

export const computeLateFee = (
  dueDate: string,
  today: string,
  graceDays: number,
  lateFeePerDay: number,
): number => {
  const due = new Date(dueDate)
  const now = new Date(today)
  const diffMs = now.getTime() - due.getTime()
  const diffDays = Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)) - graceDays)
  return Math.round(diffDays * lateFeePerDay * 100) / 100
}

export const computeDueAmounts = (
  due: DueAmountInput,
  today: string,
  graceDays: number,
  lateFeePerDay: number,
): ComputedDueAmounts => {
  const lateFeeAmount = computeLateFee(due.dueDate, today, graceDays, lateFeePerDay)
  const totalAmount = Math.max(
    0,
    Math.round((due.baseAmount + lateFeeAmount - due.waivedAmount) * 100) / 100,
  )
  const balanceAmount = Math.max(0, Math.round((totalAmount - due.paidAmount) * 100) / 100)
  let status = due.storedStatus as import('~/types/domain').DueStatus

  if (!['WAIVED', 'CANCELLED'].includes(status)) {
    if (balanceAmount <= 0) {
      status = 'PAID'
    } else if (due.paidAmount > 0) {
      status = 'PARTIALLY_PAID'
    } else if (lateFeeAmount > 0) {
      status = 'OVERDUE'
    } else {
      status = 'OPEN'
    }
  }

  return {
    lateFeeAmount,
    totalAmount,
    balanceAmount,
    status,
  }
}

export const getDaysOverdue = (dueDate: string, today: string): number => {
  const due = new Date(dueDate)
  const now = new Date(today)
  const diffMs = now.getTime() - due.getTime()
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)))
}

export const mapRowToBillingPeriod = <
  TRow extends {
    id: string
    society_id: string
    label: string
    frequency: string
    start_date: string
    end_date: string
    due_date: string
    is_locked: boolean
    locked_at: string | null
    lock_reason: string | null
    created_at: string
    updated_at: string
    due_count?: string
    paid_due_count?: string
    unpaid_due_count?: string
  },
>(
  row: TRow,
) => {
  const result: Record<string, unknown> = {
    id: row.id,
    societyId: row.society_id,
    label: row.label,
    frequency: row.frequency,
    startDate: row.start_date,
    endDate: row.end_date,
    dueDate: row.due_date,
    isLocked: row.is_locked,
    lockedAt: row.locked_at,
    lockReason: row.lock_reason,
    status: row.is_locked ? 'LOCKED' : 'OPEN',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }

  if (row.due_count != null) {
    result.dueCount = Number(row.due_count)
  }

  if (row.paid_due_count != null) {
    result.paidDueCount = Number(row.paid_due_count)
  }

  if (row.unpaid_due_count != null) {
    result.unpaidDueCount = Number(row.unpaid_due_count)
  }

  return result as unknown as import('~/types/domain').BillingPeriod
}

type FlatTypeChargeLookup =
  | ReadonlyMap<string, ChargeBreakdownItem[]>
  | { flatType: string; charges: ChargeBreakdownItem[] }[]

type FlatOverrideChargeLookup =
  | ReadonlyMap<string, ChargeBreakdownItem[]>
  | { flatId: string; charges: ChargeBreakdownItem[] }[]

export const appendChargeLookup = (
  target: Map<string, ChargeBreakdownItem[]>,
  key: string,
  items: ChargeBreakdownItem[],
) => {
  const existing = target.get(key)

  if (existing) {
    existing.push(...items)
  } else {
    target.set(key, [...items])
  }
}

const readFlatTypeCharges = (
  lookup: FlatTypeChargeLookup,
  flatType: string,
) =>
  Array.isArray(lookup)
    ? lookup.find((entry) => entry.flatType === flatType)?.charges
    : lookup.get(flatType)

const readFlatOverrideCharges = (
  lookup: FlatOverrideChargeLookup,
  flatId: string,
) =>
  Array.isArray(lookup)
    ? lookup.find((entry) => entry.flatId === flatId)?.charges
    : lookup.get(flatId)

export const resolveChargeBreakdown = (
  defaultCharges: ChargeBreakdownItem[],
  flatTypeCharges: FlatTypeChargeLookup,
  flatOverrideCharges: FlatOverrideChargeLookup,
  flatType: string,
  flatId: string,
  flatAreaSqFt?: number | null,
): ChargeBreakdownItem[] => {
  const overrideCharges = readFlatOverrideCharges(flatOverrideCharges, flatId)
  if (overrideCharges) {
    return materializeChargeBreakdown(overrideCharges, flatAreaSqFt)
  }

  const typeCharges = readFlatTypeCharges(flatTypeCharges, flatType)
  if (typeCharges) {
    return materializeChargeBreakdown(typeCharges, flatAreaSqFt)
  }

  return materializeChargeBreakdown(defaultCharges, flatAreaSqFt)
}

export const materializeChargeBreakdown = (
  charges: ChargeBreakdownItem[],
  flatAreaSqFt?: number | null,
): ChargeBreakdownItem[] =>
  charges.map((charge) => {
    if (charge.calculationMethod !== 'AREA_RATE') {
      return { ...charge }
    }

    const ratePerSqFt = charge.ratePerSqFt ?? charge.amount
    const areaSqFt = flatAreaSqFt ?? charge.areaSqFt
    const amount = areaSqFt ? Math.round(areaSqFt * ratePerSqFt * 100) / 100 : 0

    const materialized: ChargeBreakdownItem = {
      ...charge,
      calculationMethod: 'AREA_RATE',
      ratePerSqFt,
      amount,
    }

    if (areaSqFt) {
      materialized.areaSqFt = areaSqFt
    }

    return materialized
  })

export const hasUnresolvedAreaRateCharge = (charges: ChargeBreakdownItem[]) =>
  charges.some((charge) => charge.calculationMethod === 'AREA_RATE' && charge.amount <= 0)

type MaintenanceBillAccess = {
  societyId?: string
  userId?: string
  isStaff?: boolean
}

type MaintenanceBillDueRow = {
  id: string
  society_id: string
  society_code: string
  society_name: string
  registration_number: string | null
  society_address: string
  contact_email: string | null
  contact_phone: string | null
  settings: Record<string, unknown> | null
  billing_period_id: string
  billing_period_label: string
  period_start_date: string
  period_end_date: string
  due_date: string
  flat_id: string
  flat_number: string
  block_name: string
  unit_type: string
  area_sq_ft: string | null
  base_amount: string
  late_fee_amount: string
  waived_amount: string
  paid_amount: string
  total_amount: string
  balance_amount: string
  status: string
  charge_breakdown: unknown
  generated_at: string
  billing_contact_name: string | null
  billing_contact_email: string | null
  billing_contact_mobile: string | null
  bank_name: string | null
  account_name: string | null
  account_number: string | null
  ifsc_code: string | null
  branch_name: string | null
  upi_id: string | null
}

type PreviousDueRow = {
  due_date: string
  base_amount: string
  waived_amount: string
  paid_amount: string
  status: string
}

const roundBillMoney = (value: number) => Math.round(value * 100) / 100

const formatBillMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)

const formatBillPlainNumber = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    maximumFractionDigits: 2,
  }).format(value)

const formatBillDate = (value: string | null | undefined) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const formatDgBillDate = (value: string | null | undefined) =>
  value
    ? new Date(value.length === 10 ? `${value}T00:00:00` : value).toLocaleDateString('en-GB', {
        day: '2-digit',
        month: 'short',
        year: 'numeric',
      })
    : '-'

const sanitizeBillFileSegment = (value: string) =>
  value
    .trim()
    .replace(/[^a-z0-9._-]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120)

const normalizeBillChargeBreakdown = (
  value: unknown,
  fallbackAmount: number,
): ChargeBreakdownItem[] => {
  if (!Array.isArray(value)) {
    return [{ label: 'Maintenance Charges', amount: fallbackAmount }]
  }

  const charges = value
    .map((item) => {
      if (!item || typeof item !== 'object') {
        return null
      }
      const source = item as Record<string, unknown>
      const label = String(source.label ?? '').trim()
      const amount = Number(source.amount ?? 0)
      if (!label || !Number.isFinite(amount)) {
        return null
      }

      const charge: ChargeBreakdownItem = {
        label,
        amount,
      }

      if (source.chargeType === 'CAM' || source.chargeType === 'DG_SET' || source.chargeType === 'OTHER') {
        charge.chargeType = source.chargeType
      }

      if (source.calculationMethod === 'AREA_RATE') {
        charge.calculationMethod = 'AREA_RATE'
      } else if (source.calculationMethod === 'FIXED') {
        charge.calculationMethod = 'FIXED'
      }

      const copyStringField = <TKey extends keyof ChargeBreakdownItem>(field: TKey) => {
        const rawValue = source[field]
        if (typeof rawValue === 'string') {
          const trimmed = rawValue.trim()
          if (trimmed) {
            ;(charge as Record<string, unknown>)[field] = trimmed
          }
        }
      }

      const copyNumberField = <TKey extends keyof ChargeBreakdownItem>(field: TKey) => {
        if (source[field] != null && Number.isFinite(Number(source[field]))) {
          ;(charge as Record<string, unknown>)[field] = Number(source[field])
        }
      }

      copyStringField('source')
      copyStringField('electricityType')
      copyStringField('meterNo')
      copyStringField('tariffRateLabel')
      copyStringField('connectionLoad')
      copyStringField('state')
      copyStringField('stateCode')
      copyNumberField('openingReading')
      copyNumberField('closingReading')
      copyNumberField('consumedUnits')
      copyNumberField('ratePerUnit')
      copyNumberField('previousOutstanding')
      copyNumberField('interestAmount')

      if (source.ratePerSqFt != null && Number.isFinite(Number(source.ratePerSqFt))) {
        charge.ratePerSqFt = Number(source.ratePerSqFt)
      }
      if (source.areaSqFt != null && Number.isFinite(Number(source.areaSqFt))) {
        charge.areaSqFt = Number(source.areaSqFt)
      }

      return charge
    })
    .filter((item): item is ChargeBreakdownItem => Boolean(item))

  return charges.length > 0 ? charges : [{ label: 'Maintenance Charges', amount: fallbackAmount }]
}

const buildMaintenanceBillNumber = (row: MaintenanceBillDueRow) => {
  const periodCode = row.period_start_date.replaceAll('-', '').slice(0, 6)
  const flatCode = sanitizeBillFileSegment(`${row.block_name}-${row.flat_number}`).toUpperCase()
  return sanitizeBillFileSegment(`${row.society_code}-BILL-${periodCode}-${flatCode}`).toUpperCase()
}

const isDgSetCharge = (charge: ChargeBreakdownItem) =>
  charge.chargeType === 'DG_SET' ||
  /\b(dg\s*set|dgset|generator|power\s*back\s*up|power\s*backup)\b/i.test(charge.label)

const sumBillCharges = (charges: ChargeBreakdownItem[]) =>
  roundBillMoney(charges.reduce((sum, charge) => sum + Number(charge.amount ?? 0), 0))

const getCompactFlatNumber = (row: MaintenanceBillDueRow) => {
  const block = row.block_name.trim()
  const flat = row.flat_number.trim()

  if (!block) return flat
  if (flat.toLowerCase().includes(block.toLowerCase())) return flat

  return `${block}_${flat}`
}

const buildUpiPaymentPayload = (row: MaintenanceBillDueRow, amount: number, billNumber: string) => {
  if (!row.upi_id) return null

  const params = new URLSearchParams({
    pa: row.upi_id,
    pn: row.account_name ?? row.society_name,
    cu: 'INR',
    tn: billNumber,
  })

  if (amount > 0) {
    params.set('am', amount.toFixed(2))
  }

  return `upi://pay?${params.toString()}`
}

export const getMaintenanceBillData = async (
  dueId: string,
  access: MaintenanceBillAccess = {},
) => {
  const params: unknown[] = [dueId]
  const filters = ['md.id = $1']

  if (access.societyId) {
    params.push(access.societyId)
    filters.push(`md.society_id = $${params.length}`)
  }

  if (access.userId && !access.isStaff) {
    params.push(access.userId)
    filters.push(
      `exists (
        select 1
        from flat_residents fr_access
        where fr_access.flat_id = md.flat_id
          and fr_access.user_id = $${params.length}
          and fr_access.is_active = true
      )`,
    )
  }

  const pool = getDatabasePool()
  const dueResult = await pool.query<MaintenanceBillDueRow>(
    `
      select
        md.id,
        md.society_id,
        sp.code as society_code,
        sp.name as society_name,
        sp.registration_number,
        concat_ws(', ', sp.address_line_1, sp.address_line_2, sp.city, sp.state, sp.pincode) as society_address,
        sp.contact_email,
        sp.contact_phone,
        sp.settings,
        md.billing_period_id,
        bp.label as billing_period_label,
        bp.start_date::text as period_start_date,
        bp.end_date::text as period_end_date,
        md.due_date::text,
        md.flat_id,
        f.flat_number,
        b.name as block_name,
        f.unit_type,
        f.area_sq_ft::text,
        md.base_amount::text,
        md.late_fee_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.total_amount::text,
        md.balance_amount::text,
        md.status::text,
        md.charge_breakdown,
        md.generated_at::text,
        billing_contact.full_name as billing_contact_name,
        billing_contact.email as billing_contact_email,
        billing_contact.mobile_number as billing_contact_mobile,
        bank.bank_name,
        bank.account_name,
        bank.account_number,
        bank.ifsc_code,
        bank.branch_name,
        bank.upi_id
      from maintenance_dues md
      inner join society_profile sp on sp.id = md.society_id
      inner join billing_periods bp on bp.id = md.billing_period_id
      inner join flats f on f.id = md.flat_id
      inner join blocks b on b.id = f.block_id
      left join lateral (
        select
          u.full_name,
          u.email::text,
          u.mobile_number
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        where fr.flat_id = f.id
          and fr.is_active = true
          and u.is_active = true
        order by fr.is_billing_contact desc, fr.is_primary_contact desc, fr.created_at asc
        limit 1
      ) billing_contact on true
      left join lateral (
        select
          bank_name,
          account_name,
          account_number,
          ifsc_code,
          branch_name,
          upi_id
        from society_bank_accounts
        where society_id = sp.id
          and is_active = true
        order by is_default desc, created_at asc
        limit 1
      ) bank on true
      where ${filters.join(' and ')}
      limit 1
    `,
    params,
  )

  const due = dueResult.rows[0]
  if (!due) {
    throw new AppError({
      code: 'NOT_FOUND',
      statusCode: 404,
      message: 'Maintenance bill not found.',
    })
  }

  const settings = normalizeSocietySettings(due.settings)
  const currentAmounts = computeDueAmounts(
    {
      dueDate: due.due_date,
      baseAmount: Number(due.base_amount),
      paidAmount: Number(due.paid_amount),
      waivedAmount: Number(due.waived_amount),
      storedStatus: due.status,
    },
    todayDate(),
    settings.graceDays,
    settings.lateFeePerDay,
  )

  const previousResult = await pool.query<PreviousDueRow>(
    `
      select
        md.due_date::text,
        md.base_amount::text,
        md.waived_amount::text,
        md.paid_amount::text,
        md.status::text
      from maintenance_dues md
      inner join billing_periods bp on bp.id = md.billing_period_id
      where md.society_id = $1
        and md.flat_id = $2
        and md.id <> $3
        and bp.start_date < $4::date
        and md.status not in ('PAID', 'WAIVED', 'CANCELLED')
      order by bp.start_date asc
    `,
    [due.society_id, due.flat_id, due.id, due.period_start_date],
  )

  const previousOutstanding = roundBillMoney(
    previousResult.rows.reduce((sum, previousDue) => {
      const computed = computeDueAmounts(
        {
          dueDate: previousDue.due_date,
          baseAmount: Number(previousDue.base_amount),
          paidAmount: Number(previousDue.paid_amount),
          waivedAmount: Number(previousDue.waived_amount),
          storedStatus: previousDue.status,
        },
        todayDate(),
        settings.graceDays,
        settings.lateFeePerDay,
      )

      return sum + computed.balanceAmount
    }, 0),
  )

  const chargeBreakdown = normalizeBillChargeBreakdown(due.charge_breakdown, Number(due.base_amount))
  const billNumber = buildMaintenanceBillNumber(due)
  const currentBalance = currentAmounts.balanceAmount
  const netPayable = roundBillMoney(currentBalance + previousOutstanding)

  return {
    due,
    settings,
    billNumber,
    chargeBreakdown,
    previousOutstanding,
    currentAmounts,
    currentBalance,
    netPayable,
  }
}

export const generateMaintenanceBillPdf = async (
  dueId: string,
  access: MaintenanceBillAccess = {},
) => {
  const bill = await getMaintenanceBillData(dueId, access)
  const { due, chargeBreakdown, currentAmounts, previousOutstanding, currentBalance, netPayable } = bill
  const flatLabel = `${due.block_name} ${due.flat_number}`
  const compactFlatNumber = getCompactFlatNumber(due)
  const contactLines = [
    due.billing_contact_name,
    due.billing_contact_mobile,
    due.billing_contact_email,
  ].filter(Boolean)
  const address = [flatLabel, due.society_address].filter(Boolean).join(', ')
  const dgCharges = chargeBreakdown.filter(isDgSetCharge)
  const maintenanceCharges = chargeBreakdown.filter((charge) => !isDgSetCharge(charge))
  const invoiceCharges = maintenanceCharges.length > 0 || dgCharges.length > 0
    ? maintenanceCharges
    : chargeBreakdown
  const hasSeparateDgBill = dgCharges.length > 0
  const maintenanceAmount = sumBillCharges(invoiceCharges)
  const dgAmount = sumBillCharges(dgCharges)

  const buildChargeRows = (charges: ChargeBreakdownItem[]) => charges.map((charge) => {
    const isAreaRate = charge.calculationMethod === 'AREA_RATE'
    const units = isAreaRate && charge.areaSqFt ? `${charge.areaSqFt} sq ft` : '-'
    const rate = isAreaRate && charge.ratePerSqFt ? `${formatBillMoney(charge.ratePerSqFt)} / sq ft` : '-'

    return [
      { text: charge.label, style: 'tableCell' },
      { text: units, style: 'tableCell' },
      { text: rate, style: 'tableCellRight' },
      { text: formatBillMoney(Number(charge.amount)), style: 'tableCellRight' },
    ]
  })

  const bankRows = due.bank_name
    ? [
        [{ text: 'Bank Name', style: 'labelCell' }, { text: due.bank_name, style: 'valueCell' }],
        [{ text: 'Account Name', style: 'labelCell' }, { text: due.account_name ?? due.society_name, style: 'valueCell' }],
        [{ text: 'Account No.', style: 'labelCell' }, { text: due.account_number ?? '-', style: 'valueCell' }],
        [{ text: 'IFSC', style: 'labelCell' }, { text: due.ifsc_code ?? '-', style: 'valueCell' }],
        [{ text: 'Branch', style: 'labelCell' }, { text: due.branch_name ?? '-', style: 'valueCell' }],
        [{ text: 'UPI', style: 'labelCell' }, { text: due.upi_id ?? '-', style: 'valueCell' }],
      ]
    : [
        [
          { text: 'Payment Details', style: 'labelCell' },
          { text: 'Contact the society office for bank or UPI payment details.', style: 'valueCell' },
        ],
      ]

  const dgOuterLayout = {
    hLineWidth: () => 0.9,
    vLineWidth: () => 0.9,
    hLineColor: () => '#111827',
    vLineColor: () => '#111827',
    paddingLeft: () => 0,
    paddingRight: () => 0,
    paddingTop: () => 0,
    paddingBottom: () => 0,
  }

  const dgDenseGridLayout = {
    hLineWidth: () => 0.55,
    vLineWidth: () => 0.55,
    hLineColor: () => '#111827',
    vLineColor: () => '#111827',
    paddingLeft: () => 2,
    paddingRight: () => 2,
    paddingTop: () => 1.6,
    paddingBottom: () => 1.6,
  }

  const buildMaintenanceInvoiceSection = (): Record<string, unknown>[] => {
    if (invoiceCharges.length === 0) {
      return []
    }

    const chargeRows = buildChargeRows(invoiceCharges)
    const summaryRows = hasSeparateDgBill
      ? [
          [{ text: 'Current CAM / maintenance charges', style: 'summaryLabel' }, { text: formatBillMoney(maintenanceAmount), style: 'summaryValue' }],
          [{ text: 'Previous outstanding', style: 'summaryLabel' }, { text: formatBillMoney(previousOutstanding), style: 'summaryValue' }],
          [{ text: 'Net amount payable', style: 'summaryTotalLabel' }, { text: formatBillMoney(roundBillMoney(maintenanceAmount + previousOutstanding)), style: 'summaryTotalValue' }],
        ]
      : [
          [{ text: 'Current period charges', style: 'summaryLabel' }, { text: formatBillMoney(currentAmounts.totalAmount), style: 'summaryValue' }],
          [{ text: 'Paid / adjusted for this period', style: 'summaryLabel' }, { text: formatBillMoney(Number(due.paid_amount)), style: 'summaryValue' }],
          [{ text: 'Current period balance', style: 'summaryLabel' }, { text: formatBillMoney(currentBalance), style: 'summaryValue' }],
          [{ text: 'Previous outstanding', style: 'summaryLabel' }, { text: formatBillMoney(previousOutstanding), style: 'summaryValue' }],
          [{ text: 'Net amount payable', style: 'summaryTotalLabel' }, { text: formatBillMoney(netPayable), style: 'summaryTotalValue' }],
        ]

    return [
      {
        table: {
          widths: ['*'],
          body: [
            [{ text: due.society_name, style: 'brand', alignment: 'center' }],
            [{ text: due.society_address, style: 'subtle', alignment: 'center' }],
            [
              {
                text: [due.contact_phone, due.contact_email].filter(Boolean).join(' | '),
                style: 'subtle',
                alignment: 'center',
              },
            ],
            [
              {
                text: hasSeparateDgBill ? 'CAM / MAINTENANCE BILL CUM NOTICE' : 'BILL CUM NOTICE',
                style: 'noticeTitle',
                alignment: 'center',
              },
            ],
          ],
        },
        layout: {
          hLineWidth: () => 0.6,
          vLineWidth: () => 0.6,
          hLineColor: () => '#111827',
          vLineColor: () => '#111827',
          paddingTop: () => 4,
          paddingBottom: () => 4,
        },
      },
      {
        columns: [
          {
            table: {
              widths: ['35%', '*'],
              body: [
                [{ text: 'Flat No.', style: 'labelCell' }, { text: flatLabel, style: 'valueCellBold' }],
                [{ text: 'Address', style: 'labelCell' }, { text: address, style: 'valueCell' }],
                [{ text: 'Billing Contact', style: 'labelCell' }, { text: contactLines.join('\n') || '-', style: 'valueCell' }],
              ],
            },
            layout: 'lightHorizontalLines',
          },
          {
            table: {
              widths: ['38%', '*'],
              body: [
                [{ text: 'Bill No.', style: 'labelCell' }, { text: bill.billNumber, style: 'valueCellBold' }],
                [{ text: 'Dated', style: 'labelCell' }, { text: formatBillDate(due.generated_at), style: 'valueCell' }],
                [{ text: 'Period', style: 'labelCell' }, { text: `${formatBillDate(due.period_start_date)} to ${formatBillDate(due.period_end_date)}`, style: 'valueCell' }],
                [{ text: 'Due Date', style: 'labelCell' }, { text: formatBillDate(due.due_date), style: 'valueCellBold' }],
              ],
            },
            layout: 'lightHorizontalLines',
          },
        ],
        columnGap: 8,
        margin: [0, 10, 0, 10],
      },
      {
        table: {
          headerRows: 1,
          widths: ['*', '20%', '22%', '20%'],
          body: [
            [
              { text: 'Description', style: 'tableHeader' },
              { text: 'Units', style: 'tableHeader' },
              { text: 'Rate', style: 'tableHeader' },
              { text: 'Amount', style: 'tableHeaderRight' },
            ],
            ...chargeRows,
          ],
        },
        layout: 'lightHorizontalLines',
      },
      {
        columns: [
          {
            table: {
              widths: ['*', '32%'],
              body: summaryRows,
            },
            layout: 'lightHorizontalLines',
          },
          {
            table: {
              widths: ['34%', '*'],
              body: bankRows,
            },
            layout: 'lightHorizontalLines',
          },
        ],
        columnGap: 10,
        margin: [0, 12, 0, 12],
      },
      {
        text: [
          { text: 'Terms and Conditions\n', bold: true },
          `Payment should be made on or before ${formatBillDate(due.due_date)}. Late payment may attract charges as per society policy. Please share payment confirmation with the society office after NEFT, RTGS, IMPS, UPI, or cheque payment.`,
        ],
        style: 'terms',
      },
      {
        columns: [
          {
            text: [
              `${due.society_name}\n`,
              due.registration_number ? `Registration No: ${due.registration_number}\n` : '',
              'Authorised Signatory',
            ],
            style: 'signature',
          },
          {
            text: 'This is a computer-generated bill and does not require a physical signature.',
            style: 'footerNote',
            alignment: 'right',
          },
        ],
        columnGap: 16,
        margin: [0, 20, 0, 0],
      },
    ]
  }

  const buildDgBillNoticeSection = async (): Promise<Record<string, unknown>[]> => {
    if (dgCharges.length === 0) {
      return []
    }

    const primaryCharge = dgCharges[0]!
    const openingReading = primaryCharge.openingReading ?? null
    const closingReading = primaryCharge.closingReading ?? null
    const consumedUnits = primaryCharge.consumedUnits
      ?? (openingReading != null && closingReading != null
        ? Math.max(0, closingReading - openingReading)
        : null)
    const ratePerUnit = primaryCharge.ratePerUnit
      ?? (consumedUnits && consumedUnits > 0 ? roundBillMoney(dgAmount / consumedUnits) : null)
    const previousDgOutstanding = roundBillMoney(
      dgCharges.reduce((sum, charge) => sum + Number(charge.previousOutstanding ?? 0), 0),
    )
    const dgInterestAmount = roundBillMoney(
      dgCharges.reduce((sum, charge) => sum + Number(charge.interestAmount ?? 0), 0),
    )
    const dgNetPayable = roundBillMoney(dgAmount + previousDgOutstanding + dgInterestAmount)
    const tariffRateLabel = primaryCharge.tariffRateLabel
      ?? (ratePerUnit != null ? `Rs.${formatBillPlainNumber(ratePerUnit)}/Unit` : '-')
    const qrPayload = buildUpiPaymentPayload(due, dgNetPayable, `${bill.billNumber}-DG`)
    const qrImage = qrPayload
      ? await QRCode.toDataURL(qrPayload, { margin: 1, width: 180 })
      : null

    const optionalNumber = (value: number | null | undefined) =>
      value == null ? '-' : formatBillPlainNumber(value)

    const bankDetails = [
      `${due.bank_name ?? 'BANK'} A/C NO -- ${due.account_number ?? '-'}`,
      `Branch Address -- ${due.branch_name ?? '-'}`,
      `IFSC CODE: -- ${due.ifsc_code ?? '-'}`,
      due.upi_id ? `UPI ID: -- ${due.upi_id}` : '',
    ].filter(Boolean).join('\n')

    const addressParts = (due.society_address || '')
      .split(',')
      .map((part) => part.trim())
      .filter(Boolean)
    const headerAddressLine = addressParts.length > 2
      ? addressParts.slice(0, -2).join(', ')
      : (due.society_address || '-')
    const headerCityLine = addressParts.length > 2
      ? addressParts.slice(-2).join(', ')
      : ''
    const dgPeriodText = `${formatDgBillDate(due.period_start_date)} to ${formatDgBillDate(due.period_end_date)}`
    const paymentContact = due.contact_phone ?? due.billing_contact_mobile ?? 'society office'

    return [
      {
        table: {
          widths: ['*'],
          body: [
            [
              {
                stack: [
                  {
                    table: {
                      widths: ['*'],
                      heights: [14, 14, 14, 13, 13, 13, 16],
                      body: [
                        [{ text: due.society_name.toUpperCase(), style: 'dgBrand', alignment: 'center', fillColor: '#bfbfbf' }],
                        [{ text: headerAddressLine, style: 'dgBrandSub', alignment: 'center', fillColor: '#bfbfbf' }],
                        [{ text: headerCityLine, style: 'dgBrandSub', alignment: 'center', fillColor: '#bfbfbf' }],
                        [{ text: '', style: 'dgHeaderBlank', fillColor: '#bfbfbf' }],
                        [{ text: '', style: 'dgHeaderBlank', fillColor: '#bfbfbf' }],
                        [{ text: '', style: 'dgHeaderBlank', fillColor: '#bfbfbf' }],
                        [{ text: 'BILL CUM NOTICE', style: 'dgNoticeTitle', alignment: 'center', fillColor: '#d9d9d9' }],
                      ],
                    },
                    layout: dgDenseGridLayout,
                  },
                  {
                    table: {
                      widths: ['14%', '36%', '18%', '32%'],
                      body: [
                        [
                          { text: 'Flat No.:', style: 'dgLabel' },
                          { text: compactFlatNumber, style: 'dgValueBold' },
                          { text: 'LAST DATE TO PAY :', style: 'dgLabel' },
                          { text: formatDgBillDate(due.due_date), style: 'dgValueBold' },
                        ],
                        [
                          { text: 'Address:', style: 'dgLabel' },
                          { text: due.society_address || '-', style: 'dgValue' },
                          { text: 'Dated -', style: 'dgLabel' },
                          { text: formatDgBillDate(due.generated_at), style: 'dgValue' },
                        ],
                        [
                          { text: 'PHONE:', style: 'dgLabel' },
                          { text: due.billing_contact_mobile ?? due.contact_phone ?? '-', style: 'dgValue' },
                          { text: 'PERIOD:', style: 'dgLabel' },
                          { text: dgPeriodText, style: 'dgValueBold' },
                        ],
                        [
                          { text: 'EMAIL ID:', style: 'dgLabel' },
                          { text: due.billing_contact_email ?? due.contact_email ?? '-', style: 'dgValue' },
                          { text: 'CONNECTION LOAD:', style: 'dgLabel' },
                          { text: primaryCharge.connectionLoad ?? '4 KW (5KVA)', style: 'dgValueBold' },
                        ],
                      ],
                    },
                    layout: dgDenseGridLayout,
                  },
                  {
                    table: {
                      widths: ['70%', '14%', '16%'],
                      body: [
                        [
                          { text: `STATE: ${primaryCharge.state ?? 'PUNJAB'}`, style: 'dgLabel' },
                          { text: 'STATE CODE:', style: 'dgLabel' },
                          { text: primaryCharge.stateCode ?? '03', style: 'dgValueBold' },
                        ],
                      ],
                    },
                    layout: dgDenseGridLayout,
                  },
                  {
                    table: {
                      widths: ['18%', '14%', '16%', '16%', '14%', '22%'],
                      body: [
                        [
                          { text: 'ELECTRICITY TYPE', style: 'dgTableHeader' },
                          { text: 'MTR NO.', style: 'dgTableHeader' },
                          { text: 'OPENING', style: 'dgTableHeaderRight' },
                          { text: 'CLOSING', style: 'dgTableHeaderRight' },
                          { text: 'CON', style: 'dgTableHeaderRight' },
                          { text: 'TARIFF RATE PER UNIT', style: 'dgTableHeaderRight' },
                        ],
                        [
                          { text: primaryCharge.electricityType ?? 'POWER BACK UP', style: 'dgValueBold' },
                          { text: primaryCharge.meterNo ?? '-', style: 'dgValue' },
                          { text: optionalNumber(openingReading), style: 'dgValueRight' },
                          { text: optionalNumber(closingReading), style: 'dgValueRight' },
                          { text: optionalNumber(consumedUnits), style: 'dgValueRight' },
                          { text: tariffRateLabel, style: 'dgValueRight' },
                        ],
                      ],
                    },
                    layout: dgDenseGridLayout,
                  },
                  {
                    table: {
                      widths: ['*', '16%', '18%', '18%'],
                      body: [
                        [
                          { text: 'DESCRIPTION', style: 'dgTableHeader' },
                          { text: 'UNITS(KWH)', style: 'dgTableHeaderRight' },
                          { text: 'RATE', style: 'dgTableHeaderRight' },
                          { text: 'AMOUNT (Rs.)', style: 'dgTableHeaderRight' },
                        ],
                        [
                          { text: 'POWER BACK UP CHARGES', style: 'dgValueBold' },
                          { text: optionalNumber(consumedUnits), style: 'dgValueRight' },
                          { text: tariffRateLabel, style: 'dgValueRight' },
                          { text: formatBillPlainNumber(dgAmount), style: 'dgValueRight' },
                        ],
                        [
                          { text: 'PREVIOUS OUTSTANDING BALANCE', style: 'dgValueBold' },
                          { text: '', style: 'dgValueRight' },
                          { text: '', style: 'dgValueRight' },
                          { text: formatBillPlainNumber(previousDgOutstanding), style: 'dgValueRight' },
                        ],
                        [
                          { text: 'Interest @1.5% on previous outstanding', style: 'dgValueBold' },
                          { text: '', style: 'dgValueRight' },
                          { text: '', style: 'dgValueRight' },
                          { text: formatBillPlainNumber(dgInterestAmount), style: 'dgValueRight' },
                        ],
                        [
                          { text: 'NET AMOUNT PAYABLE', style: 'dgTotalLabel', colSpan: 3 },
                          {},
                          {},
                          { text: formatBillPlainNumber(dgNetPayable), style: 'dgTotalValue' },
                        ],
                      ],
                    },
                    layout: dgDenseGridLayout,
                  },
                  {
                    stack: [
                      {
                        text: [
                          { text: 'TERMS & CONDITION: -\n', bold: true, italics: true },
                          `In-case the user fails to pay the bill on or before due date indicated in bill, this will be deemed to be a notice and maintenance services to the user shall without prejudice to the right of ${due.society_name} management to recover such charges as of the bill by suit, be disconnected after the expiry of ten days of the due date mentioned in the bill without any further notice to the user. Services shall not be resume unless until the amount shown in the bill together with late fee for the billing period not paid by user.\n\n`,
                          'A charge of Rs. 1000/- shall be levied in case of every dishonoured Cheque.\n',
                          `Payment will be accepted by Account payee Cheque/Draft only in favour of "${due.account_name ?? due.society_name}"\n`,
                          'Payment can be made by Cash/IMPS/NEFT/RTGS/QR Scanner at the following: -',
                        ],
                        style: 'dgTerms',
                      },
                      {
                        columns: [
                          {
                            width: '*',
                            text: bankDetails,
                            style: 'dgBankDetails',
                          },
                          qrImage
                            ? {
                                width: 92,
                                image: qrImage,
                                fit: [88, 88],
                                alignment: 'center',
                              }
                            : {
                                width: 92,
                                table: {
                                  widths: ['*'],
                                  heights: [82],
                                  body: [[{ text: 'QR', style: 'dgQrFallback', alignment: 'center' }]],
                                },
                                layout: dgDenseGridLayout,
                              },
                        ],
                        columnGap: 12,
                        margin: [10, 2, 36, 0],
                      },
                      {
                        text: `*In case of NEFT/RTGS or direct deposit by Cheque etc., please send payment information on ${paymentContact}, to update your payment information in record.`,
                        style: 'dgSmallNote',
                        margin: [0, 3, 0, 5],
                      },
                      {
                        columns: [
                          {
                            width: 66,
                            stack: [
                              {
                                canvas: [
                                  {
                                    type: 'ellipse',
                                    x: 27,
                                    y: 18,
                                    r1: 23,
                                    r2: 16,
                                    lineColor: '#2563eb',
                                    lineWidth: 1,
                                  },
                                ],
                              },
                            ],
                          },
                          {
                            width: '*',
                            text: [
                              `${due.society_name.toUpperCase()}\n\n`,
                              'AUTHORISED SIGNATORY\n',
                              '(This is Computer Generated Invoice hence does not Require Signature)',
                            ],
                            style: 'dgSignature',
                          },
                        ],
                        columnGap: 4,
                      },
                    ],
                    margin: [4, 6, 4, 4],
                  },
                ],
              },
            ],
          ],
        },
        layout: dgOuterLayout,
      },
    ]
  }

  const content: Record<string, unknown>[] = [
    ...buildMaintenanceInvoiceSection(),
  ]
  const dgSection = await buildDgBillNoticeSection()

  if (dgSection.length > 0) {
    if (content.length > 0 && dgSection[0]) {
      dgSection[0].pageBreak = 'before'
    }
    content.push(...dgSection)
  }

  const docDefinition = {
    pageMargins: [20, 18, 20, 18],
    content,
    styles: {
      brand: { fontSize: 13, color: '#111827', bold: true },
      noticeTitle: { fontSize: 10, color: '#111827', bold: true, fillColor: '#e5e7eb' },
      subtle: { fontSize: 8, color: '#4b5563' },
      labelCell: { bold: true, fontSize: 8, color: '#111827', margin: [2, 3, 2, 3] },
      valueCell: { fontSize: 8, color: '#111827', margin: [2, 3, 2, 3] },
      valueCellBold: { fontSize: 8, color: '#111827', bold: true, margin: [2, 3, 2, 3] },
      tableHeader: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#374151', margin: [2, 3, 2, 3] },
      tableHeaderRight: { bold: true, fontSize: 8, color: '#ffffff', fillColor: '#374151', alignment: 'right', margin: [2, 3, 2, 3] },
      tableCell: { fontSize: 8, color: '#111827', margin: [2, 4, 2, 4] },
      tableCellRight: { fontSize: 8, color: '#111827', alignment: 'right', margin: [2, 4, 2, 4] },
      summaryLabel: { fontSize: 8, color: '#111827', margin: [2, 3, 2, 3] },
      summaryValue: { fontSize: 8, color: '#111827', alignment: 'right', margin: [2, 3, 2, 3] },
      summaryTotalLabel: { fontSize: 9, color: '#111827', bold: true, fillColor: '#f3f4f6', margin: [2, 4, 2, 4] },
      summaryTotalValue: { fontSize: 9, color: '#111827', bold: true, alignment: 'right', fillColor: '#f3f4f6', margin: [2, 4, 2, 4] },
      terms: { fontSize: 8, color: '#111827', italics: true, margin: [0, 4, 0, 0] },
      signature: { fontSize: 8, color: '#111827', bold: true },
      footerNote: { fontSize: 7, color: '#4b5563', italics: true },
      dgBrand: { fontSize: 11, color: '#111827', bold: true, margin: [2, 1.5, 2, 1] },
      dgBrandSub: { fontSize: 8.2, color: '#111827', bold: true, margin: [2, 1, 2, 1] },
      dgHeaderBlank: { fontSize: 4, color: '#111827', margin: [0, 0, 0, 0] },
      dgNoticeTitle: { fontSize: 8.5, color: '#111827', bold: true, margin: [2, 2, 2, 2] },
      dgLabel: { bold: true, fontSize: 6.3, color: '#111827', margin: [1, 1.4, 1, 1.4] },
      dgValue: { fontSize: 6.3, color: '#111827', margin: [1, 1.4, 1, 1.4] },
      dgValueBold: { fontSize: 6.3, color: '#111827', bold: true, margin: [1, 1.4, 1, 1.4] },
      dgValueRight: { fontSize: 6.3, color: '#111827', alignment: 'right', margin: [1, 1.4, 1, 1.4] },
      dgTableHeader: { bold: true, fontSize: 6, color: '#111827', fillColor: '#efefef', margin: [1, 1.4, 1, 1.4] },
      dgTableHeaderRight: { bold: true, fontSize: 6, color: '#111827', fillColor: '#efefef', alignment: 'right', margin: [1, 1.4, 1, 1.4] },
      dgTotalLabel: { bold: true, fontSize: 7, color: '#111827', fillColor: '#f7f7f7', margin: [1, 2, 1, 2] },
      dgTotalValue: { bold: true, fontSize: 8.5, color: '#111827', fillColor: '#f7f7f7', alignment: 'right', margin: [1, 2, 1, 2] },
      dgTerms: { fontSize: 6.2, color: '#111827', italics: true, lineHeight: 1.04 },
      dgBankDetails: { fontSize: 6.4, color: '#111827', bold: true, lineHeight: 1.2, margin: [0, 0, 0, 0] },
      dgQrFallback: { fontSize: 7, color: '#4b5563', margin: [2, 32, 2, 32] },
      dgSmallNote: { fontSize: 6.1, color: '#111827', italics: true },
      dgSignature: { fontSize: 6.4, color: '#111827', bold: true },
    },
    defaultStyle: { font: 'Roboto' },
  }

  const buffer = await new Promise<Buffer>((resolve, reject) => {
    pdfMake.createPdf(docDefinition).getBuffer((pdfBuffer: Buffer) => {
      try {
        resolve(Buffer.from(pdfBuffer))
      } catch (error) {
        reject(error)
      }
    })
  })

  return {
    buffer,
    billNumber: bill.billNumber,
    fileName: `${bill.billNumber}.pdf`,
    totalPayable: netPayable,
    dueId: due.id,
    flatLabel,
    billingPeriodLabel: due.billing_period_label,
  }
}
