<script setup lang="ts">
withDefaults(defineProps<{
  lines?: number
}>(), {
  lines: 3,
})
</script>

<template>
  <section class="app-skeleton-state surface-card" aria-hidden="true">
    <Skeleton width="10rem" height="1rem" />
    <Skeleton width="14rem" height="2rem" />
    <div class="app-skeleton-state__lines">
      <Skeleton
        v-for="line in lines"
        :key="line"
        width="100%"
        height="0.9rem"
      />
    </div>
  </section>
</template>
