<script setup lang="ts">
definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Service Dashboard',
})

const authStore = useAuthStore()
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Service Staff" rounded />
      <h1>Service Dashboard</h1>
      <p>
        Active departments:
        {{ authStore.me?.departmentAssignments.map((item) => item.departmentName).join(', ') || 'No department assignments' }}.
      </p>
    </section>
  </div>
</template>
