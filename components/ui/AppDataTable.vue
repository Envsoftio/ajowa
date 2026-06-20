<script setup lang="ts">
import PrimeDataTable from 'primevue/datatable'

defineOptions({
  inheritAttrs: false,
})

const attrs = useAttrs()
const slots = useSlots()

const slotNames = computed(() => Object.keys(slots))

const rows = computed(() => {
  const value = attrs.value
  return Array.isArray(value) ? value : []
})

const totalRecords = computed(() => {
  const total = attrs.totalRecords ?? attrs['total-records']
  const numericTotal = Number(total)

  return Number.isFinite(numericTotal) ? numericTotal : rows.value.length
})

const countLabel = computed(() =>
  new Intl.NumberFormat('en-IN').format(totalRecords.value),
)

const shownLabel = computed(() =>
  new Intl.NumberFormat('en-IN').format(rows.value.length),
)

const shouldShowVisibleCount = computed(
  () => rows.value.length !== totalRecords.value,
)
</script>

<template>
  <div class="app-data-table">
    <div class="app-data-table__count" aria-live="polite">
      <span>Total records</span>
      <strong>{{ countLabel }}</strong>
      <span v-if="shouldShowVisibleCount">Showing {{ shownLabel }}</span>
    </div>

    <PrimeDataTable v-bind="attrs">
      <template v-for="name in slotNames" #[name]="slotProps">
        <slot :name="name" v-bind="slotProps ?? {}" />
      </template>
    </PrimeDataTable>
  </div>
</template>
