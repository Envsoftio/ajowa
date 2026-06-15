<script setup lang="ts">
definePageMeta({
  layout: 'public',
  title: 'Forbidden',
})
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <Tag severity="danger" value="403" rounded />
      <h1>Permission denied</h1>
      <p>Your account is signed in, but this route or action is outside your current AJOWA access.</p>
      <div class="auth-actions">
        <NuxtLink class="auth-inline-link" to="/login">Back to login</NuxtLink>
      </div>
    </div>
  </section>
</template>
