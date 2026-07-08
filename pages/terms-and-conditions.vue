<script setup lang="ts">
import { termsDocument } from '~/shared/legal-content'

definePageMeta({
  title: 'Terms and Conditions',
})
</script>

<template>
  <AppLegalPage v-bind="termsDocument" />
</template>
