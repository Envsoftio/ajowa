<script setup lang="ts">
type LegalSection = {
  title: string
  intro?: string
  bullets?: string[]
}

defineProps<{
  eyebrow: string
  title: string
  intro: string
  sections: LegalSection[]
}>()
</script>

<template>
  <div class="landing-page legal-page">
    <section class="surface-card legal-header" aria-labelledby="legal-page-title">
      <div class="legal-header__content">
        <span class="public-hero__eyebrow">
          <i class="pi pi-file-edit" aria-hidden="true" />
          {{ eyebrow }}
        </span>
        <h1 id="legal-page-title">{{ title }}</h1>
        <p>{{ intro }}</p>
        <div class="legal-header__actions">
          <Button label="Back to home" icon="pi pi-home" as="a" href="/" />
        </div>
      </div>
    </section>

    <section
      v-for="section in sections"
      :key="section.title"
      class="surface-card legal-section"
    >
      <h2>{{ section.title }}</h2>
      <p v-if="section.intro">{{ section.intro }}</p>
      <ul v-if="section.bullets?.length" class="legal-list">
        <li v-for="bullet in section.bullets" :key="bullet">
          {{ bullet }}
        </li>
      </ul>
    </section>
  </div>
</template>
