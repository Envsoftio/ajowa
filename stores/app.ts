import { defineStore } from 'pinia'

export const useAppStore = defineStore('app', {
  state: () => ({
    sidebarOpen: false,
    desktopSidebarCollapsed: false,
  }),
  actions: {
    setSidebar(open: boolean) {
      this.sidebarOpen = open
    },
    toggleSidebar() {
      this.sidebarOpen = !this.sidebarOpen
    },
    closeSidebar() {
      this.sidebarOpen = false
    },
    toggleDesktopSidebar() {
      this.desktopSidebarCollapsed = !this.desktopSidebarCollapsed
      this.sidebarOpen = false
    },
  },
})
