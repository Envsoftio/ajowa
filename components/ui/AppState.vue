<script setup lang="ts">
const props = withDefaults(defineProps<{
  title: string
  message: string
  variant?: 'loading' | 'empty' | 'error' | 'permission'
  actionLabel?: string
  icon?: string
}>(), {
  variant: 'empty',
  actionLabel: '',
  icon: '',
})

defineEmits<{
  retry: []
}>()

const iconClass = computed(() => {
  if (props.icon) {
    return props.icon
  }

  return {
    loading: 'pi pi-spin pi-spinner',
    empty: 'pi pi-inbox',
    error: 'pi pi-exclamation-circle',
    permission: 'pi pi-lock',
  }[props.variant]
})
</script>

<template>
  <section class="app-state" :data-variant="variant">
    <ProgressSpinner v-if="variant === 'loading'" stroke-width="4" />
    <i v-else :class="['app-state__icon', iconClass]" aria-hidden="true" />
    <h3>{{ title }}</h3>
    <p>{{ message }}</p>
    <Button
      v-if="actionLabel"
      :label="actionLabel"
      severity="secondary"
      outlined
      @click="$emit('retry')"
    />
  </section>
</template>
