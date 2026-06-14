<script setup lang="ts">
import type { AppShellType } from '~/shared/shell'
import { shellTitles } from '~/shared/shell'

const props = defineProps<{
  shell: AppShellType
}>()

const route = useRoute()
const pageTitle = computed(() => String(route.meta.title ?? shellTitles[props.shell]))
</script>

<template>
  <div class="app-breadcrumb">
    <span>AJOWA</span>
    <span>/</span>
    <span>{{ shellTitles[props.shell] }}</span>
    <span>/</span>
    <span>{{ pageTitle }}</span>
  </div>
</template>
