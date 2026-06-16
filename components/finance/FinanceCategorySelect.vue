<script setup lang="ts">
import type { FinanceCategory, FinanceTransactionType } from '~/types/domain'

const props = defineProps<{
  categories: FinanceCategory[]
  transactionType: FinanceTransactionType
  disabled?: boolean
}>()

const model = defineModel<string>({ required: true })

const options = computed(() =>
  props.categories
    .filter(
      (category) =>
        category.transactionType === props.transactionType && category.isActive,
    )
    .map((category) => ({
      label: `${category.categoryGroup} - ${category.name}`,
      value: category.id,
      requiresAttachment: category.requiresAttachment,
    })),
)
</script>

<template>
  <Select
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    :disabled="disabled"
    filter
    placeholder="Choose category"
  />
</template>
