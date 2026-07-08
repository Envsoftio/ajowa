<script setup lang="ts">
import { privacyPolicyDocument } from '~/shared/legal-content'

definePageMeta({
  title: 'Privacy Policy',
})
</script>

<template>
  <AppLegalPage v-bind="privacyPolicyDocument" />
</template>
