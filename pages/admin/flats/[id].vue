<script setup lang="ts">
import type { FlatDetail } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Flat Detail',
})

const route = useRoute()
const router = useRouter()
const api = useApi()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()

const flatId = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `admin-flat-${flatId.value}`,
  () => api<{ ok: true; data: FlatDetail }>(`/api/admin/flats/${flatId.value}`),
  { watch: [flatId] },
)

const flat = computed(() => data.value?.data ?? null)
const displayValue = (value: string | null | undefined) => value || '-'
const flatLabel = computed(() => {
  const current = flat.value

  return current
    ? [current.blockName, current.flatNumber].filter(Boolean).join(' · ') || current.flatNumber
    : 'Flat'
})

const unitLine = computed(() => {
  const current = flat.value

  if (!current) {
    return ''
  }

  return [
    current.unitType,
    current.floorLabel ? `Floor ${current.floorLabel}` : null,
    current.areaSqFt ? `${current.areaSqFt} sq ft` : null,
  ]
    .filter(Boolean)
    .join(' · ')
})

const relationshipSeverity = (type: string) => {
  if (type === 'OWNER') return 'success'
  if (type === 'TENANT') return 'info'
  return 'secondary'
}

const displayRelationshipNote = (note: string | null | undefined) => {
  const trimmed = note?.trim()

  if (!trimmed) {
    return null
  }

  const normalized = trimmed.toLowerCase()

  if (normalized.startsWith('imported from workbook') || normalized.startsWith('tenant imported from workbook')) {
    return null
  }

  return trimmed
}
</script>

<template>
  <div class="landing-page flat-detail-page">
    <AppState
      v-if="pending"
      variant="loading"
      title="Loading flat"
      message="Fetching flat details."
    />

    <AppState
      v-else-if="error || !flat"
      variant="error"
      title="Flat not found"
      message="The selected flat record is unavailable."
      action-label="Back to flats"
      @retry="router.push('/admin/flats')"
    />

    <template v-else>
      <section class="hero-panel flat-detail-hero">
        <div>
          <div class="flat-detail-tags">
            <Tag severity="contrast" :value="flat.occupancyStatus.replaceAll('_', ' ')" rounded />
            <AppStatusBadge :status="flat.isActive ? 'active' : 'inactive'" />
          </div>
          <h1>{{ flatLabel }}</h1>
          <p>{{ unitLine || 'No unit details recorded' }}</p>
        </div>

        <div class="hero-actions">
          <Button
            label="Flats"
            icon="pi pi-arrow-left"
            severity="secondary"
            outlined
            @click="router.push('/admin/flats')"
          />
          <Button
            label="Refresh"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            @click="refresh()"
          />
        </div>
      </section>

      <div class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Dues</p>
          <h3>{{ formatMoney(flat.duesSummary.totalBalanceAmount) }}</h3>
          <p>{{ flat.duesSummary.openDueCount }} open dues across the flat.</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Access</p>
          <h3>{{ flat.accessSummary.activeResidents }}</h3>
          <p>{{ flat.accessSummary.loginEnabledResidents }} residents have login enabled.</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Tickets</p>
          <h3>{{ flat.ticketSummary.openTicketCount }}</h3>
          <p>{{ flat.ticketSummary.closedTicketCount }} service tickets are already closed.</p>
        </section>
      </div>

      <section class="surface-card flat-info-panel">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Unit details</p>
            <h2>Flat registry information</h2>
          </div>
        </div>

        <div class="flat-fact-grid">
          <div>
            <span>Block</span>
            <strong>{{ flat.blockName }}</strong>
          </div>
          <div>
            <span>Flat number</span>
            <strong>{{ flat.flatNumber }}</strong>
          </div>
          <div>
            <span>Floor</span>
            <strong>{{ displayValue(flat.floorLabel) }}</strong>
          </div>
          <div>
            <span>Unit type</span>
            <strong>{{ flat.unitType }}</strong>
          </div>
          <div>
            <span>Area</span>
            <strong>{{ flat.areaSqFt ? `${flat.areaSqFt} sq ft` : '-' }}</strong>
          </div>
          <div>
            <span>Created</span>
            <strong>{{ formatDateTime(flat.createdAt) }}</strong>
          </div>
          <div>
            <span>Updated</span>
            <strong>{{ formatDateTime(flat.updatedAt) }}</strong>
          </div>
          <div>
            <span>Total billed</span>
            <strong>{{ formatMoney(flat.duesSummary.totalDueAmount) }}</strong>
          </div>
        </div>
      </section>

      <section class="surface-card admin-detail-list">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Relationships</p>
            <h2>Owners, tenants, and household members</h2>
          </div>
          <Tag :value="`${flat.relationships.length} records`" severity="secondary" rounded />
        </div>

        <AppState
          v-if="flat.relationships.length === 0"
          title="No linked residents"
          message="No owners, tenants, or household members are linked to this flat yet."
          icon="pi pi-users"
        />

        <template v-else>
          <article
            v-for="relationship in flat.relationships"
            :key="relationship.id"
            class="admin-detail-card flat-relationship-card"
          >
            <div class="admin-detail-card__header">
              <div>
                <h3>
                  <NuxtLink :to="`/admin/residents/${relationship.userId}`" class="table-link-button">
                    {{ relationship.residentName }}
                  </NuxtLink>
                </h3>
                <p>{{ relationship.relationshipType }} · {{ displayValue(relationship.residentEmail) }}</p>
              </div>
              <div class="admin-inline-actions">
                <Tag
                  :severity="relationshipSeverity(relationship.relationshipType)"
                  :value="relationship.relationshipType.replaceAll('_', ' ')"
                  rounded
                />
                <AppStatusBadge :status="relationship.isActive ? 'active' : 'inactive'" />
                <NuxtLink :to="`/admin/residents/${relationship.userId}`">
                  <Button
                    icon="pi pi-eye"
                    severity="secondary"
                    text
                    rounded
                    :aria-label="`View ${relationship.residentName}`"
                  />
                </NuxtLink>
              </div>
            </div>
            <div class="admin-detail-card__meta">
              <span>Primary: {{ relationship.isPrimaryContact ? 'Yes' : 'No' }}</span>
              <span>Billing: {{ relationship.isBillingContact ? 'Yes' : 'No' }}</span>
              <span>Access: {{ relationship.accessScope ?? '—' }}</span>
              <span>Ownership starts: {{ formatDate(relationship.ownershipStartDate) }}</span>
              <span>Lease: {{ formatDate(relationship.leaseStartDate) }} - {{ formatDate(relationship.leaseEndDate) }}</span>
            </div>
            <p v-if="displayRelationshipNote(relationship.relationshipNote)" class="flat-note">
              {{ displayRelationshipNote(relationship.relationshipNote) }}
            </p>
          </article>
        </template>
      </section>
    </template>
  </div>
</template>

<style scoped>
.flat-detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
}

.flat-detail-tags {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.flat-info-panel,
.flat-relationship-card {
  display: grid;
  gap: 1rem;
}

.flat-fact-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 0.75rem;
}

.flat-fact-grid div {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.flat-fact-grid span {
  color: var(--color-muted);
  font-size: 0.82rem;
}

.flat-fact-grid strong {
  overflow-wrap: anywhere;
}

.flat-note {
  margin: 0;
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
  color: var(--color-muted);
}

@media (max-width: 1100px) {
  .flat-fact-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 700px) {
  .flat-fact-grid {
    grid-template-columns: 1fr;
  }
}
</style>
