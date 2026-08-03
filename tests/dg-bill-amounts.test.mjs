import assert from 'node:assert/strict'
import test from 'node:test'
import {
  getDgBillCurrentChargeLabel,
  resolveBillPdfAmountAllocation,
  resolveDgBillAmountSummary,
  resolveDgBillPreviousReferenceAmount,
} from '../server/utils/dg-bill-amounts.ts'

test('labels carried-forward DG PDFs separately from current DG bills', () => {
  assert.equal(
    getDgBillCurrentChargeLabel('DG_OPENING_BALANCE'),
    'CARRIED-FORWARD DG BALANCE',
  )
  assert.equal(
    getDgBillCurrentChargeLabel('GENERATED_BILL'),
    'CURRENT DG SET CHARGES',
  )
})

test('hides a legacy DG reference when a real prior DG balance is payable', () => {
  assert.equal(
    resolveDgBillPreviousReferenceAmount({
      previousOutstandingAmount: 406,
      legacyReferenceAmount: 406,
    }),
    0,
  )
  assert.equal(
    resolveDgBillPreviousReferenceAmount({
      previousOutstandingAmount: 0,
      legacyReferenceAmount: 406,
    }),
    406,
  )
})

test('keeps the existing pure CAM PDF total unchanged', () => {
  const allocation = resolveBillPdfAmountAllocation({
    hasDgSection: false,
    maintenanceSectionTotal: 1_275.55,
    mixedDgComponentAmount: 0,
    currentDueBalanceAmount: 1_100,
    previousOutstandingAmount: 175.55,
  })

  assert.deepEqual(allocation, {
    dgSectionBalanceAmount: null,
    totalPayable: 1_275.55,
  })
})

test('shows the previous DG amount for reference without adding it to payable', () => {
  const summary = resolveDgBillAmountSummary({
    currentChargeAmount: 1_000,
    previousOutstandingAmount: 0,
    previousReferenceAmount: 200,
    interestAmount: 30,
    lateFeeAmount: 20,
    paidAmount: 300,
    advanceAppliedAmount: 100,
    availableAdvanceAmount: 425,
    waivedAmount: 50,
    balanceAmount: 700,
  })

  assert.deepEqual(summary, {
    currentChargeAmount: 1_000,
    previousOutstandingAmount: 0,
    previousReferenceAmount: 200,
    interestAmount: 30,
    lateFeeAmount: 20,
    grossAmount: 1_050,
    cashPaidAmount: 200,
    advanceAppliedAmount: 100,
    availableAdvanceAmount: 425,
    paidOrAdvanceAmount: 300,
    waivedAmount: 50,
    netPayable: 700,
  })
  assert.equal(
    summary.grossAmount - summary.paidOrAdvanceAmount - summary.waivedAmount,
    summary.netPayable,
  )
  assert.equal(summary.netPayable, 700, 'unused advance must remain informational')
})

test('adds earlier DG outstanding after a full current-bill advance payment', () => {
  const allocation = resolveBillPdfAmountAllocation({
    hasDgSection: true,
    maintenanceSectionTotal: null,
    mixedDgComponentAmount: 900,
    currentDueBalanceAmount: 0,
    previousOutstandingAmount: 100,
  })
  const summary = resolveDgBillAmountSummary({
    currentChargeAmount: 900,
    previousOutstandingAmount: 100,
    previousReferenceAmount: 0,
    interestAmount: 0,
    lateFeeAmount: 0,
    paidAmount: 900,
    advanceAppliedAmount: 900,
    waivedAmount: 0,
    balanceAmount: allocation.dgSectionBalanceAmount ?? 0,
  })

  assert.equal(allocation.totalPayable, 100)
  assert.equal(summary.grossAmount, 1_000)
  assert.equal(summary.cashPaidAmount, 0)
  assert.equal(summary.advanceAppliedAmount, 900)
  assert.equal(summary.paidOrAdvanceAmount, 900)
  assert.equal(summary.netPayable, 100)
})

test('adds carried-forward DG balance to the current DG bill PDF payable', () => {
  const allocation = resolveBillPdfAmountAllocation({
    hasDgSection: true,
    maintenanceSectionTotal: null,
    mixedDgComponentAmount: 900,
    currentDueBalanceAmount: 900,
    previousOutstandingAmount: 250,
  })
  const summary = resolveDgBillAmountSummary({
    currentChargeAmount: 900,
    previousOutstandingAmount: 250,
    previousReferenceAmount: 0,
    interestAmount: 0,
    lateFeeAmount: 0,
    paidAmount: 0,
    advanceAppliedAmount: 0,
    waivedAmount: 0,
    balanceAmount: allocation.dgSectionBalanceAmount ?? 0,
  })

  assert.equal(summary.grossAmount, 1_150)
  assert.equal(summary.netPayable, 1_150)
  assert.equal(allocation.totalPayable, 1_150)
})

test('prints a mixed legacy CAM and DG total without duplicating the full due balance', () => {
  const allocation = resolveBillPdfAmountAllocation({
    hasDgSection: true,
    maintenanceSectionTotal: 1_000,
    mixedDgComponentAmount: 250,
    currentDueBalanceAmount: 1_250,
    previousOutstandingAmount: 0,
  })

  assert.deepEqual(allocation, {
    dgSectionBalanceAmount: 250,
    totalPayable: 1_250,
  })
  assert.notEqual(allocation.totalPayable, 2_250)
})

test('keeps prior DG debt in the DG section of a mixed legacy PDF', () => {
  const allocation = resolveBillPdfAmountAllocation({
    hasDgSection: true,
    maintenanceSectionTotal: 1_000,
    mixedDgComponentAmount: 250,
    currentDueBalanceAmount: 1_250,
    previousOutstandingAmount: 406,
  })

  assert.deepEqual(allocation, {
    dgSectionBalanceAmount: 656,
    totalPayable: 1_656,
  })
})

test('rounds DG bill figures to paise and guards invalid negative display values', () => {
  const summary = resolveDgBillAmountSummary({
    currentChargeAmount: 100.005,
    previousOutstandingAmount: 0,
    previousReferenceAmount: 10.004,
    interestAmount: Number.NaN,
    lateFeeAmount: -10,
    paidAmount: 20.005,
    advanceAppliedAmount: 50,
    waivedAmount: -1,
    balanceAmount: 80.004,
  })

  assert.deepEqual(summary, {
    currentChargeAmount: 100.01,
    previousOutstandingAmount: 0,
    previousReferenceAmount: 10,
    interestAmount: 0,
    lateFeeAmount: 0,
    grossAmount: 100.01,
    cashPaidAmount: 0,
    advanceAppliedAmount: 20.01,
    availableAdvanceAmount: 0,
    paidOrAdvanceAmount: 20.01,
    waivedAmount: 0,
    netPayable: 80,
  })
})
