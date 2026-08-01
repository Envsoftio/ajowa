import assert from 'node:assert/strict'
import test from 'node:test'
import {
  resolveBillPdfAmountAllocation,
  resolveDgBillAmountSummary,
} from '../server/utils/dg-bill-amounts.ts'

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
    previousReferenceAmount: 200,
    interestAmount: 30,
    lateFeeAmount: 20,
    paidAmount: 300,
    waivedAmount: 50,
    balanceAmount: 700,
  })

  assert.deepEqual(summary, {
    currentChargeAmount: 1_000,
    previousReferenceAmount: 200,
    interestAmount: 30,
    lateFeeAmount: 20,
    grossAmount: 1_050,
    paidOrAdvanceAmount: 300,
    waivedAmount: 50,
    netPayable: 700,
  })
  assert.equal(
    summary.grossAmount - summary.paidOrAdvanceAmount - summary.waivedAmount,
    summary.netPayable,
  )
})

test('uses the persisted due balance after a full advance payment', () => {
  const allocation = resolveBillPdfAmountAllocation({
    hasDgSection: true,
    maintenanceSectionTotal: null,
    mixedDgComponentAmount: 900,
    currentDueBalanceAmount: 0,
    previousOutstandingAmount: 100,
  })
  const summary = resolveDgBillAmountSummary({
    currentChargeAmount: 900,
    previousReferenceAmount: 100,
    interestAmount: 0,
    lateFeeAmount: 0,
    paidAmount: 900,
    waivedAmount: 0,
    balanceAmount: allocation.dgSectionBalanceAmount ?? 0,
  })

  assert.equal(allocation.totalPayable, 0)
  assert.equal(summary.grossAmount, 900)
  assert.equal(summary.paidOrAdvanceAmount, 900)
  assert.equal(summary.netPayable, 0)
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

test('rounds DG bill figures to paise and guards invalid negative display values', () => {
  const summary = resolveDgBillAmountSummary({
    currentChargeAmount: 100.005,
    previousReferenceAmount: 10.004,
    interestAmount: Number.NaN,
    lateFeeAmount: -10,
    paidAmount: 20.005,
    waivedAmount: -1,
    balanceAmount: 80.004,
  })

  assert.deepEqual(summary, {
    currentChargeAmount: 100.01,
    previousReferenceAmount: 10,
    interestAmount: 0,
    lateFeeAmount: 0,
    grossAmount: 100.01,
    paidOrAdvanceAmount: 20.01,
    waivedAmount: 0,
    netPayable: 80,
  })
})
