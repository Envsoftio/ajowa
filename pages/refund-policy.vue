<script setup lang="ts">
import { refundPolicyDocument } from '~/shared/legal-content'

definePageMeta({
  title: 'Refund Policy',
})
</script>

<template>
  <AppLegalPage v-bind="refundPolicyDocument" />
</template>
