<script setup lang="ts">
definePageMeta({
  middleware: ['guest-only'],
  title: 'Welcome',
})

const heroSignals = [
  {
    icon: 'pi pi-wallet',
    label: 'CAM dues',
  },
  {
    icon: 'pi pi-qrcode',
    label: 'QR gate access',
  },
  {
    icon: 'pi pi-ticket',
    label: 'Service tickets',
  },
]

const focusItems = [
  {
    icon: 'pi pi-receipt',
    title: 'Billing clarity',
    body: 'Bills, receipts, periods, waivers, and shared reports stay tied to each flat and workflow.',
  },
  {
    icon: 'pi pi-megaphone',
    title: 'Community updates',
    body: 'Notices, notifications, and resident alerts are organized around the people who need them.',
  },
  {
    icon: 'pi pi-shield',
    title: 'Controlled access',
    body: 'Resident QR passes and guard scanning create a cleaner entry log for daily movement.',
  },
]

const roleCards = [
  {
    icon: 'pi pi-home',
    title: 'Residents',
    body: 'Check dues, download receipts, read notices, raise service requests, and manage access from a mobile-friendly portal.',
  },
  {
    icon: 'pi pi-building',
    title: 'Admins and managers',
    body: 'Run society records, billing cycles, finance entries, notices, staff, departments, and reports from scoped workspaces.',
  },
  {
    icon: 'pi pi-id-card',
    title: 'Gate and service teams',
    body: 'Scan resident passes, manage entry context, pick up assigned tickets, and keep service queues moving.',
  },
]
</script>

<template>
  <div class="landing-page public-landing">
    <section class="public-hero" aria-labelledby="public-hero-title">
      <div class="public-hero__content">
        <AppBrandLogo class="public-hero__logo" />
        <span class="public-hero__eyebrow">
          <i class="pi pi-building" aria-hidden="true" />
          Resident operations portal
        </span>
        <h1 id="public-hero-title">AJOWA Society Management System</h1>
        <p>
          A calmer workspace for residential billing, resident support, notices,
          gate access, and service coordination.
        </p>

        <div class="hero-actions public-hero__actions">
          <Button label="Login" icon="pi pi-sign-in" as="a" href="/login" />
          <Button
            label="Forgot Password"
            icon="pi pi-key"
            as="a"
            href="/forgot-password"
            severity="secondary"
            outlined
          />
        </div>

        <div class="public-hero__signals" aria-label="Core workflows">
          <span
            v-for="signal in heroSignals"
            :key="signal.label"
            class="public-hero__signal"
          >
            <i :class="signal.icon" aria-hidden="true" />
            {{ signal.label }}
          </span>
        </div>
      </div>
    </section>

    <section class="landing-focus-strip" aria-label="Operational focus">
      <article
        v-for="item in focusItems"
        :key="item.title"
        class="landing-focus-item"
      >
        <span class="landing-focus-item__icon">
          <i :class="item.icon" aria-hidden="true" />
        </span>
        <div>
          <h2>{{ item.title }}</h2>
          <p>{{ item.body }}</p>
        </div>
      </article>
    </section>

    <section class="surface-grid public-role-grid" aria-label="Workspaces">
      <article
        v-for="card in roleCards"
        :key="card.title"
        class="surface-card public-role-card"
      >
        <span class="public-role-card__icon">
          <i :class="card.icon" aria-hidden="true" />
        </span>
        <h2>{{ card.title }}</h2>
        <p>{{ card.body }}</p>
      </article>
    </section>
  </div>
</template>
