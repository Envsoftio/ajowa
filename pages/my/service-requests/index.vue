<script setup lang="ts">
import type { ServiceRequestSummary } from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Service Requests',
})

const api = useApi()
const router = useRouter()
const search = ref('')
const query = reactive({ page: 1, pageSize: 20, search: '' })

const { data, pending, refresh } = await useAsyncData('my-service-requests', () =>
  api<{ ok: true; data: { items: ServiceRequestSummary[]; total: number } }>('/api/my/service-requests', {
    query,
  }),
  { watch: [query] },
)

const tickets = computed(() => data.value?.data.items ?? [])

const onSearch = () => {
  query.page = 1
  query.search = search.value.trim()
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>My service requests</h1>
          <p>Track complaints, updates, and reopen resolved issues when needed.</p>
        </div>
        <div class="list-page__exports">
          <Button label="Raise request" icon="pi pi-plus" as="a" href="/my/service-requests/new" />
        </div>
      </header>
      <div class="list-page__toolbar">
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Search ticket number, title, or location" @keydown.enter="onSearch" />
        </IconField>
        <Button label="Search" icon="pi pi-search" @click="onSearch" />
        <Button label="Refresh" icon="pi pi-refresh" severity="secondary" outlined @click="() => refresh()" />
      </div>
      <div class="resident-ticket-list">
        <template v-if="pending">
          <AppSkeletonState v-for="item in 3" :key="item" />
        </template>
        <template v-else>
          <TicketSummaryCard
            v-for="ticket in tickets"
            :key="ticket.id"
            :ticket="ticket"
            @click="router.push(`/my/service-requests/${ticket.id}`)"
          />
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

.resident-ticket-list :deep(.ticket-summary-card) {
  cursor: pointer;
}
</style>
