<script setup lang="ts">
import type {
  ProfessionDirectoryEntry,
  ProfessionSummary,
} from '~/types/domain'

definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'Profession Directory',
})

type DirectoryResponse = {
  professions: ProfessionSummary[]
  items: ProfessionDirectoryEntry[]
}

const api = useApi()
const selectedProfessionId = ref('')

const { data, pending, refresh } = await useAsyncData(
  'my-profession-directory',
  () =>
    api<{ ok: true; data: DirectoryResponse }>('/api/my/profession-directory', {
      query: {
        professionId: selectedProfessionId.value || undefined,
      },
    }),
  { watch: [selectedProfessionId] },
)

const professions = computed(() => data.value?.data.professions ?? [])
const entries = computed(() => data.value?.data.items ?? [])
const professionOptions = computed(() =>
  professions.value.map((profession) => ({
    label: profession.name,
    value: profession.id,
  })),
)

const selectedProfessionName = computed(
  () =>
    professions.value.find(
      (profession) => profession.id === selectedProfessionId.value,
    )?.name ?? '',
)

const clearFilter = () => {
  selectedProfessionId.value = ''
}
</script>

<template>
  <div class="landing-page profession-directory-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Profession directory</h1>
          <p>
            Flat owners whose profession and contact details are visible to
            members.
          </p>
        </div>
      </header>

      <div class="list-page__toolbar">
        <div class="list-page__filters">
          <Select
            v-model="selectedProfessionId"
            :options="professionOptions"
            option-label="label"
            option-value="value"
            placeholder="Filter by profession"
            filter
            show-clear
          />
          <Button
            label="Clear"
            severity="secondary"
            outlined
            :disabled="!selectedProfessionId"
            @click="clearFilter"
          />
        </div>
      </div>

      <AppState
        v-if="pending"
        variant="loading"
        title="Loading directory"
        message="Fetching public profession listings."
      />

      <AppState
        v-else-if="entries.length === 0"
        title="No listings"
        :message="
          selectedProfessionName
            ? `No public ${selectedProfessionName} listing is available.`
            : 'No public profession listing is available.'
        "
        icon="pi pi-briefcase"
        action-label="Refresh"
        @retry="refresh"
      />

      <div v-else class="profession-directory-list">
        <article
          v-for="entry in entries"
          :key="entry.id"
          class="profession-directory-row"
        >
          <div class="profession-directory-row__main">
            <div class="profession-directory-avatar">
              <i class="pi pi-briefcase" aria-hidden="true" />
            </div>
            <div>
              <p class="eyebrow">{{ entry.professionName }}</p>
              <h2>{{ entry.residentName }}</h2>
              <p>{{ entry.flatLabels.join(', ') || 'Flat owner' }}</p>
            </div>
          </div>

          <p v-if="entry.adminNote" class="profession-directory-note">
            {{ entry.adminNote }}
          </p>

          <div class="profession-directory-actions">
            <Button
              v-if="entry.publicPhone"
              as="a"
              :href="`tel:${entry.publicPhone}`"
              icon="pi pi-phone"
              :label="entry.publicPhone"
              severity="secondary"
              outlined
            />
            <Button
              v-if="entry.publicEmail"
              as="a"
              :href="`mailto:${entry.publicEmail}`"
              icon="pi pi-envelope"
              :label="entry.publicEmail"
              severity="secondary"
              outlined
            />
          </div>
        </article>
      </div>
    </section>
  </div>
</template>

<style scoped>
.profession-directory-page {
  display: grid;
  gap: 1rem;
}

.profession-directory-list {
  display: grid;
  gap: 0.75rem;
}

.profession-directory-row {
  display: grid;
  gap: 0.85rem;
  padding: 1rem;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  background: var(--color-bg);
}

.profession-directory-row__main {
  display: flex;
  gap: 0.85rem;
  align-items: center;
  min-width: 0;
}

.profession-directory-row h2,
.profession-directory-row p {
  margin: 0;
}

.profession-directory-row h2 {
  font-size: 1.05rem;
}

.profession-directory-row__main p:not(.eyebrow),
.profession-directory-note {
  color: var(--color-muted);
}

.profession-directory-avatar {
  display: grid;
  place-items: center;
  width: 2.5rem;
  height: 2.5rem;
  flex: 0 0 auto;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  color: var(--color-brand);
  background: var(--color-surface-strong);
}

.profession-directory-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

@media (max-width: 640px) {
  .profession-directory-actions :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
}
</style>
