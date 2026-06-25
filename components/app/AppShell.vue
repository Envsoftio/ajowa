<script setup lang="ts">
import type { AppShellType } from '~/shared/shell'

const props = defineProps<{
  shell?: AppShellType
}>()

const theme = useTheme()
const appStore = useAppStore()
const route = useRoute()
const shell = computed(() => props.shell ?? 'public')
const shellClass = computed(() => `app-shell--${shell.value}`)
const isCompactPublicShell = computed(() => shell.value === 'public' && route.meta.publicShell === 'compact')
const contentRef = ref<HTMLElement | null>(null)

watch(
  () => route.fullPath,
  () => {
    contentRef.value?.scrollTo({ top: 0, left: 0 })
  },
)
</script>

<template>
  <div
    :class="[
      'app-shell',
      theme.isDark.value ? 'app-theme-dark' : 'app-theme-light',
      shellClass,
      { 'app-shell--public-compact': isCompactPublicShell },
    ]"
  >
    <Toast />
    <ConfirmDialog />
    <AppNotificationListener />
    <div class="app-shell__layout">
      <AppSidebar :shell="shell" />
      <div class="app-frame">
        <AppTopbar :shell="shell" />
        <Drawer v-model:visible="appStore.sidebarOpen" position="left" class="app-mobile-drawer">
          <AppSidebar :shell="shell" />
        </Drawer>
        <main ref="contentRef" class="app-content">
          <AppBreadcrumb v-if="!isCompactPublicShell" :shell="shell" />
          <slot />
        </main>
        <footer v-if="!isCompactPublicShell" class="app-footer">
          <span>
            Developed by
            <a
              class="app-footer__link"
              href="https://envsoft.io"
              target="_blank"
              rel="noopener noreferrer"
            >
              Envsoft Solutions LLP
            </a>
          </span>
        </footer>
      </div>
    </div>
  </div>
</template>
