<script setup lang="ts">
import type { AppShellType } from '~/shared/shell'

const props = defineProps<{
  shell?: AppShellType
}>()

const theme = useTheme()
const appStore = useAppStore()
const shell = computed(() => props.shell ?? 'public')
</script>

<template>
  <div :class="['app-shell', theme.isDark.value ? 'app-theme-dark' : 'app-theme-light']">
    <Toast />
    <ConfirmDialog />
    <div class="app-shell__layout">
      <AppSidebar :shell="shell" />
      <div class="app-frame">
        <AppTopbar :shell="shell" />
        <Drawer v-model:visible="appStore.sidebarOpen" position="left" class="app-mobile-drawer">
          <AppSidebar :shell="shell" />
        </Drawer>
        <main class="app-content">
          <AppBreadcrumb :shell="shell" />
          <slot />
        </main>
      </div>
    </div>
  </div>
</template>
