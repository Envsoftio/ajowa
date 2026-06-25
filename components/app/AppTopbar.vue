<script setup lang="ts">
import type { MenuItem } from 'primevue/menuitem'
import type { AppShellType } from '~/shared/shell'

defineProps<{
  shell: AppShellType
}>()

const appStore = useAppStore()
const authStore = useAuthStore()
const notificationsStore = useNotificationsStore()
const theme = useTheme()
const route = useRoute()
const loading = useLoadingIndicator()
const menu = ref()

const pageTitle = computed(() => String(route.meta.title ?? 'AJOWA'))
const isLoading = computed(() => loading.isLoading.value)
const userInitial = computed(() => authStore.me?.user.fullName?.charAt(0).toUpperCase() || 'A')
const userEmail = computed(() => authStore.me?.user.email || '')
const notificationRoute = computed(() => {
  const role = authStore.me?.user.role

  if (role === 'ADMIN' || role === 'MANAGER') return '/admin/my-notifications'
  if (role === 'SERVICE_STAFF') return '/service/notifications'
  if (role === 'GUARD') return '/guard/notifications'
  if (role === 'RESIDENT') return '/my/notifications'

  return null
})
const notificationBadge = computed(() => {
  if (notificationsStore.unreadCount <= 0) return null
  return notificationsStore.unreadCount > 99 ? '99+' : String(notificationsStore.unreadCount)
})

const openNotifications = async () => {
  if (notificationRoute.value) {
    await navigateTo(notificationRoute.value)
  }
}

const avatarItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    {
      label: userEmail.value ? `Signed in as ${userEmail.value}` : 'Signed in',
      icon: userEmail.value ? 'pi pi-envelope' : 'pi pi-user',
      disabled: !userEmail.value,
    },
    {
      separator: true,
    },
  ]

  if (notificationRoute.value) {
    items.push({
      label: 'Notifications',
      icon: 'pi pi-bell',
      command: openNotifications,
    })
  }

  items.push(
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
  )

  return items
})

const toggleMenu = (event: Event) => {
  menu.value?.toggle(event)
}

onMounted(() => {
  notificationsStore.hydrateSoundPreference()
})
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
      <Button
        v-if="notificationRoute"
        class="topbar-icon-button topbar-notification-button"
        text
        rounded
        aria-label="Open notifications"
        title="Notifications"
        @click="openNotifications"
      >
        <template #default>
          <i class="pi pi-bell" aria-hidden="true" />
          <Badge v-if="notificationBadge" :value="notificationBadge" severity="warning" />
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
