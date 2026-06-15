<script setup lang="ts">
import type { FlatDetail } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Flat Detail',
})

const route = useRoute()
const api = useApi()

const { data, pending } = await useAsyncData(`admin-flat-${route.params.id}`, () =>
  api<{ ok: true; data: FlatDetail }>(`/api/admin/flats/${route.params.id}`),
)
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" :value="data?.data.occupancyStatus ?? 'Flat'" rounded />
      <h1>{{ data?.data.flatNumber }}</h1>
      <p>
        {{ data?.data.blockName }} · {{ data?.data.unitType }} · {{ data?.data.areaSqFt ?? '—' }} sq ft
      </p>
    </section>

    <div v-if="pending" class="surface-card">
      Loading flat detail…
    </div>

    <template v-else-if="data?.data">
      <div class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Dues</p>
          <h3>{{ data.data.duesSummary.totalBalanceAmount.toFixed(2) }}</h3>
          <p>{{ data.data.duesSummary.openDueCount }} open dues across the flat.</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Access</p>
          <h3>{{ data.data.accessSummary.activeResidents }}</h3>
          <p>{{ data.data.accessSummary.loginEnabledResidents }} residents have login enabled.</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Tickets</p>
          <h3>{{ data.data.ticketSummary.openTicketCount }}</h3>
          <p>{{ data.data.ticketSummary.closedTicketCount }} service tickets are already closed.</p>
        </section>
      </div>

      <section class="surface-card admin-detail-list">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Relationships</p>
            <h2>Owners, tenants, and household members</h2>
          </div>
        </div>

        <article v-for="relationship in data.data.relationships" :key="relationship.id" class="admin-detail-card">
          <div class="admin-detail-card__header">
            <div>
              <h3>{{ relationship.residentName }}</h3>
              <p>{{ relationship.relationshipType }} · {{ relationship.residentEmail }}</p>
            </div>
            <AppStatusBadge :status="relationship.isActive ? 'active' : 'inactive'" />
          </div>
          <div class="admin-detail-card__meta">
            <span>Primary: {{ relationship.isPrimaryContact ? 'Yes' : 'No' }}</span>
            <span>Billing: {{ relationship.isBillingContact ? 'Yes' : 'No' }}</span>
            <span>Access: {{ relationship.accessScope ?? '—' }}</span>
            <span>Lease ends: {{ relationship.leaseEndDate ?? '—' }}</span>
          </div>
        </article>
      </section>
    </template>
  </div>
</template>
