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

const canReview = computed(() =>
  props.transaction
    ? ['DRAFT', 'PENDING_REVIEW', 'RETURNED'].includes(props.transaction.status)
    : false,
)
</script>

<template>
  <div class="transaction-action-bar">
    <template v-if="formMode">
      <Button
        type="button"
        label="Save Draft"
        icon="pi pi-save"
        severity="secondary"
        outlined
        :loading="saving"
        @click="emit('saveDraft')"
      />
      <Button
        type="button"
        label="Post / Submit"
        icon="pi pi-send"
        :loading="saving"
        @click="emit('submitForReview')"
      />
    </template>
    <template v-else-if="transaction">
      <Button
        v-if="canReview"
        type="button"
        icon="pi pi-check"
        label="Approve"
        severity="success"
        @click="emit('approve')"
      />
      <Button
        v-if="canReview"
        type="button"
        icon="pi pi-replay"
        label="Return"
        severity="secondary"
        outlined
        @click="emit('return')"
      />
      <Button
        v-if="canReview"
        type="button"
        icon="pi pi-times"
        label="Reject"
        severity="danger"
        outlined
        @click="emit('reject')"
      />
      <Button
        v-if="transaction.status === 'POSTED'"
        type="button"
        icon="pi pi-undo"
        label="Reverse"
        severity="danger"
        outlined
        @click="emit('reverse')"
      />
    </template>
  </div>
</template>
