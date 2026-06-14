<script setup lang="ts">
import type { AppShellType } from '~/shared/shell'
import { shellNavigation } from '~/shared/shell'

const props = defineProps<{
  shell: AppShellType
}>()

const appStore = useAppStore()
const items = computed(() => shellNavigation[props.shell])
</script>

<template>
  <aside class="app-sidebar">
    <div class="app-sidebar__header">
      <p class="eyebrow">Navigation</p>
      <h3>AJOWA</h3>
    </div>
    <nav aria-label="Primary">
      <NuxtLink
        v-for="item in items"
        :key="item.label"
        :to="item.to"
        class="app-sidebar__link"
        active-class="is-active"
        @click="appStore.closeSidebar()"
      >
        <span class="app-sidebar__link-text">
          <i :class="item.icon" aria-hidden="true" />
          {{ item.label }}
        </span>
        <Badge v-if="item.badge" :value="item.badge" severity="contrast" />
      </NuxtLink>
    </nav>
  </aside>
</template>
