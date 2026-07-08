<script setup lang="ts">
import { societyPolicyDocument } from '~/shared/legal-content'

definePageMeta({
  title: 'Policy',
})
</script>

<template>
  <AppLegalPage v-bind="societyPolicyDocument" />
</template>
