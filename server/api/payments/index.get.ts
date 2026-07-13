import { createApiSuccess, getPaginationParams } from '~/server/utils/api'
import { requireActiveUser } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'
import { getQuerySafe } from '~/server/utils/master-data'
import { createPaginatedResult } from '~/shared/api'

type PaymentCamAdvanceMatchRow = {
  id: string
  flatId: string
  flatNumber: string
  blockName: string
  primaryResidentName: string | null
  coveredFrom: string
  coveredUntil: string
  amount: string | null
  source: string
  reference: string | null
  notes: string | null
}

type PaymentSummaryRow = {
  id: string
  recordType: 'PAYMENT'
  paymentDate: string
  amount: string
  mode: string
  transferKind: string | null
  status: string
  payerUserId: string | null
  flatId: string | null
  utrReference: string | null
  bankReference: string | null
  proofFilePath: string | null
  receiptNumber: string | null
  receiptFilePath: string | null
  createdAt: string
  flatNumber: string | null
  blockName: string | null
  payerName: string | null
  camAdvanceCoverageId: null
  coveredFrom: null
  coveredUntil: null
}

type PaymentListRow = PaymentSummaryRow | {
  id: string
  recordType: 'CAM_ADVANCE'
  paymentDate: string
  amount: string
  mode: 'CAM_ADVANCE'
  transferKind: string | null
  status: string
  payerUserId: null
  flatId: string
  utrReference: string | null
  bankReference: string | null
  proofFilePath: null
  receiptNumber: null
  receiptFilePath: null
  createdAt: string
  flatNumber: string
  blockName: string
  payerName: string | null
  camAdvanceCoverageId: string
  coveredFrom: string
  coveredUntil: string
}

const mapCamAdvanceMatchToPaymentRow = (row: PaymentCamAdvanceMatchRow): PaymentListRow => ({
  id: `cam-advance:${row.id}`,
  recordType: 'CAM_ADVANCE',
  paymentDate: row.coveredFrom,
  amount: row.amount ?? '0',
  mode: 'CAM_ADVANCE',
  transferKind: row.source,
  status: row.source === 'PAYMENT' ? 'PAID' : 'ACTIVE',
  payerUserId: null,
  flatId: row.flatId,
  utrReference: row.reference,
  bankReference: row.notes,
  proofFilePath: null,
  receiptNumber: null,
  receiptFilePath: null,
  createdAt: row.coveredFrom,
  flatNumber: row.flatNumber,
  blockName: row.blockName,
  payerName: row.primaryResidentName,
  camAdvanceCoverageId: row.id,
  coveredFrom: row.coveredFrom,
  coveredUntil: row.coveredUntil,
})

const loadPaymentCamAdvanceMatches = async (
  societyId: string,
  query: Record<string, unknown>,
) => {
  const conditions = ['cac.society_id = $1', 'cac.is_active = true']
  const params: unknown[] = [societyId]

  if (query.flatId) {
    params.push(String(query.flatId))
    conditions.push(`cac.flat_id = $${params.length}`)
  }

  const searchTerm = String(query.search ?? query.reference ?? '').trim().toLowerCase()
  if (searchTerm) {
    const normalizedSearch = searchTerm.replace(/[^a-z0-9]/g, '')
    params.push(`%${searchTerm}%`)
    const searchParamIndex = params.length
    const normalizedFlatSearchSql = normalizedSearch
      ? (() => {
          params.push(`%${normalizedSearch}%`)
          return `
            or regexp_replace(lower(concat_ws('', b.name, f.flat_number)), '[^a-z0-9]', '', 'g') like $${params.length}
          `
        })()
      : ''

    conditions.push(`
      (
        lower(coalesce(f.flat_number, '')) like $${searchParamIndex}
        or lower(coalesce(b.name, '')) like $${searchParamIndex}
        or lower(concat_ws(' ', b.name, f.flat_number)) like $${searchParamIndex}
        or lower(concat_ws('-', b.name, f.flat_number)) like $${searchParamIndex}
        ${normalizedFlatSearchSql}
        or lower(coalesce(u.full_name, '')) like $${searchParamIndex}
        or lower(coalesce(cac.reference, '')) like $${searchParamIndex}
        or lower(coalesce(cac.notes, '')) like $${searchParamIndex}
        or lower(coalesce(cac.source, '')) like $${searchParamIndex}
      )
    `)
  }

  if (!query.flatId && !searchTerm) {
    return []
  }

  if (query.fromDate) {
    params.push(String(query.fromDate))
    conditions.push(`cac.covered_until >= $${params.length}::date`)
  }

  if (query.toDate) {
    params.push(String(query.toDate))
    conditions.push(`cac.covered_from <= $${params.length}::date`)
  }

  if (query.minAmount) {
    params.push(String(query.minAmount))
    conditions.push(`coalesce(cac.amount, 0) >= $${params.length}`)
  }

  if (query.maxAmount) {
    params.push(String(query.maxAmount))
    conditions.push(`coalesce(cac.amount, 0) <= $${params.length}`)
  }

  const result = await queryRows<PaymentCamAdvanceMatchRow>(
    `
      select
        cac.id,
        cac.flat_id as "flatId",
        f.flat_number as "flatNumber",
        b.name as "blockName",
        u.full_name as "primaryResidentName",
        cac.covered_from::text as "coveredFrom",
        cac.covered_until::text as "coveredUntil",
        cac.amount::text,
        cac.source,
        cac.reference,
        cac.notes
      from cam_advance_coverages cac
      inner join flats f on f.id = cac.flat_id
      inner join blocks b on b.id = f.block_id
      left join lateral (
        select u.full_name
        from flat_residents fr
        inner join users u on u.id = fr.user_id
        where fr.flat_id = f.id
          and fr.is_active = true
          and fr.is_billing_contact = true
        limit 1
      ) u on true
      where ${conditions.join(' and ')}
      order by cac.covered_until desc, cac.updated_at desc
      limit 50
    `,
    params,
  )

  return result.rows
}

export default defineEventHandler(async (event) => {
  const authMe = await requireActiveUser(event)
  const query = getQuerySafe(event)
  const pagination = getPaginationParams(query)
  const offset = (pagination.page - 1) * pagination.pageSize
  const isStaff = ['ADMIN', 'MANAGER'].includes(authMe.user.role)

  const conditions = [`p.society_id = $1`]
  const params: unknown[] = [authMe.user.societyId]

  if (!isStaff) {
    params.push(authMe.user.id)
    conditions.push(`p.payer_user_id = $${params.length}`)
  }

  for (const [key, column] of [
    ['flatId', 'p.received_for_flat_id'],
    ['status', 'p.status'],
    ['mode', 'p.mode'],
  ] as const) {
    if (query[key]) {
      params.push(String(query[key]))
      conditions.push(`${column} = $${params.length}`)
    }
  }

  const payerUserId = String(query.payerUserId ?? query.residentId ?? '')
  if (isStaff && payerUserId) {
    params.push(payerUserId)
    conditions.push(`p.payer_user_id = $${params.length}`)
  }

  const billingPeriodId = String(query.billingPeriodId ?? query.periodId ?? '')
  if (billingPeriodId) {
    params.push(billingPeriodId)
    conditions.push(`
      exists (
        select 1
        from payment_allocations pa_filter
        join maintenance_dues md_filter on md_filter.id = pa_filter.maintenance_due_id
        where pa_filter.payment_id = p.id
          and md_filter.billing_period_id = $${params.length}
      )
    `)
  }

  const receiptState = String(query.receipt ?? query.receiptState ?? '')
  if (receiptState === 'with') {
    conditions.push(`p.receipt_number is not null`)
  } else if (receiptState === 'missing') {
    conditions.push(`p.receipt_number is null`)
  }

  const proofState = String(query.proof ?? query.proofState ?? '')
  if (proofState === 'with') {
    conditions.push(`p.proof_file_path is not null`)
  } else if (proofState === 'missing') {
    conditions.push(`p.proof_file_path is null`)
  }

  if (query.reference) {
    params.push(`%${String(query.reference).toLowerCase()}%`)
    conditions.push(
      `(lower(coalesce(p.utr_reference, '')) like $${params.length} or lower(coalesce(p.bank_reference, '')) like $${params.length} or lower(coalesce(p.receipt_number, '')) like $${params.length})`,
    )
  }

  if (query.search) {
    const search = String(query.search).trim().toLowerCase()
    const normalizedSearch = search.replace(/[^a-z0-9]/g, '')
    params.push(`%${search}%`)
    const searchParamIndex = params.length
    const normalizedFlatSearchSql = normalizedSearch
      ? (() => {
          params.push(`%${normalizedSearch}%`)
          return `
            or regexp_replace(lower(concat_ws('', b.name, f.flat_number)), '[^a-z0-9]', '', 'g') like $${params.length}
          `
        })()
      : ''
    conditions.push(
      `(
        lower(coalesce(u.full_name, '')) like $${searchParamIndex}
        or lower(coalesce(f.flat_number, '')) like $${searchParamIndex}
        or lower(coalesce(b.name, '')) like $${searchParamIndex}
        or lower(concat_ws(' ', b.name, f.flat_number)) like $${searchParamIndex}
        or lower(concat_ws('-', b.name, f.flat_number)) like $${searchParamIndex}
        ${normalizedFlatSearchSql}
        or lower(coalesce(p.utr_reference, '')) like $${searchParamIndex}
        or lower(coalesce(p.bank_reference, '')) like $${searchParamIndex}
        or lower(coalesce(p.receipt_number, '')) like $${searchParamIndex}
      )`,
    )
  }

  if (query.fromDate) {
    params.push(String(query.fromDate))
    conditions.push(`p.payment_date >= $${params.length}`)
  }

  if (query.toDate) {
    params.push(String(query.toDate))
    conditions.push(`p.payment_date <= $${params.length}`)
  }

  if (query.minAmount) {
    params.push(String(query.minAmount))
    conditions.push(`p.amount >= $${params.length}`)
  }

  if (query.maxAmount) {
    params.push(String(query.maxAmount))
    conditions.push(`p.amount <= $${params.length}`)
  }

  const where = conditions.length ? `where ${conditions.join(' and ')}` : ''
  const totalResult = await queryRows<{ count: string }>(
    `
      select count(*)::text as count
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      left join users u on u.id = p.payer_user_id
      ${where}
    `,
    params,
  )
  params.push(pagination.pageSize, offset)
  const rows = await queryRows<PaymentSummaryRow>(
    `
      select
        p.id,
        'PAYMENT'::text as "recordType",
        p.payment_date::text as "paymentDate",
        p.amount::text,
        p.mode,
        p.transfer_kind as "transferKind",
        p.status,
        p.payer_user_id as "payerUserId",
        p.received_for_flat_id as "flatId",
        p.utr_reference as "utrReference",
        p.bank_reference as "bankReference",
        p.proof_file_path as "proofFilePath",
        p.receipt_number as "receiptNumber",
        p.receipt_file_path as "receiptFilePath",
        p.created_at as "createdAt",
        f.flat_number as "flatNumber",
        b.name as "blockName",
        u.full_name as "payerName",
        null::text as "camAdvanceCoverageId",
        null::text as "coveredFrom",
        null::text as "coveredUntil"
      from payments p
      left join flats f on f.id = p.received_for_flat_id
      left join blocks b on b.id = f.block_id
      left join users u on u.id = p.payer_user_id
      ${where}
      order by p.payment_date desc, p.created_at desc
      limit $${params.length - 1} offset $${params.length}
    `,
    params,
  )

  const camAdvanceMatches = isStaff
    ? await loadPaymentCamAdvanceMatches(authMe.user.societyId, query)
    : []
  const camAdvanceRows = camAdvanceMatches.map(mapCamAdvanceMatchToPaymentRow)
  const paymentTotal = Number(totalResult.rows[0]?.count ?? 0)
  const items: PaymentListRow[] = [...rows.rows, ...camAdvanceRows]

  return createApiSuccess(event, {
    ...createPaginatedResult(items, paymentTotal + camAdvanceRows.length, pagination),
    camAdvanceMatches,
  })
})
