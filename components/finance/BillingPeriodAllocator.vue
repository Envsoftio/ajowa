<script setup lang="ts">
import type { BillingPeriod } from '~/types/domain'

const props = defineProps<{
  periods: BillingPeriod[]
  disabled?: boolean
}>()

const model = defineModel<string | null>({ required: true })

const options = computed(() => [
  { label: 'No billing period', value: null, disabled: false },
  ...props.periods.map((period) => ({
    label: period.isLocked ? `${period.label} (locked)` : period.label,
    value: period.id,
    disabled: period.isLocked,
  })),
])
</script>

<template>
  <Select
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    option-disabled="disabled"
    :disabled="disabled"
    filter
    placeholder="Choose billing period"
  />
</template>
