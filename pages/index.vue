<script setup lang="ts">
const surfaceCards = [
  {
    title: 'Resident Experience',
    body: 'Billing, complaints, notices, and QR access are structured for touch-friendly PWA workflows.',
  },
  {
    title: 'Operations',
    body: 'Admin, manager, and service staff dashboards are ready for scoped workflows.',
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
      <h1>AJOWA Society Management System</h1>
      <p>
        Society operations, billing, resident access, and service workflows for the AJOWA residential community.
      </p>
      <div class="hero-actions">
        <Button label="Login" as="a" href="/login" />
        <Button label="Forgot Password" as="a" href="/forgot-password" severity="secondary" outlined />
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
