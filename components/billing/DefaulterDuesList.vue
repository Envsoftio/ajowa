<script setup lang="ts">
import type { DefaulterSummary } from '~/types/domain'

type Due = DefaulterSummary['flats'][number]

const props = defineProps<{
  dues: Due[]
  flatCount: number
}>()

const sortedDues = computed(() =>
  [...props.dues].sort(
    (a, b) =>
      b.daysOverdue - a.daysOverdue ||
      b.balanceAmount - a.balanceAmount ||
      a.dueDate.localeCompare(b.dueDate),
  ),
)

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value)

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', {
    dateStyle: 'medium',
  })

const chargeTypeLabel = (value: string | undefined) => {
  if (value === 'CAM') return 'CAM'
  if (value === 'DG_SET') return 'DG Set'
  return 'General'
}

const overdueLabel = (days: number) =>
  days > 0 ? `${days} ${days === 1 ? 'day' : 'days'} overdue` : 'Not overdue'
</script>

<template>
  <div class="due-list">
    <p class="due-list__count">
      {{ dues.length }} {{ dues.length === 1 ? 'due' : 'dues' }} across
      {{ flatCount }} {{ flatCount === 1 ? 'flat' : 'flats' }}
    </p>
    <ul class="due-list__items">
      <li
        v-for="due in sortedDues.slice(0, 2)"
        :key="due.dueId"
        class="due-list__item"
      >
        <div class="due-list__main">
          <strong>{{ due.blockName }} {{ due.flatNumber }}</strong>
          <strong>{{ formatMoney(due.balanceAmount) }}</strong>
        </div>
        <span class="due-list__meta">
          {{ due.billingPeriodLabel }} ·
          {{ chargeTypeLabel(due.billingPeriodChargeType) }}
        </span>
        <span class="due-list__meta">
          Due {{ formatDate(due.dueDate) }} ·
          <span :class="due.daysOverdue > 0 ? 'due-list__overdue' : ''">
            {{ overdueLabel(due.daysOverdue) }}
          </span>
        </span>
        <span v-if="due.camAdvanceNote" class="due-list__meta">
          CAM advance: {{ due.camAdvanceNote }}
        </span>
      </li>
    </ul>
    <details v-if="sortedDues.length > 2" class="due-list__more">
      <summary>
        <span class="due-list__more-closed"
          >Show {{ sortedDues.length - 2 }} more dues</span
        >
        <span class="due-list__more-open">Hide additional dues</span>
      </summary>
      <ul class="due-list__items">
        <li
          v-for="due in sortedDues.slice(2)"
          :key="due.dueId"
          class="due-list__item"
        >
          <div class="due-list__main">
            <strong>{{ due.blockName }} {{ due.flatNumber }}</strong>
            <strong>{{ formatMoney(due.balanceAmount) }}</strong>
          </div>
          <span class="due-list__meta">
            {{ due.billingPeriodLabel }} ·
            {{ chargeTypeLabel(due.billingPeriodChargeType) }}
          </span>
          <span class="due-list__meta">
            Due {{ formatDate(due.dueDate) }} ·
            <span :class="due.daysOverdue > 0 ? 'due-list__overdue' : ''">
              {{ overdueLabel(due.daysOverdue) }}
            </span>
          </span>
          <span v-if="due.camAdvanceNote" class="due-list__meta">
            CAM advance: {{ due.camAdvanceNote }}
          </span>
        </li>
      </ul>
    </details>
  </div>
</template>

<style scoped>
.due-list {
  min-width: 0;
}

.due-list__count {
  margin: 0 0 0.45rem;
  color: var(--color-muted);
  font-size: 0.78rem;
  font-weight: 700;
}

.due-list__items {
  display: grid;
  gap: 0;
  margin: 0;
  padding: 0;
  list-style: none;
}

.due-list__item {
  display: grid;
  gap: 0.15rem;
  min-width: 0;
  padding: 0.5rem 0;
  border-top: 1px solid var(--color-border);
}

.due-list__main {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  min-width: 0;
  line-height: 1.3;
}

.due-list__main strong:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.due-list__main strong:last-child {
  flex: none;
  white-space: nowrap;
}

.due-list__meta {
  color: var(--color-muted);
  font-size: 0.78rem;
  line-height: 1.35;
  overflow-wrap: anywhere;
}

.due-list__overdue {
  color: var(--color-danger);
  font-weight: 700;
}

.due-list__more summary {
  width: fit-content;
  margin-top: 0.35rem;
  color: var(--color-accent);
  font-size: 0.82rem;
  font-weight: 700;
  cursor: pointer;
}

.due-list__more summary:focus-visible {
  outline: 2px solid var(--color-accent);
  outline-offset: 3px;
}

.due-list__more-open,
.due-list__more[open] .due-list__more-closed {
  display: none;
}

.due-list__more[open] .due-list__more-open {
  display: inline;
}

.due-list__more .due-list__items {
  margin-top: 0.4rem;
}
</style>
