<script setup lang="ts">
definePageMeta({
  layout: 'guard',
  middleware: ['protected'],
  title: 'Guard Scan',
})
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel">
      <Tag severity="contrast" value="Guard" rounded />
      <h1>Guard Scan Desk</h1>
      <p>
        Guard access is intentionally restricted to the scan desk route while Phase 4 authorization foundations are being built out.
      </p>
    </section>
  </div>
</template>
