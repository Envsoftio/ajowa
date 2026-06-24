<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'
import type { AppShellType } from '~/shared/shell'

defineProps<{
  shell: AppShellType
}>()

const appStore = useAppStore()
const authStore = useAuthStore()
const theme = useTheme()
const route = useRoute()
const loading = useLoadingIndicator()
const menu = ref()

const pageTitle = computed(() => String(route.meta.title ?? 'AJOWA'))
const isLoading = computed(() => loading.isLoading.value)
const userInitial = computed(() => authStore.me?.user.fullName?.charAt(0).toUpperCase() || 'A')
const userEmail = computed(() => authStore.me?.user.email || '')

const avatarItems = computed<MenuItem[]>(() => [
  {
    label: userEmail.value ? `Signed in as ${userEmail.value}` : 'Signed in',
    icon: userEmail.value ? 'pi pi-envelope' : 'pi pi-user',
    disabled: !userEmail.value,
  },
  {
    separator: true,
  },
  {
    label: 'Notifications',
    icon: 'pi pi-bell',
  },
  {
    label: 'Profile',
    icon: 'pi pi-user',
  },
  {
    label: 'Logout',
    icon: 'pi pi-sign-out',
    command: async () => {
      await authStore.logout()
      await navigateTo('/login')
    },
  },
])

const toggleMenu = (event: Event) => {
  menu.value?.toggle(event)
}
</script>

<template>
  <header class="app-topbar">
    <div class="topbar-heading">
      <Button
        class="topbar-menu-button"
        icon="pi pi-bars"
        rounded
        text
        aria-label="Toggle navigation"
        @click="appStore.toggleSidebar()"
      />
      <h2>{{ pageTitle }}</h2>
    </div>

    <div class="topbar-actions">
      <span
        class="topbar-loading"
        :data-loading="isLoading"
        aria-live="polite"
      >
        <span class="topbar-loading-dot" />
        {{ isLoading ? 'Loading' : 'Synced' }}
      </span>
      <Button severity="contrast" outlined>
        <template #default>
          Inbox
          <Badge value="3" severity="warning" />
        </template>
      </Button>
      <Button
        :label="theme.isDark.value ? 'Light Mode' : 'Dark Mode'"
        severity="secondary"
        outlined
        @click="theme.toggle()"
      />
      <Button class="avatar-trigger" text rounded aria-label="Open profile menu" @click="toggleMenu">
        <Avatar :label="userInitial" shape="circle" />
      </Button>
      <Menu ref="menu" :model="avatarItems" popup />
    </div>
  </header>
</template>
