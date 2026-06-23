<script setup lang="ts">
import type { FinanceTransaction } from '~/types/domain'

const props = defineProps<{
  transaction?: FinanceTransaction | null
  saving?: boolean
  formMode?: boolean
}>()

const emit = defineEmits<{
  saveDraft: []
  submitForReview: []
  approve: []
  return: []
  reject: []
  reverse: []
}>()

void props
</script>

<template>
  <div class="transaction-action-bar">
    <template v-if="formMode">
      <Button
        type="button"
        label="Save"
        icon="pi pi-send"
        :loading="saving"
        @click="emit('submitForReview')"
      />
    </template>
  </div>
</template>
