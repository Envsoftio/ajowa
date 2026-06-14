<script setup lang="ts">
const surfaceCards = [
  {
    title: 'Resident Experience',
    body: 'Billing, complaints, notices, and QR access are structured for touch-friendly PWA workflows.',
  },
  {
    title: 'Operations',
    body: 'Admin, manager, and service staff foundations are ready for scoped dashboards and workflows.',
  },
  {
    title: 'Delivery Guardrails',
    body: 'Strict runtime config, SSR, CI checks, and server-only secret handling are in place from the start.',
  },
]
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Phase 1 Foundation" rounded />
      <h1>AJOWA Society Management System</h1>
      <p>
        Nuxt 3, Nitro SSR, PrimeVue, Pinia, Better Auth, and Supabase foundations
        for the AJOWA residential community.
      </p>
      <div class="hero-actions">
        <Button label="Open Health Check" as="a" href="/api/health" />
        <Button label="Read Setup Guide" as="a" href="/setup" severity="secondary" outlined />
      </div>
    </section>

    <section class="surface-grid">
      <Card v-for="card in surfaceCards" :key="card.title" class="surface-card">
        <template #title>{{ card.title }}</template>
        <template #content>
          <p>{{ card.body }}</p>
        </template>
      </Card>
    </section>
  </div>
</template>
