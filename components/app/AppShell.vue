<script setup lang="ts">
import type { AppNavItem, AppShellType } from '~/shared/shell'
import { canUserAccessRoute } from '~/shared/auth'
import { shellNavigation } from '~/shared/shell'

const props = defineProps<{
  shell?: AppShellType
}>()

const theme = useTheme()
const appStore = useAppStore()
const authStore = useAuthStore()
const route = useRoute()
const shell = computed(() => props.shell ?? 'public')
const shellClass = computed(() => `app-shell--${shell.value}`)
const isCompactPublicShell = computed(() => shell.value === 'public' && route.meta.publicShell === 'compact')
const contentRef = ref<HTMLElement | null>(null)
const residentMobileNavRoutes = new Set(['/my/dues', '/my/receipts', '/my/notices', '/my/qr'])

const getPathname = (value: string) => value.split(/[?#]/)[0] || '/'

const canShowResidentNavItem = (item: AppNavItem) => {
  const me = authStore.me

  return !me || canUserAccessRoute(item.to, me.user)
}

const residentMobileNavItems = computed(() =>
  shellNavigation.resident
    .flatMap((group) => group.items)
    .filter((item) => residentMobileNavRoutes.has(getPathname(item.to)))
    .filter(canShowResidentNavItem),
)

const showResidentMobileNav = computed(() => shell.value === 'resident' && residentMobileNavItems.value.length > 0)

const isResidentNavItemActive = (item: AppNavItem) => {
  const pathname = getPathname(item.to)

  return route.path === pathname || route.path.startsWith(`${pathname}/`)
}

const getResidentMobileLabel = (item: AppNavItem) =>
  item.label.replace(/^My\s+/i, '').replace(/\s+Access$/i, '')

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
      { 'app-shell--sidebar-collapsed': appStore.desktopSidebarCollapsed },
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
          <span class="app-footer__content">
            Developed by
            <a
              class="app-footer__link"
              href="https://envsoft.io?utm_source=ajowa&utm_medium=footer"
              target="_blank"
              rel="noopener noreferrer"
            >
              Envsoft Solutions LLP
            </a>
            and
            <a
              class="app-footer__link"
              href="https://proctorplus.io?utm_source=ajowa&utm_medium=footer"
              target="_blank"
              rel="noopener noreferrer"
            >
              Proctor+
            </a>
            <!-- <template v-if="shell === 'public'">
              <span class="app-footer__separator">|</span>
              <NuxtLink class="app-footer__link" to="/policy">
                Policy
              </NuxtLink>
              <span class="app-footer__separator">|</span>
              <NuxtLink class="app-footer__link" to="/refund-policy">
                Refund Policy
              </NuxtLink>
              <span class="app-footer__separator">|</span>
              <NuxtLink class="app-footer__link" to="/terms-and-conditions">
                Terms &amp; Conditions
              </NuxtLink>
            </template> -->
          </span>
        </footer>
        <nav
          v-if="showResidentMobileNav"
          class="resident-mobile-nav"
          aria-label="Resident quick navigation"
        >
          <NuxtLink
            v-for="item in residentMobileNavItems"
            :key="item.to"
            :to="item.to"
            class="resident-mobile-nav__item"
            :class="{ 'is-active': isResidentNavItemActive(item) }"
            :aria-current="isResidentNavItemActive(item) ? 'page' : undefined"
          >
            <i :class="item.icon" aria-hidden="true" />
            <span>{{ getResidentMobileLabel(item) }}</span>
          </NuxtLink>
          <button
            type="button"
            class="resident-mobile-nav__item resident-mobile-nav__item--menu"
            :class="{ 'is-active': appStore.sidebarOpen }"
            aria-label="Open full menu"
            @click="appStore.setSidebar(true)"
          >
            <i class="pi pi-ellipsis-h" aria-hidden="true" />
            <span>More</span>
          </button>
        </nav>
      </div>
    </div>
  </div>
</template>
