<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Admin Dashboard',
})

const authStore = useAuthStore()
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Admin" rounded />
      <h1>Admin Dashboard</h1>
      <p>
        Signed in as {{ authStore.me?.user.fullName }}. This protected route confirms
        admin and manager landing enforcement is wired.
      </p>
    </section>
  </div>
</template>
