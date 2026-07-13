<script setup lang="ts">
import { getApiErrorMessage } from '~/composables/useApi'
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
const toast = useToast()
const menu = ref()
const loggingOut = ref(false)

const firstCharacter = (value: string | null | undefined) => value?.trim().charAt(0).toUpperCase() || ''

const pageTitle = computed(() => String(route.meta.title ?? 'AJOWA'))
const userDisplayName = computed(() =>
  authStore.me?.user.fullName?.trim()
  || authStore.me?.authUser.name?.trim()
  || authStore.me?.user.email?.trim()
  || 'User',
)
const userInitial = computed(() => firstCharacter(userDisplayName.value) || 'U')
const userEmail = computed(() => authStore.me?.user.email?.trim() || '')
const avatarLabel = computed(() => `Open account menu for ${userDisplayName.value}`)
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

const logout = async () => {
  if (loggingOut.value) {
    return
  }

  loggingOut.value = true

  try {
    await authStore.logout()
    await navigateTo('/login')
  } catch (error) {
    toast.add({
      severity: 'error',
      summary: 'Logout failed',
      detail: getApiErrorMessage(error, 'Your session could not be signed out. Please try again.'),
      life: 10000,
    })
  } finally {
    loggingOut.value = false
  }
}

const avatarItems = computed<MenuItem[]>(() => {
  const items: MenuItem[] = [
    {
      label: userDisplayName.value,
      icon: 'pi pi-user',
      disabled: true,
    },
  ]

  if (userEmail.value && userEmail.value !== userDisplayName.value) {
    items.push({
      label: userEmail.value,
      icon: 'pi pi-envelope',
      disabled: true,
    })
  }

  items.push({
    separator: true,
  })

  if (notificationRoute.value) {
    items.push({
      label: 'Notifications',
      icon: 'pi pi-bell',
      command: openNotifications,
    })
  }

  items.push(
    {
      label: 'Logout',
      icon: 'pi pi-sign-out',
      disabled: loggingOut.value,
      command: logout,
    },
  )

  return items
})

const toggleMenu = (event: Event) => {
  menu.value?.toggle(event)
}

const isDesktopViewport = () => import.meta.client && window.matchMedia('(min-width: 769px)').matches

const toggleNavigation = () => {
  if (isDesktopViewport()) {
    appStore.toggleDesktopSidebar()
    return
  }

  appStore.toggleSidebar()
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
        @click="toggleNavigation"
      />
      <NuxtLink to="/" class="topbar-brand" aria-label="AJOWA home">
        <AppBrandLogo variant="mark" />
      </NuxtLink>
      <h2>{{ pageTitle }}</h2>
    </div>

    <div class="topbar-actions">
      <Button
        v-if="notificationRoute"
        class="topbar-icon-button topbar-notification-button"
        text
        rounded
        :pt="{
          root: {
            style: {
              overflow: 'visible',
            },
          },
        }"
        aria-label="Open notifications"
        title="Notifications"
        @click="openNotifications"
      >
        <template #default>
          <i class="pi pi-bell" aria-hidden="true" />
          <Badge v-if="notificationBadge" class="topbar-notification-badge" :value="notificationBadge" severity="warning" />
        </template>
      </Button>
      <Button
        :icon="theme.isDark.value ? 'pi pi-sun' : 'pi pi-moon'"
        :aria-label="theme.isDark.value ? 'Switch to light mode' : 'Switch to dark mode'"
        :title="theme.isDark.value ? 'Switch to light mode' : 'Switch to dark mode'"
        class="topbar-icon-button"
        severity="secondary"
        outlined
        @click="theme.toggle()"
      />
      <Button class="avatar-trigger" text rounded :aria-label="avatarLabel" :title="userDisplayName" @click="toggleMenu">
        <Avatar :label="userInitial" shape="circle" />
      </Button>
      <Menu ref="menu" :model="avatarItems" popup />
    </div>
  </header>
</template>
