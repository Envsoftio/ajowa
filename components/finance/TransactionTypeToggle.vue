<script setup lang="ts">
import type { FinanceTransactionType } from '~/types/domain'

const model = defineModel<FinanceTransactionType>({ required: true })

const options = [
  { label: 'Expense', value: 'EXPENSE' },
  { label: 'Income', value: 'INCOME' },
]
</script>

<template>
  <SelectButton
    v-model="model"
    :options="options"
    option-label="label"
    option-value="value"
    :allow-empty="false"
    aria-label="Transaction type"
  />
</template>
