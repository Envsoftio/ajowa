<script setup lang="ts">
import type { AppNavGroup, AppNavItem, AppShellType } from '~/shared/shell'
import { shellNavigation } from '~/shared/shell'

const props = defineProps<{
  shell: AppShellType
}>()

const appStore = useAppStore()
const route = useRoute()
const groups = computed(() => shellNavigation[props.shell])
const openGroups = ref<Record<string, boolean>>({})

const getGroupKey = (group: AppNavGroup) => `${props.shell}-${group.label}`
const getPanelId = (group: AppNavGroup) =>
  `sidebar-group-${getGroupKey(group)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')}`

const isItemActive = (item: AppNavItem) => {
  if (item.to === '/') return route.path === item.to
  return route.path === item.to || route.path.startsWith(`${item.to}/`)
}

const isGroupActive = (group: AppNavGroup) => group.items.some(isItemActive)
const isGroupOpen = (group: AppNavGroup) => openGroups.value[getGroupKey(group)] ?? isGroupActive(group)

const toggleGroup = (group: AppNavGroup) => {
  openGroups.value = {
    ...openGroups.value,
    [getGroupKey(group)]: !isGroupOpen(group),
  }
}

watch(
  () => [props.shell, route.path],
  () => {
    const next = { ...openGroups.value }

    groups.value.forEach((group) => {
      if (isGroupActive(group)) next[getGroupKey(group)] = true
    })

    openGroups.value = next
  },
  { immediate: true },
)
</script>

<template>
  <aside class="app-sidebar">
    <div class="app-sidebar__header">
      <p class="eyebrow">Navigation</p>
      <h3>AJOWA</h3>
    </div>
    <nav class="app-sidebar__nav" aria-label="Primary">
      <section
        v-for="group in groups"
        :key="group.label"
        class="app-sidebar__group"
        :class="{ 'is-open': isGroupOpen(group), 'is-active': isGroupActive(group) }"
      >
        <button
          type="button"
          class="app-sidebar__group-toggle"
          :aria-expanded="isGroupOpen(group)"
          :aria-controls="getPanelId(group)"
          @click="toggleGroup(group)"
        >
          <span class="app-sidebar__group-title">
            <i :class="group.icon" aria-hidden="true" />
            {{ group.label }}
          </span>
          <i class="pi pi-chevron-down app-sidebar__group-chevron" aria-hidden="true" />
        </button>

        <div v-show="isGroupOpen(group)" :id="getPanelId(group)" class="app-sidebar__group-items">
          <NuxtLink
            v-for="item in group.items"
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
        </div>
      </section>
    </nav>
  </aside>
</template>
