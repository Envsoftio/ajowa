<script setup lang="ts">
definePageMeta({
  layout: 'public',
  middleware: ['guest-only'],
  title: 'Sign Up Disabled',
})
</script>

<template>
  <section class="auth-page">
    <div class="auth-card">
      <AppBrandLogo class="auth-card__logo" />
      <Tag severity="warn" value="Admin Managed" rounded />
      <h1>Public sign-up is disabled</h1>
      <p>
        AJOWA access is provisioned by the society administrator. If you need an account,
        ask your admin to create and assign it for you.
      </p>

      <div class="auth-banner auth-banner-info">
        Residents, staff, guards, and managers must be onboarded by an authorized admin.
      </div>

      <div class="auth-links">
        <NuxtLink to="/login">Back to login</NuxtLink>
        <NuxtLink to="/forgot-password">Forgot password?</NuxtLink>
      </div>
    </div>
  </section>
</template>
