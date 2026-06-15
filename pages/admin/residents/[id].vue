<script setup lang="ts">
import type { ResidentDetail } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Resident Detail',
})

const route = useRoute()
const api = useApi()
const toast = useToast()

const { data, pending, refresh } = await useAsyncData(`admin-resident-${route.params.id}`, () =>
  api<{ ok: true; data: ResidentDetail }>(`/api/admin/residents/${route.params.id}`),
)

const runningAction = ref('')

const runAction = async (action: string) => {
  runningAction.value = action

  try {
    await api(`/api/admin/residents/${route.params.id}/actions`, {
      method: 'POST',
      body: { action },
    })

    toast.add({
      severity: 'success',
      summary: 'Action completed',
      detail: action.replaceAll('_', ' '),
      life: 3000,
    })
    await refresh()
  } finally {
    runningAction.value = ''
  }
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" :value="data?.data.role ?? 'Resident'" rounded />
      <h1>{{ data?.data.fullName }}</h1>
      <p>{{ data?.data.email }} · {{ data?.data.mobileNumber }}</p>
      <div class="hero-actions">
        <Button label="Send invite" :loading="runningAction === 'SEND_INVITE'" @click="runAction('SEND_INVITE')" />
        <Button label="Resend invite" severity="secondary" outlined :loading="runningAction === 'RESEND_INVITE'" @click="runAction('RESEND_INVITE')" />
        <Button label="Deactivate login" severity="danger" text :loading="runningAction === 'DEACTIVATE_LOGIN'" @click="runAction('DEACTIVATE_LOGIN')" />
      </div>
    </section>

    <div v-if="pending" class="surface-card">
      Loading resident detail…
    </div>

    <template v-else-if="data?.data">
      <div class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Compliance</p>
          <h3>{{ data.data.kycStatus }}</h3>
          <p>Police verification: {{ data.data.policeVerificationStatus }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Login</p>
          <h3>{{ data.data.canLogin ? 'Enabled' : 'Disabled' }}</h3>
          <p>Email verified: {{ data.data.emailVerified ? 'Yes' : 'No' }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Documents</p>
          <h3>{{ data.data.governmentIdType ?? '—' }}</h3>
          <p>Ownership proof and lease records stay private and auditable.</p>
        </section>
      </div>

      <section class="surface-card admin-detail-list">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Relationships</p>
            <h2>Flat links and occupancy history</h2>
          </div>
        </div>

        <article v-for="relationship in data.data.relationships" :key="relationship.id" class="admin-detail-card">
          <div class="admin-detail-card__header">
            <div>
              <h3>{{ relationship.relationshipType }}</h3>
              <p>Flat ID: {{ relationship.flatId }}</p>
            </div>
            <AppStatusBadge :status="relationship.isActive ? 'active' : 'inactive'" />
          </div>
          <div class="admin-detail-card__meta">
            <span>Primary: {{ relationship.isPrimaryContact ? 'Yes' : 'No' }}</span>
            <span>Billing: {{ relationship.isBillingContact ? 'Yes' : 'No' }}</span>
            <span>Lease: {{ relationship.leaseStartDate ?? '—' }} to {{ relationship.leaseEndDate ?? '—' }}</span>
            <span>Deposit: {{ relationship.securityDepositAmount ?? '—' }}</span>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>
