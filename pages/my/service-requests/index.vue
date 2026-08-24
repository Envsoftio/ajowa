<script setup lang="ts">
import type { ServiceRequestSummary } from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Service Requests',
})

const api = useApi()
const search = ref('')
const query = reactive({ page: 1, pageSize: 20, search: '' })

const { data, pending, refresh } = await useAsyncData(
  'my-service-requests',
  () =>
    api<{ ok: true; data: { items: ServiceRequestSummary[]; total: number } }>(
      '/api/my/service-requests',
      {
        query,
      },
    ),
  { watch: [query] },
)

const tickets = computed(() => data.value?.data.items ?? [])

const onSearch = () => {
  query.page = 1
  query.search = search.value.trim()
}
</script>

<template>
  <div class="landing-page resident-service-requests">
    <section class="list-page surface-card resident-service-requests__panel">
      <header class="list-page__header">
        <div>
          <h1>My service requests</h1>
          <p>
            Track complaints, updates, and reopen resolved issues when needed.
          </p>
        </div>
        <div class="list-page__exports">
          <Button
            label="Raise request"
            icon="pi pi-plus"
            as="a"
            href="/my/service-requests/new"
          />
        </div>
      </header>
      <div class="list-page__toolbar resident-service-requests__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText
            v-model="search"
            placeholder="Search ticket number, title, or location"
            @keydown.enter="onSearch"
          />
        </IconField>
        <Button
          class="resident-service-requests__search-button"
          label="Search"
          aria-label="Search service requests"
          title="Search"
          icon="pi pi-search"
          @click="onSearch"
        />
        <Button
          class="resident-service-requests__refresh-button"
          label="Refresh"
          aria-label="Refresh service requests"
          title="Refresh"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          @click="() => refresh()"
        />
      </div>
      <div class="resident-ticket-list">
        <template v-if="pending">
          <AppSkeletonState v-for="item in 3" :key="item" />
        </template>
        <template v-else>
          <NuxtLink
            v-for="ticket in tickets"
            :key="ticket.id"
            :to="`/my/service-requests/${ticket.id}`"
            class="resident-ticket-list__link"
            :aria-label="`View service request ${ticket.requestNumber}: ${ticket.title}`"
          >
            <TicketSummaryCard :ticket="ticket" compact />
            <span class="resident-ticket-list__view">
              View details
              <i class="pi pi-arrow-right" aria-hidden="true" />
            </span>
          </NuxtLink>
        </template>
        <AppState
          v-if="!pending && tickets.length === 0"
          variant="empty"
          title="No service requests"
          message="Raise a request when something needs attention."
        />
      </div>
    </section>
  </div>
</template>

<style scoped>
.resident-ticket-list {
  display: grid;
  gap: 0.85rem;
}

.resident-ticket-list__link {
  position: relative;
  display: grid;
  color: inherit;
  text-decoration: none;
  border-radius: var(--radius-lg);
}

.resident-ticket-list__link:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--color-brand) 35%, transparent);
  outline-offset: 3px;
}

.resident-ticket-list__link :deep(.ticket-summary-card) {
  height: 100%;
  padding-bottom: 2.7rem;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    box-shadow 160ms ease,
    transform 160ms ease;
}

.resident-ticket-list__link:hover :deep(.ticket-summary-card) {
  border-color: color-mix(in srgb, var(--color-brand) 30%, var(--color-border));
  box-shadow: var(--shadow-lg);
  transform: translateY(-1px);
}

.resident-ticket-list__view {
  position: absolute;
  right: 0.9rem;
  bottom: 0.8rem;
  display: inline-flex;
  align-items: center;
  gap: 0.35rem;
  color: var(--color-brand-strong);
  font-size: 0.78rem;
  font-weight: 800;
}

@media (max-width: 768px) {
  .resident-service-requests__panel {
    gap: 0.85rem;
  }

  .resident-service-requests__toolbar {
    grid-template-columns: minmax(0, 1fr) auto auto;
    margin-inline: -0.9rem;
    padding-inline: 0.9rem;
  }

  .resident-service-requests__toolbar :deep(.p-button) {
    width: 2.75rem;
    min-width: 2.75rem;
    padding-inline: 0;
  }

  .resident-service-requests__toolbar :deep(.p-button-label) {
    display: none;
  }

  .resident-ticket-list {
    gap: 0.7rem;
  }

  .resident-ticket-list__view {
    position: static;
    justify-content: flex-end;
    margin: -2.15rem 0.85rem 0.75rem auto;
  }
}

@media (max-width: 380px) {
  .resident-service-requests__toolbar {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .resident-service-requests__refresh-button {
    display: none;
  }
}
</style>
