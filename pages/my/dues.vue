<script setup lang="ts">
import type { MaintenanceDue } from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Dues',
})

type DuesResponse = { ok: true; data: MaintenanceDue[] }
type PaymentAvailabilityResponse = { ok: true; data: { enabled: boolean } }
type OnlinePaymentStatus = {
  paymentId: string
  status: string
  attemptStatus: string
  receiptNumber: string | null
  reference: string
  retryAllowed: boolean
  failureCode: string | null
  title: string
  message: string
  pollAfterMs?: number
}
type OnlinePaymentStatusResponse = { ok: true; data: OnlinePaymentStatus }
type ActiveOnlinePayment = {
  paymentId: string
  flatId: string
  flatNumber: string
  amount: string
  reference: string
  gatewayPaid: boolean
}
type ActiveOnlinePaymentsResponse = { ok: true; data: ActiveOnlinePayment[] }
type OnlinePaymentInitiateResponse = {
  ok: true
  data: {
    paymentId: string
    status: string
    accessKey?: string
    merchantKey?: string
    environment?: 'test' | 'prod'
  }
}
type EasebuzzCheckoutInstance = {
  initiatePayment(options: {
    access_key: string
    onResponse: (response: unknown) => void
    theme: string
  }): void
}
type EasebuzzCheckoutConstructor = new (
  merchantKey: string,
  environment: 'test' | 'prod',
) => EasebuzzCheckoutInstance
type DgAdvanceSummaryResponse = {
  ok: true
  data: {
    items: Array<{
      flatId: string
      flatNumber: string
      blockName: string
      availableAmount: number
    }>
    totalAvailable: number
  }
}
type SummaryCardKey = 'balance' | 'total' | 'advance' | 'flats'

const api = useApi()
const authStore = useAuthStore()
const toast = useToast()
const route = useRoute()
const openingStatistics = ref(false)
const isStandaloneHome = ref(false)

const updateStandaloneHome = () => {
  if (!import.meta.client) return
  const iosStandalone =
    (window.navigator as Navigator & { standalone?: boolean }).standalone ===
    true
  isStandaloneHome.value =
    (window.matchMedia('(display-mode: standalone)').matches ||
      iosStandalone) &&
    window.matchMedia('(max-width: 768px)').matches
}

onMounted(() => {
  updateStandaloneHome()
  window.addEventListener('resize', updateStandaloneHome)
})
onUnmounted(() => window.removeEventListener('resize', updateStandaloneHome))

const residentFirstName = computed(
  () => authStore.me?.user.fullName?.trim().split(/\s+/)[0] || 'there',
)
const homeFlatLabel = computed(() => {
  const flats = authStore.me?.flatAccess ?? []
  if (flats.length === 0) return 'Your residence'
  const first = `${flats[0]?.blockName} ${flats[0]?.flatNumber}`
  return flats.length === 1 ? first : `${first} +${flats.length - 1} more`
})
const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const formatDate = (value: string | null | undefined) =>
  value
    ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
        dateStyle: 'medium',
      })
    : '-'

const {
  data: duesData,
  pending,
  refresh: refreshDues,
} = useResidentAsyncData('my-dues', () => api<DuesResponse>('/api/my/dues'))
const { data: paymentAvailabilityData } = useResidentAsyncData(
  'online-payment-availability',
  () => api<PaymentAvailabilityResponse>('/api/payments/online/availability'),
)
const { data: activePaymentsData, refresh: refreshActivePayments } =
  useResidentAsyncData('my-active-online-payments', () =>
    api<ActiveOnlinePaymentsResponse>('/api/payments/online/active'),
  )
const activePayments = computed(() => activePaymentsData.value?.data ?? [])
const activePaymentByFlat = computed(
  () =>
    new Map(activePayments.value.map((payment) => [payment.flatId, payment])),
)
const { data: dgAdvanceData, refresh: refreshDgAdvances } =
  useResidentAsyncData('my-dg-advances', () =>
    api<DgAdvanceSummaryResponse>('/api/my/dg-advances').catch(() => ({
      ok: true as const,
      data: {
        items: [],
        totalAvailable: 0,
      },
    })),
  )

const refresh = async () => {
  void refreshDgAdvances().catch(() => undefined)
  await Promise.all([refreshDues(), refreshActivePayments()])
}

const dues = computed(() => duesData.value?.data ?? [])
const dgAdvanceSummary = computed(
  () =>
    dgAdvanceData.value?.data ?? {
      items: [],
      totalAvailable: 0,
    },
)
const dgAdvanceByFlat = computed(
  () =>
    new Map(
      dgAdvanceSummary.value.items.map((item) => [
        item.flatId,
        item.availableAmount,
      ]),
    ),
)

const isCamDue = (due: MaintenanceDue) => due.billingPeriodChargeType === 'CAM'
const isDgDue = (due: MaintenanceDue) =>
  due.billingPeriodChargeType === 'DG_SET'
const isCarriedForwardDgBalance = (due: MaintenanceDue) =>
  due.origin === 'DG_OPENING_BALANCE'
const dueSourceLabel = (due: MaintenanceDue) => {
  if (isCarriedForwardDgBalance(due)) return 'Carried-forward DG balance'
  if (isDgDue(due)) return 'DG Charges bill'
  return null
}
const hasActionableBalance = (due: MaintenanceDue) =>
  due.balanceAmount > 0 && !due.isCamAdvanceCovered
const hasPaymentChargeType = (due: MaintenanceDue) =>
  due.billingPeriodChargeType === 'GENERAL' ||
  due.billingPeriodChargeType === 'CAM' ||
  due.billingPeriodChargeType === 'DG_SET'
const camAdvanceAdjustmentAmount = (due: MaintenanceDue) =>
  due.chargeBreakdown.reduce((sum, item) => {
    const adjustment = Number(item.camAdvanceAdjustmentAmount ?? 0)
    return Number.isFinite(adjustment) && adjustment > 0
      ? sum + adjustment
      : sum
  }, 0)
const hasCamAdvanceAdjustment = (due: MaintenanceDue) =>
  camAdvanceAdjustmentAmount(due) > 0
const camAdvanceAdjustmentNote = (due: MaintenanceDue) =>
  due.chargeBreakdown.find((item) => item.camAdvanceNote)?.camAdvanceNote ??
  null

const advanceStatusKind = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) return 'covered'
  if (hasCamAdvanceAdjustment(due)) return 'billable'
  if (isDgDue(due) && Number(due.advanceAppliedAmount ?? 0) > 0)
    return 'covered'
  if (isDgDue(due)) return 'billable'
  if (isCamDue(due)) return 'billable'
  return 'not-cam'
}

const advanceStatusLabel = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) return 'Covered'
  if (hasCamAdvanceAdjustment(due)) return 'Advance deducted'
  if (isDgDue(due) && Number(due.advanceAppliedAmount ?? 0) > 0)
    return 'DG advance applied'
  if (isDgDue(due)) return 'No DG advance applied'
  if (isCamDue(due)) return 'Billable'
  return 'Not CAM'
}

const advanceStatusDetail = (due: MaintenanceDue) => {
  if (due.isCamAdvanceCovered) {
    return `Covered ${formatDate(due.camAdvanceCoveredFrom)} to ${formatDate(due.camAdvancePaidUntil)}. No payment is needed for this CAM period.`
  }
  if (hasCamAdvanceAdjustment(due)) {
    const note = camAdvanceAdjustmentNote(due)
    return `${formatMoney(camAdvanceAdjustmentAmount(due))} advance deducted${note ? ` (${note})` : ''}. Remaining due is payable.`
  }
  if (isDgDue(due) && Number(due.advanceAppliedAmount ?? 0) > 0) {
    return `${formatMoney(Number(due.advanceAppliedAmount))} DG advance applied to this bill.`
  }
  if (isDgDue(due)) {
    const available = Number(due.availableDgAdvanceAmount ?? 0)
    return available > 0
      ? `${formatMoney(available)} remains available for future DG bills.`
      : 'No DG advance was applied to this bill.'
  }
  if (isCamDue(due)) return 'No advance coverage for this CAM period.'
  return 'Advance coverage applies only to CAM bills.'
}

const canPayDue = (due: MaintenanceDue) =>
  Boolean(paymentAvailabilityData.value?.data.enabled) &&
  !activePaymentByFlat.value.has(due.flatId) &&
  Boolean(due.canPayNow) &&
  hasPaymentChargeType(due) &&
  hasActionableBalance(due)

const getPayTitle = (due: MaintenanceDue) => {
  if (activePaymentByFlat.value.has(due.flatId))
    return 'An online payment for this flat is being verified. Do not pay again.'
  if (due.isCamAdvanceCovered)
    return 'No payment needed. CAM advance covers this period.'
  if (due.balanceAmount <= 0) return 'No balance pending.'
  if (!due.canPayNow)
    return 'Payment access is limited to the billing contact and society policy.'
  if (!paymentAvailabilityData.value?.data.enabled)
    return 'Online payments are currently unavailable.'
  return 'Pay this due'
}

const payingDueId = ref<string | null>(null)
const paymentReviewDue = ref<MaintenanceDue | null>(null)
const paymentReviewVisible = ref(false)

const reviewPayment = (due: MaintenanceDue) => {
  if (!canPayDue(due) || payingDueId.value) return
  paymentReviewDue.value = due
  paymentReviewVisible.value = true
}

const continueToPayment = () => {
  const due = paymentReviewDue.value
  if (!due) return
  paymentReviewVisible.value = false
  void payDue(due)
}

let checkoutScriptPromise: Promise<EasebuzzCheckoutConstructor> | null = null

const loadEasebuzzCheckout = () => {
  if (!import.meta.client)
    throw new Error('Checkout can be opened only in the browser.')
  const existing = (
    window as typeof window & {
      EasebuzzCheckout?: EasebuzzCheckoutConstructor
    }
  ).EasebuzzCheckout
  if (existing) return Promise.resolve(existing)
  if (checkoutScriptPromise) return checkoutScriptPromise

  checkoutScriptPromise = new Promise((resolve, reject) => {
    const script = document.createElement('script')
    script.src =
      'https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js'
    script.async = true
    script.onload = () => {
      const constructor = (
        window as typeof window & {
          EasebuzzCheckout?: EasebuzzCheckoutConstructor
        }
      ).EasebuzzCheckout
      if (constructor) resolve(constructor)
      else reject(new Error('Easebuzz checkout did not initialize.'))
    }
    script.onerror = () =>
      reject(new Error('Easebuzz checkout could not be loaded.'))
    document.head.appendChild(script)
  })
  return checkoutScriptPromise
}

const showPaymentStatus = async (paymentId: string) => {
  const response = await api<OnlinePaymentStatusResponse>(
    `/api/payments/${paymentId}/status`,
  )
  const status = response.data
  await refreshActivePayments()
  if (status.status === 'VERIFIED') {
    toast.add({
      severity: 'success',
      summary: 'Payment confirmed',
      detail: status.receiptNumber
        ? `Receipt ${status.receiptNumber} is ready.`
        : 'Your payment has been confirmed.',
      life: 7000,
    })
    await refresh()
  } else if (
    ['FAILED', 'CANCELLED'].includes(status.status) &&
    status.retryAllowed
  ) {
    toast.add({
      severity: 'warn',
      summary: status.title,
      detail: `${status.message} Reference: ${status.reference}.`,
      life: 7000,
    })
  } else {
    toast.add({
      severity: 'info',
      summary: status.title,
      detail: `${status.message} Reference: ${status.reference}.`,
      life: 8000,
    })
  }
}

const verifyOnlinePayment = async (paymentId: string) => {
  try {
    await api<OnlinePaymentStatusResponse>('/api/payments/online/verify', {
      method: 'POST',
      body: { paymentId },
      showErrorToast: false,
    })
  } catch {
    // A gateway timeout is an unknown outcome. The durable worker and status
    // endpoint remain the source of truth, so never invite an immediate retry.
  }
  await showPaymentStatus(paymentId)
}

const payDue = async (due: MaintenanceDue) => {
  if (!canPayDue(due) || payingDueId.value) return
  if (!hasPaymentChargeType(due)) return
  payingDueId.value = due.id
  try {
    const response = await api<OnlinePaymentInitiateResponse>(
      '/api/payments/online/initiate',
      {
        method: 'POST',
        showErrorToast: false,
        body: {
          flatId: due.flatId,
          chargeType: due.billingPeriodChargeType,
          amount: due.balanceAmount,
          allocationMode: 'SELECTED_PERIODS',
          selectedDueIds: [due.id],
          idempotencyKey: crypto.randomUUID(),
        },
      },
    )
    const payment = response.data
    if (!payment.accessKey || !payment.merchantKey || !payment.environment) {
      await showPaymentStatus(payment.paymentId)
      return
    }

    const EasebuzzCheckout = await loadEasebuzzCheckout()
    const checkout = new EasebuzzCheckout(
      payment.merchantKey,
      payment.environment,
    )
    checkout.initiatePayment({
      access_key: payment.accessKey,
      theme: '#0645c3',
      onResponse: () => void verifyOnlinePayment(payment.paymentId),
    })
  } catch (error) {
    const fetchError = error as {
      data?: {
        data?: { details?: { paymentId?: unknown } }
        details?: { paymentId?: unknown }
      }
    }
    const errorPayload = fetchError.data?.data ?? fetchError.data
    const blockingPaymentId = errorPayload?.details?.paymentId
    if (typeof blockingPaymentId === 'string') {
      await verifyOnlinePayment(blockingPaymentId)
      return
    }
    toast.add({
      severity: 'error',
      summary: 'Payment could not be started',
      detail: getApiErrorMessage(
        error,
        'Please wait and refresh before trying again.',
      ),
      life: 7000,
    })
  } finally {
    payingDueId.value = null
  }
}

onMounted(() => {
  const callbackPaymentId =
    typeof route.query.paymentId === 'string' ? route.query.paymentId : null
  if (callbackPaymentId) void verifyOnlinePayment(callbackPaymentId)
})

let activePaymentTimer: ReturnType<typeof setInterval> | null = null
onMounted(() => {
  activePaymentTimer = setInterval(() => {
    if (activePayments.value.length > 0) void refresh().catch(() => undefined)
  }, 15000)
})
onUnmounted(() => {
  if (activePaymentTimer) clearInterval(activePaymentTimer)
})

const summary = computed(() => {
  const billRows = dues.value.filter((due) => !due.isAdvanceCoverageRow)
  const totalDue = billRows.reduce((sum, due) => sum + due.totalAmount, 0)
  const totalPaid = billRows.reduce((sum, due) => sum + due.paidAmount, 0)
  const totalBalance = billRows
    .filter((due) => !due.isCamAdvanceCovered)
    .reduce((sum, due) => sum + due.balanceAmount, 0)
  const overdueCount = billRows.filter((due) => due.status === 'OVERDUE').length
  const advanceCoveredCount = dues.value.filter(
    (due) => due.isCamAdvanceCovered,
  ).length

  return {
    totalDue,
    totalPaid,
    totalBalance,
    overdueCount,
    advanceCoveredCount,
  }
})

type HomeBillTab = 'open' | 'history'
const homeBillTab = ref<HomeBillTab>('open')
const visibleBillCount = ref(5)
const billsSection = ref<HTMLElement | null>(null)
const isOpenDue = (due: MaintenanceDue) =>
  !due.isCamAdvanceCovered &&
  !due.isAdvanceCoverageRow &&
  due.balanceAmount > 0 &&
  ['OPEN', 'PARTIALLY_PAID', 'OVERDUE'].includes(due.status)
const openDues = computed(() =>
  dues.value
    .filter(isOpenDue)
    .sort(
      (a, b) =>
        Number(b.status === 'OVERDUE') - Number(a.status === 'OVERDUE') ||
        a.dueDate.localeCompare(b.dueDate),
    ),
)
const nextPayableDue = computed(() => openDues.value.find(canPayDue) ?? null)
const historyDues = computed(() =>
  dues.value
    .filter((due) => !isOpenDue(due))
    .sort((a, b) => b.dueDate.localeCompare(a.dueDate)),
)
const selectedHomeDues = computed(() =>
  homeBillTab.value === 'open' ? openDues.value : historyDues.value,
)
const visibleHomeDues = computed(() =>
  selectedHomeDues.value.slice(0, visibleBillCount.value),
)
const remainingHomeDues = computed(() =>
  Math.max(0, selectedHomeDues.value.length - visibleBillCount.value),
)
const selectHomeBillTab = (tab: HomeBillTab, scroll = false) => {
  if (homeBillTab.value !== tab) {
    homeBillTab.value = tab
    visibleBillCount.value = 5
  }
  if (scroll) {
    nextTick(() =>
      billsSection.value?.scrollIntoView({
        behavior: 'smooth',
        block: 'start',
      }),
    )
  }
}

const activeSummaryHelp = ref<SummaryCardKey | null>(null)
const isSummaryHelpOpen = (key: SummaryCardKey) =>
  activeSummaryHelp.value === key
const toggleSummaryHelp = (key: SummaryCardKey) => {
  activeSummaryHelp.value = isSummaryHelpOpen(key) ? null : key
}
const summaryHelpIds: Record<SummaryCardKey, string> = {
  balance: 'my-dues-summary-help-balance',
  total: 'my-dues-summary-help-total',
  advance: 'my-dues-summary-help-advance',
  flats: 'my-dues-summary-help-flats',
}
const isBalanceHelpOpen = computed(() => isSummaryHelpOpen('balance'))
const isTotalHelpOpen = computed(() => isSummaryHelpOpen('total'))
const isAdvanceHelpOpen = computed(() => isSummaryHelpOpen('advance'))
const isFlatsHelpOpen = computed(() => isSummaryHelpOpen('flats'))
const toggleBalanceHelp = () => toggleSummaryHelp('balance')
const toggleTotalHelp = () => toggleSummaryHelp('total')
const toggleAdvanceHelp = () => toggleSummaryHelp('advance')
const toggleFlatsHelp = () => toggleSummaryHelp('flats')

const flatGroups = computed(() => {
  const groups = new Map<
    string,
    {
      flatId: string
      label: string
      relationshipType: string
      totalBalance: number
      openCount: number
      availableDgAdvance: number
      rows: MaintenanceDue[]
    }
  >()

  for (const due of dues.value) {
    const existing = groups.get(due.flatId)
    if (existing) {
      existing.totalBalance += due.isCamAdvanceCovered ? 0 : due.balanceAmount
      existing.openCount += hasActionableBalance(due) ? 1 : 0
      existing.rows.push(due)
    } else {
      groups.set(due.flatId, {
        flatId: due.flatId,
        label: `${due.blockName} ${due.flatNumber}`,
        relationshipType: due.relationshipType ?? 'RESIDENT',
        totalBalance: due.isCamAdvanceCovered ? 0 : due.balanceAmount,
        openCount: hasActionableBalance(due) ? 1 : 0,
        availableDgAdvance: dgAdvanceByFlat.value.get(due.flatId) ?? 0,
        rows: [due],
      })
    }
  }

  return Array.from(groups.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  )
})
const visibleDueGroups = computed(() =>
  isStandaloneHome.value
    ? visibleHomeDues.value.length
      ? [
          {
            flatId: 'pwa-visible-bills',
            label: '',
            relationshipType: '',
            totalBalance: 0,
            openCount: 0,
            availableDgAdvance: 0,
            rows: visibleHomeDues.value,
          },
        ]
      : []
    : flatGroups.value,
)

const selectedDue = ref<MaintenanceDue | null>(null)
const breakdownVisible = ref(false)

const openBreakdown = (due: MaintenanceDue) => {
  selectedDue.value = due
  breakdownVisible.value = true
}
</script>

<template>
  <div
    class="landing-page resident-home"
    :class="{ 'resident-home--standalone': isStandaloneHome }"
  >
    <template v-if="isStandaloneHome">
      <header class="resident-home__welcome">
        <p class="resident-home__welcome-label">{{ homeFlatLabel }}</p>
        <h1>Hello, {{ residentFirstName }}</h1>
        <p>Here's what's happening at home.</p>
      </header>

      <section
        class="resident-home__balance"
        aria-labelledby="home-balance-title"
      >
        <div class="resident-home__balance-top">
          <span id="home-balance-title">Current balance</span>
          <i class="pi pi-wallet" aria-hidden="true" />
        </div>
        <Skeleton v-if="pending" width="11rem" height="2.5rem" />
        <strong v-else class="resident-home__balance-amount">{{
          formatMoney(summary.totalBalance)
        }}</strong>
        <p v-if="!pending">
          {{
            summary.overdueCount > 0
              ? `${summary.overdueCount} overdue ${summary.overdueCount === 1 ? 'bill' : 'bills'} need attention`
              : summary.totalBalance > 0
                ? 'Review your open bills below'
                : 'Your account is up to date'
          }}
        </p>
        <div
          v-if="!pending && dues.length"
          class="resident-home__balance-actions"
        >
          <button
            v-if="nextPayableDue"
            type="button"
            class="resident-home__balance-button resident-home__balance-button--primary"
            :disabled="Boolean(payingDueId)"
            @click="reviewPayment(nextPayableDue)"
          >
            Pay next bill · {{ formatMoney(nextPayableDue.balanceAmount) }}
            <i class="pi pi-credit-card" aria-hidden="true" />
          </button>
          <button
            v-else
            type="button"
            class="resident-home__balance-button resident-home__balance-button--primary"
            @click="
              selectHomeBillTab(openDues.length ? 'open' : 'history', true)
            "
          >
            {{ openDues.length ? 'View open bills' : 'View bill history' }}
            <i class="pi pi-arrow-right" aria-hidden="true" />
          </button>
          <button
            v-if="nextPayableDue && openDues.length"
            type="button"
            class="resident-home__balance-button resident-home__balance-button--secondary"
            @click="selectHomeBillTab('open', true)"
          >
            Open bills
          </button>
        </div>
      </section>

      <section class="resident-home__mini-summary" aria-label="Account summary">
        <div>
          <span>DG advance</span
          ><strong>{{ formatMoney(dgAdvanceSummary.totalAvailable) }}</strong>
        </div>
        <div>
          <span>Total billed</span
          ><strong>{{ formatMoney(summary.totalDue) }}</strong>
        </div>
        <div>
          <span>Linked flats</span
          ><strong>{{ authStore.me?.flatAccess.length ?? 0 }}</strong>
        </div>
      </section>
    </template>

    <div v-if="!isStandaloneHome" class="surface-grid resident-summary-grid">
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">Current balance</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isBalanceHelpOpen"
            :aria-controls="summaryHelpIds.balance"
            aria-label="Show current balance help"
            @click="toggleBalanceHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ formatMoney(summary.totalBalance) }}</h3>
        <p
          :id="summaryHelpIds.balance"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isBalanceHelpOpen }"
        >
          {{ summary.overdueCount }} overdue bills across linked flats.
          {{ summary.advanceCoveredCount }} CAM advance-covered records are
          already covered.
        </p>
      </section>
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">DG advance available</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isAdvanceHelpOpen"
            :aria-controls="summaryHelpIds.advance"
            aria-label="Show DG advance help"
            @click="toggleAdvanceHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ formatMoney(dgAdvanceSummary.totalAvailable) }}</h3>
        <p
          :id="summaryHelpIds.advance"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isAdvanceHelpOpen }"
        >
          Unused credit reserved for future DG bills. It is not deducted twice
          from an existing bill.
        </p>
      </section>
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">Total due</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isTotalHelpOpen"
            :aria-controls="summaryHelpIds.total"
            aria-label="Show total due help"
            @click="toggleTotalHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ formatMoney(summary.totalDue) }}</h3>
        <p
          :id="summaryHelpIds.total"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isTotalHelpOpen }"
        >
          {{ formatMoney(summary.totalPaid) }} has been collected against these
          dues.
        </p>
      </section>
      <section class="surface-card resident-summary-card">
        <div class="resident-summary-card__topline">
          <p class="eyebrow">Linked flats</p>
          <button
            type="button"
            class="resident-summary-card__help-button"
            :aria-expanded="isFlatsHelpOpen"
            :aria-controls="summaryHelpIds.flats"
            aria-label="Show linked flats help"
            @click="toggleFlatsHelp"
          >
            <i class="pi pi-info-circle" aria-hidden="true" />
          </button>
        </div>
        <h3>{{ authStore.me?.flatAccess.length ?? 0 }}</h3>
        <p
          :id="summaryHelpIds.flats"
          class="resident-summary-card__help-text"
          :class="{ 'is-open': isFlatsHelpOpen }"
        >
          {{
            authStore.me?.flatAccess
              .map((item) => `${item.blockName} ${item.flatNumber}`)
              .join(', ') || 'No active flats'
          }}
        </p>
      </section>
    </div>

    <section class="surface-card resident-service-statistics-link">
      <div class="resident-service-statistics-link__icon" aria-hidden="true">
        <i class="pi pi-chart-bar" />
      </div>
      <div class="resident-service-statistics-link__content">
        <p class="eyebrow">Service transparency</p>
        <h2>Service request statistics</h2>
        <p>
          See opened, resolved, closed, active, overdue, and service-level
          trends across all society tickets.
        </p>
      </div>
      <Button
        :label="openingStatistics ? 'Opening statistics' : 'View statistics'"
        icon="pi pi-arrow-right"
        icon-pos="right"
        :loading="openingStatistics"
        as="router-link"
        to="/my/service-request-statistics"
        aria-label="View service request statistics"
        @click="openingStatistics = true"
      />
    </section>

    <section
      ref="billsSection"
      class="list-page surface-card resident-dues-panel"
    >
      <header class="list-page__header">
        <div>
          <h2 v-if="isStandaloneHome">Bills</h2>
          <h1 v-else>My dues</h1>
          <p>
            Maintenance dues are shown for flats connected to your active
            resident relationships.
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            class="resident-dues-panel__refresh"
            label="Refresh"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            @click="() => refresh()"
          />
        </div>
      </header>

      <section v-if="activePayments.length" class="surface-card" role="status">
        <h2>Online payment in progress</h2>
        <p v-for="payment in activePayments" :key="payment.paymentId">
          <strong
            >{{ payment.flatNumber }} ·
            {{ formatMoney(Number(payment.amount)) }}</strong
          >
          —
          {{
            payment.gatewayPaid
              ? 'Easebuzz confirmed payment. AJOWA is completing the receipt; an administrator can review it.'
              : 'Payment verification is in progress.'
          }}
          Do not pay again. Reference: {{ payment.reference }}.
        </p>
      </section>

      <div
        v-if="isStandaloneHome && !pending && dues.length"
        class="resident-home__bill-tabs"
        role="group"
        aria-label="Bill status"
      >
        <button
          type="button"
          :aria-pressed="homeBillTab === 'open'"
          :class="{ 'is-active': homeBillTab === 'open' }"
          @click="selectHomeBillTab('open')"
        >
          Open <span>{{ openDues.length }}</span>
        </button>
        <button
          type="button"
          :aria-pressed="homeBillTab === 'history'"
          :class="{ 'is-active': homeBillTab === 'history' }"
          @click="selectHomeBillTab('history')"
        >
          History <span>{{ historyDues.length }}</span>
        </button>
      </div>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="dues.length === 0"
        variant="empty"
        title="No dues found"
        message="There are no generated maintenance dues for your linked flats yet."
      />

      <div v-else class="resident-due-groups">
        <AppState
          v-if="isStandaloneHome && selectedHomeDues.length === 0"
          variant="empty"
          :title="homeBillTab === 'open' ? 'No open bills' : 'No bill history'"
          :message="
            homeBillTab === 'open'
              ? 'You are all caught up.'
              : 'Settled and covered bills will appear here.'
          "
        />
        <section
          v-for="group in visibleDueGroups"
          :key="group.flatId"
          class="resident-due-group"
        >
          <header v-if="!isStandaloneHome" class="resident-due-group__header">
            <div>
              <h2>{{ group.label }}</h2>
              <p>
                {{ group.relationshipType }} · {{ group.openCount }} open dues ·
                {{ formatMoney(group.availableDgAdvance) }} DG advance available
              </p>
            </div>
            <strong>{{ formatMoney(group.totalBalance) }}</strong>
          </header>

          <AppDataTable
            :value="group.rows"
            responsive-layout="scroll"
            class="list-page__table"
          >
            <Column field="billingPeriodLabel" header="Period">
              <template #body="{ data: row }">
                <strong>{{ row.billingPeriodLabel }}</strong>
                <p v-if="dueSourceLabel(row)" class="table-muted">
                  {{ dueSourceLabel(row) }}
                </p>
                <p class="table-muted">Due {{ formatDate(row.dueDate) }}</p>
                <p
                  v-if="
                    row.penaltyFreeUntilDate &&
                    row.penaltyFreeUntilDate > row.dueDate
                  "
                  class="table-muted"
                >
                  No late fee through {{ formatDate(row.penaltyFreeUntilDate) }}
                </p>
              </template>
            </Column>
            <Column header="Advance">
              <template #body="{ data: row }">
                <div
                  class="billing-advance-state"
                  :class="`billing-advance-state--${advanceStatusKind(row)}`"
                >
                  <span class="billing-advance-pill">
                    {{ advanceStatusLabel(row) }}
                  </span>
                  <p>{{ advanceStatusDetail(row) }}</p>
                </div>
              </template>
            </Column>
            <Column field="baseAmount" header="Base">
              <template #body="{ data: row }">
                {{ formatMoney(row.baseAmount) }}
              </template>
            </Column>
            <Column field="lateFeeAmount" header="Late fee">
              <template #body="{ data: row }">
                {{ formatMoney(row.lateFeeAmount) }}
              </template>
            </Column>
            <Column field="paidAmount" header="Paid">
              <template #body="{ data: row }">
                {{ formatMoney(row.paidAmount) }}
              </template>
            </Column>
            <Column field="balanceAmount" header="Balance">
              <template #body="{ data: row }">
                <strong>{{ formatMoney(row.balanceAmount) }}</strong>
                <p v-if="hasCamAdvanceAdjustment(row)" class="table-muted">
                  {{ formatMoney(camAdvanceAdjustmentAmount(row)) }} advance
                  deducted
                </p>
              </template>
            </Column>
            <Column field="status" header="Status">
              <template #body="{ data: row }">
                <span
                  v-if="row.isCamAdvanceCovered"
                  class="billing-advance-pill"
                >
                  Covered
                </span>
                <AppStatusBadge v-else :status="row.status" />
              </template>
            </Column>
            <Column header="Actions" style="width: 150px">
              <template #body="{ data: row }">
                <div class="admin-inline-actions">
                  <AppDocumentLink
                    v-if="!row.isAdvanceCoverageRow"
                    :href="`/api/my/dues/${row.id}/bill`"
                    viewer-title="Bill PDF"
                    icon="pi pi-file-pdf"
                    severity="secondary"
                    text
                    rounded
                    aria-label="Open bill PDF"
                    title="Open bill PDF"
                  />
                  <Button
                    icon="pi pi-list"
                    severity="secondary"
                    text
                    rounded
                    aria-label="View charge breakdown"
                    title="View charge breakdown"
                    @click="openBreakdown(row)"
                  />
                  <Button
                    label="Pay"
                    icon="pi pi-credit-card"
                    severity="secondary"
                    outlined
                    size="small"
                    :title="getPayTitle(row)"
                    :disabled="!canPayDue(row) || Boolean(payingDueId)"
                    :loading="payingDueId === row.id"
                    @click="reviewPayment(row)"
                  />
                </div>
              </template>
            </Column>
          </AppDataTable>

          <div class="list-page__cards resident-due-cards">
            <article
              v-for="row in group.rows"
              :key="row.id"
              class="list-card resident-due-card"
              :class="{
                'resident-due-card--history':
                  isStandaloneHome && homeBillTab === 'history',
              }"
            >
              <div class="list-card__header resident-due-card__header">
                <div>
                  <h3>{{ row.billingPeriodLabel }}</h3>
                  <p v-if="isStandaloneHome" class="resident-due-card__flat">
                    {{ row.blockName }} {{ row.flatNumber }}
                  </p>
                  <p v-if="dueSourceLabel(row)">{{ dueSourceLabel(row) }}</p>
                  <p>Due {{ formatDate(row.dueDate) }}</p>
                  <p
                    v-if="
                      row.penaltyFreeUntilDate &&
                      row.penaltyFreeUntilDate > row.dueDate
                    "
                  >
                    No late fee through
                    {{ formatDate(row.penaltyFreeUntilDate) }}
                  </p>
                </div>
                <span
                  v-if="row.isCamAdvanceCovered"
                  class="billing-advance-pill"
                >
                  Covered
                </span>
                <AppStatusBadge v-else :status="row.status" />
              </div>

              <div class="resident-due-card__amount-strip">
                <div
                  class="resident-due-card__amount resident-due-card__amount--balance"
                >
                  <span>{{
                    isStandaloneHome && homeBillTab === 'history'
                      ? 'Amount'
                      : 'Balance'
                  }}</span>
                  <strong>{{
                    formatMoney(
                      isStandaloneHome && homeBillTab === 'history'
                        ? row.totalAmount
                        : row.balanceAmount,
                    )
                  }}</strong>
                  <small v-if="hasCamAdvanceAdjustment(row)">
                    {{ formatMoney(camAdvanceAdjustmentAmount(row)) }} advance
                    deducted
                  </small>
                </div>
                <div class="resident-due-card__amount">
                  <span>Paid</span>
                  <strong>{{ formatMoney(row.paidAmount) }}</strong>
                </div>
              </div>

              <div
                v-if="!isStandaloneHome || advanceStatusKind(row) !== 'not-cam'"
                class="billing-advance-state billing-advance-state--card"
                :class="`billing-advance-state--${advanceStatusKind(row)}`"
              >
                <span class="billing-advance-pill">
                  {{ advanceStatusLabel(row) }}
                </span>
                <p>{{ advanceStatusDetail(row) }}</p>
              </div>

              <div class="resident-due-card__meta-grid">
                <div>
                  <span>Base</span>
                  <strong>{{ formatMoney(row.baseAmount) }}</strong>
                </div>
                <div>
                  <span>Late fee</span>
                  <strong>{{ formatMoney(row.lateFeeAmount) }}</strong>
                </div>
              </div>

              <div
                class="resident-mobile-actions"
                :class="{
                  'resident-mobile-actions--history':
                    isStandaloneHome && homeBillTab === 'history',
                }"
              >
                <AppDocumentLink
                  v-if="!row.isAdvanceCoverageRow"
                  :href="`/api/my/dues/${row.id}/bill`"
                  viewer-title="Bill PDF"
                  label="Bill"
                  icon="pi pi-file-pdf"
                  severity="secondary"
                  outlined
                  size="small"
                />
                <Button
                  label="Breakdown"
                  icon="pi pi-list"
                  severity="secondary"
                  outlined
                  size="small"
                  @click="openBreakdown(row)"
                />
                <Button
                  v-if="!isStandaloneHome || isOpenDue(row)"
                  label="Pay"
                  icon="pi pi-credit-card"
                  severity="secondary"
                  outlined
                  size="small"
                  :title="getPayTitle(row)"
                  :disabled="!canPayDue(row) || Boolean(payingDueId)"
                  :loading="payingDueId === row.id"
                  @click="reviewPayment(row)"
                />
              </div>
            </article>
          </div>
        </section>
        <button
          v-if="isStandaloneHome && remainingHomeDues > 0"
          type="button"
          class="resident-home__show-more"
          @click="visibleBillCount += 5"
        >
          Show more bills <span>{{ remainingHomeDues }} remaining</span>
          <i class="pi pi-chevron-down" aria-hidden="true" />
        </button>
      </div>
    </section>

    <Dialog
      v-model:visible="paymentReviewVisible"
      header="Payment gateway charges"
      modal
      class="p-dialog-custom resident-payment-review"
      :style="{ width: 'min(94vw, 760px)' }"
    >
      <div v-if="paymentReviewDue" class="resident-payment-review__content">
        <p>
          Payment for {{ paymentReviewDue.billingPeriodLabel }} ·
          {{ paymentReviewDue.blockName }} {{ paymentReviewDue.flatNumber }}:
          <strong>{{ formatMoney(paymentReviewDue.balanceAmount) }}</strong>
        </p>
        <p>
          Gateway charges depend on the payment method you select. Please review
          the charges before continuing to Easebuzz.
        </p>
        <div
          class="resident-payment-review__image"
          role="region"
          aria-label="Payment gateway charge rates"
          tabindex="0"
        >
          <img
            src="/images/payment-gateway-charges.jpeg"
            alt="Payment gateway charges for debit cards, UPI, credit cards, netbanking, wallets, international cards, and eNACH"
            width="1280"
            height="1222"
          />
        </div>
        <a
          href="/images/payment-gateway-charges.jpeg"
          target="_blank"
          rel="noopener noreferrer"
        >
          Open full-size charges image
        </a>
        <div class="resident-payment-review__actions">
          <Button
            label="Cancel"
            severity="secondary"
            outlined
            @click="paymentReviewVisible = false"
          />
          <Button
            label="Continue to payment"
            icon="pi pi-arrow-right"
            icon-pos="right"
            @click="continueToPayment"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="breakdownVisible"
      header="Charge breakdown"
      modal
      class="p-dialog-custom"
      :style="{ width: '520px' }"
    >
      <div v-if="selectedDue" class="admin-form-layout">
        <div>
          <h3>{{ selectedDue.billingPeriodLabel }}</h3>
          <p>
            {{ selectedDue.blockName }} {{ selectedDue.flatNumber }} ·
            {{ formatDate(selectedDue.dueDate) }}
          </p>
        </div>
        <AppDataTable
          :value="selectedDue.chargeBreakdown"
          responsive-layout="scroll"
        >
          <Column field="label" header="Charge" />
          <Column field="amount" header="Amount">
            <template #body="{ data: row }">
              {{ formatMoney(row.amount) }}
            </template>
          </Column>
        </AppDataTable>
        <div class="billing-total-line">
          <span>Balance</span>
          <strong>{{ formatMoney(selectedDue.balanceAmount) }}</strong>
        </div>
        <Message
          v-if="selectedDue.isCamAdvanceCovered"
          severity="success"
          :closable="false"
        >
          CAM advance covers this period from
          {{ formatDate(selectedDue.camAdvanceCoveredFrom) }} through
          {{ formatDate(selectedDue.camAdvancePaidUntil) }}. No payment is
          needed for this CAM period.
        </Message>
        <Message
          v-else-if="hasCamAdvanceAdjustment(selectedDue)"
          severity="info"
          :closable="false"
        >
          {{ formatMoney(camAdvanceAdjustmentAmount(selectedDue)) }} CAM advance
          was deducted. The remaining balance is
          {{ formatMoney(selectedDue.balanceAmount) }}.
        </Message>
        <Message v-else-if="!selectedDue.canPayNow" severity="info">
          Payment access is limited to the billing contact and configured
          resident relationship policy.
        </Message>
      </div>
    </Dialog>
  </div>
</template>

<style scoped>
.resident-home--standalone {
  gap: 1.15rem;
  padding: 0.25rem 0.1rem 1.25rem;
}

.resident-home__welcome {
  padding: 0.3rem 0.15rem 0;
}

.resident-home__welcome-label {
  margin: 0 0 0.35rem;
  color: var(--color-brand);
  font-size: 0.76rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.resident-home__welcome h1 {
  margin: 0;
  font-size: clamp(1.55rem, 7vw, 2rem);
  line-height: 1.12;
  letter-spacing: -0.04em;
}

.resident-home__welcome > p:last-child {
  margin: 0.35rem 0 0;
  color: var(--color-muted);
  font-size: 0.9rem;
}

.resident-home__balance {
  display: grid;
  gap: 0.5rem;
  min-width: 0;
  padding: 1.25rem;
  border-radius: 1.4rem;
  background: linear-gradient(140deg, #123a8d, #0645c3 58%, #3674e7);
  box-shadow: 0 12px 28px rgba(6, 69, 195, 0.18);
  color: #fff;
}

.resident-home__balance-top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  font-size: 0.85rem;
  font-weight: 700;
}

.resident-home__balance-top i {
  display: grid;
  width: 2.3rem;
  height: 2.3rem;
  place-items: center;
  border-radius: 0.75rem;
  background: rgba(255, 255, 255, 0.16);
  font-size: 1.1rem;
}

.resident-home__balance-amount {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: clamp(2.2rem, 10vw, 3rem);
  font-weight: 800;
  letter-spacing: -0.055em;
  line-height: 1.05;
}

.resident-home__balance p {
  margin: 0;
  color: rgba(255, 255, 255, 0.84);
  font-size: 0.82rem;
}

.resident-home__balance-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.6rem;
  margin-top: 0.55rem;
}

.resident-home__balance-button {
  display: inline-flex;
  min-height: 2.65rem;
  align-items: center;
  justify-content: center;
  gap: 0.6rem;
  padding: 0.55rem 0.9rem;
  border: 1px solid rgba(255, 255, 255, 0.6);
  border-radius: 0.8rem;
  cursor: pointer;
  font: inherit;
  font-size: 0.82rem;
  font-weight: 800;
}

.resident-home__balance-button--primary {
  border-color: #fff;
  background: #fff;
  color: #123a8d;
}

.resident-home__balance-button--secondary {
  background: transparent;
  color: #fff;
}

.resident-home__balance-button:disabled {
  cursor: wait;
  opacity: 0.65;
}

.resident-home__balance-button:focus-visible {
  outline: 3px solid #fff;
  outline-offset: 3px;
}

.resident-home__mini-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 0.35rem;
  padding: 0.8rem 0.35rem;
  border: 1px solid var(--color-border);
  border-radius: 1.1rem;
  background: var(--color-surface);
}

.resident-home__mini-summary > div {
  display: grid;
  align-content: start;
  gap: 0.35rem;
  min-width: 0;
  padding: 0 0.5rem;
}

.resident-home__mini-summary > div + div {
  border-left: 1px solid var(--color-border);
}

.resident-home__mini-summary span {
  color: var(--color-muted);
  font-size: 0.68rem;
  line-height: 1.2;
}

.resident-home__mini-summary strong {
  overflow-wrap: anywhere;
  font-size: clamp(0.8rem, 3.5vw, 1rem);
  line-height: 1.2;
}

.resident-home--standalone .resident-service-statistics-link {
  grid-template-columns: 2.5rem minmax(0, 1fr) auto;
  gap: 0.7rem;
  padding: 0.95rem;
  border: 1px solid var(--color-border);
  border-radius: 1.1rem;
  background: var(--color-surface);
}

.resident-home--standalone .resident-service-statistics-link__icon {
  width: 2.5rem;
  height: 2.5rem;
}

.resident-home--standalone .resident-service-statistics-link__content h2 {
  margin-top: 0.1rem;
  font-size: 0.98rem;
  line-height: 1.25;
}

.resident-home--standalone
  .resident-service-statistics-link__content
  p:last-child {
  display: none;
}

.resident-home--standalone .resident-service-statistics-link :deep(.p-button) {
  grid-column: auto;
  width: auto;
  min-width: 2.5rem;
  height: 2.5rem;
  padding: 0;
  border-radius: 0.8rem;
  font-size: 0;
}

.resident-home--standalone
  .resident-service-statistics-link
  :deep(.p-button-label) {
  display: none;
}

.resident-home--standalone
  .resident-service-statistics-link
  :deep(.p-button-icon) {
  margin: 0;
  font-size: 0.95rem;
}

.resident-home--standalone .resident-dues-panel > .list-page__header {
  padding: 0.2rem 0.1rem;
  border: 0;
  background: transparent;
  box-shadow: none;
}

.resident-home--standalone .resident-dues-panel .list-page__header h2 {
  font-size: 1.2rem;
  letter-spacing: -0.025em;
}

.resident-home__bill-tabs {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.3rem;
  padding: 0.3rem;
  border-radius: 0.9rem;
  background: color-mix(in srgb, var(--color-brand) 7%, var(--color-surface));
}

.resident-home__bill-tabs button {
  display: inline-flex;
  min-height: 2.75rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.45rem;
  border: 0;
  border-radius: 0.7rem;
  background: transparent;
  color: var(--color-muted);
  cursor: pointer;
  font: inherit;
  font-size: 0.86rem;
  font-weight: 750;
}

.resident-home__bill-tabs button.is-active {
  background: var(--color-surface);
  box-shadow: var(--shadow-sm);
  color: var(--color-brand-strong);
}

.resident-home__bill-tabs span {
  display: inline-grid;
  min-width: 1.35rem;
  height: 1.35rem;
  place-items: center;
  padding: 0 0.25rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--color-brand) 10%, var(--color-surface));
  font-size: 0.7rem;
}

.resident-home__bill-tabs button:focus-visible,
.resident-home__show-more:focus-visible {
  outline: 2px solid var(--color-brand);
  outline-offset: 2px;
}

.resident-home--standalone .resident-dues-panel .resident-due-group__header {
  padding: 0.75rem 0.2rem 0.4rem;
  border: 0;
  background: transparent;
}

.resident-home--standalone .resident-dues-panel .resident-due-card {
  border-radius: 1.1rem;
  background: var(--color-surface);
}

.resident-home--standalone .resident-dues-panel .resident-due-card__flat {
  color: var(--color-brand-strong);
  font-weight: 700;
}

.resident-home--standalone
  .resident-dues-panel
  .resident-due-card--history
  .billing-advance-state
  p {
  display: none;
}

.resident-home--standalone .resident-due-card__meta-grid {
  display: none;
}

.resident-home--standalone
  .resident-dues-panel
  .resident-mobile-actions--history {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.resident-home--standalone
  .resident-dues-panel
  .resident-mobile-actions
  :deep(.p-button) {
  min-height: 2.7rem;
}

.resident-home__show-more {
  display: flex;
  width: 100%;
  min-height: 2.8rem;
  align-items: center;
  justify-content: center;
  gap: 0.5rem;
  padding: 0.7rem;
  border: 1px solid var(--color-border);
  border-radius: 0.85rem;
  background: var(--color-surface);
  color: var(--color-brand-strong);
  cursor: pointer;
  font: inherit;
  font-size: 0.85rem;
  font-weight: 800;
}

.resident-home__show-more span {
  color: var(--color-muted);
  font-size: 0.73rem;
  font-weight: 500;
}

@media (max-width: 380px) {
  .resident-home__mini-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }

  .resident-home__mini-summary > div:last-child {
    grid-column: 1 / -1;
    padding-top: 0.65rem;
    border-top: 1px solid var(--color-border);
    border-left: 0;
  }
}

.resident-payment-review__content {
  display: grid;
  gap: 1rem;
}

.resident-payment-review__content p {
  margin: 0;
}

.resident-payment-review__image {
  max-height: min(55vh, 580px);
  overflow: auto;
  border: 1px solid var(--p-content-border-color);
  border-radius: 0.5rem;
}

.resident-payment-review__image img {
  display: block;
  width: 100%;
  min-width: 640px;
  height: auto;
}

.resident-payment-review__actions {
  display: flex;
  justify-content: flex-end;
  gap: 0.75rem;
  flex-wrap: wrap;
}

.resident-service-statistics-link {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 1rem;
  padding: 1rem 1.15rem;
  border-left: 4px solid var(--p-primary-color);
}

.resident-service-statistics-link__icon {
  display: grid;
  width: 2.75rem;
  height: 2.75rem;
  place-items: center;
  border-radius: 0.8rem;
  color: var(--p-primary-color);
  background: color-mix(in srgb, var(--p-primary-color) 12%, transparent);
}

.resident-service-statistics-link__icon i {
  font-size: 1.25rem;
}

.resident-service-statistics-link__content {
  min-width: 0;
}

.resident-service-statistics-link__content h2,
.resident-service-statistics-link__content p {
  margin: 0;
}

.resident-service-statistics-link__content h2 {
  margin-top: 0.15rem;
  font-size: 1.1rem;
}

.resident-service-statistics-link__content p:last-child {
  margin-top: 0.3rem;
  color: var(--text-color-secondary);
}

@media (max-width: 640px) {
  .resident-service-statistics-link {
    grid-template-columns: auto minmax(0, 1fr);
    gap: 0.75rem;
    padding: 0.9rem;
  }

  .resident-service-statistics-link :deep(.p-button) {
    grid-column: 1 / -1;
    width: 100%;
  }
}
</style>
