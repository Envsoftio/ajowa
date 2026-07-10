<script setup lang="ts">
definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My QR',
})

type MyQrResponse = {
  ok: true
  data: {
    access: null | {
      isGranted: boolean
      basis: string | null
      unpaidFlats: string[]
      totalFlats: number
      totalPaidFlats: number
      totalUnpaidFlats: number
      totalDue: number
      totalPaid: number
      totalBalance: number
      overrideState: string | null
      overrideReason: string | null
      computedAt: string
    }
    qr: null | {
      id: string
      imageDataUrl: string
      validUntil: string
      generatedAt: string
    }
    message?: string
  }
}

const api = useApi()
const { data, pending, refresh } = await useAsyncData('my-qr', () => api<MyQrResponse>('/api/qr/my-qr'))

const state = computed(() => data.value?.data)
const access = computed(() => state.value?.access ?? null)
const qr = computed(() => state.value?.qr ?? null)

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(value)

const formatDateTime = (value: string | null | undefined) =>
  value ? new Date(value).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '-'
</script>

<template>
  <div class="landing-page">
    <section class="surface-card qr-access-panel">
      <header class="list-page__header">
        <div>
          <p class="eyebrow">Gate access</p>
          <h1>My QR</h1>
          <p>One active QR is issued when linked access flats are paid, waived, or CAM-paid for the current access duration.</p>
        </div>
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
      </header>

      <AppSkeletonState v-if="pending" />
      <AppState
        v-else-if="!access"
        variant="empty"
        title="No current QR period"
        :message="state?.message ?? 'No billing period is active right now.'"
      />

      <div v-else class="qr-access-grid">
        <div class="qr-status-card" :class="{ 'qr-status-card--blocked': !access.isGranted }">
          <Tag :severity="access.isGranted ? 'success' : 'danger'" :value="access.isGranted ? 'Allowed' : 'Blocked'" rounded />
          <h2>{{ access.isGranted ? 'Access allowed' : 'Access blocked' }}</h2>
          <p v-if="access.isGranted">Show this QR at the gate. Guards only see your name and permitted flat labels.</p>
          <p v-else>
            Clear the blocking maintenance status to restore QR access.
          </p>

          <div class="qr-kpis">
            <span>{{ access.totalPaidFlats }}/{{ access.totalFlats }} flats clear</span>
            <strong>{{ formatMoney(access.totalBalance) }}</strong>
          </div>

          <Message v-if="access.overrideState" severity="warn" :closable="false">
            Manual override: {{ access.overrideState }}. {{ access.overrideReason }}
          </Message>

          <div v-if="access.unpaidFlats.length" class="qr-block-list">
            <strong>Blocking flat(s)</strong>
            <span v-for="flat in access.unpaidFlats" :key="flat">{{ flat }}</span>
          </div>
        </div>

        <div class="qr-image-card">
          <template v-if="access.isGranted && qr">
            <img :src="qr.imageDataUrl" alt="Gate access QR code" class="qr-image">
            <p>Valid until {{ formatDateTime(qr.validUntil) }}</p>
            <a :href="qr.imageDataUrl" download="ajowa-gate-qr.png">
              <Button label="Download" icon="pi pi-download" />
            </a>
          </template>
          <AppState
            v-else
            variant="empty"
            title="QR unavailable"
            message="A QR will be generated automatically when access is allowed."
          />
        </div>
      </div>
    </section>
  </div>
</template>
