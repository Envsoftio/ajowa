<script setup lang="ts">
import type { BankAccount } from '~/types/domain'

const props = defineProps<{
  accounts: BankAccount[]
  disabled?: boolean
}>()

const model = defineModel<string>({ required: true })

const options = computed(() =>
  props.accounts
    .filter((account) => account.isActive)
    .map((account) => ({
      label: `${account.accountName} (${account.accountNumberMasked})`,
      value: account.id,
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
    placeholder="Choose account"
  />
</template>
