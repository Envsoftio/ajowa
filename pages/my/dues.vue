<script setup lang="ts">
definePageMeta({
  layout: 'resident',
  middleware: ['protected'],
  title: 'My Dues',
})

const authStore = useAuthStore()
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Resident" rounded />
      <h1>My Dues</h1>
      <p>
        Resident access is scoped through active flat relationships. Current access:
        {{ authStore.me?.flatAccess.map((item) => item.flatNumber).join(', ') || 'No active flats' }}.
      </p>
    </section>
  </div>
</template>
