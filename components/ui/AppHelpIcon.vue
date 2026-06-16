<script setup lang="ts">
defineProps<{
  text: string
}>()
</script>

<template>
  <span
    class="app-help-icon"
    tabindex="0"
    role="img"
    :aria-label="text"
    :data-help-text="text"
  >
    <i class="pi pi-info-circle" aria-hidden="true" />
  </span>
</template>

<style scoped>
.app-help-icon {
  --app-help-tooltip-bg: #1f2d3a;
  --app-help-tooltip-text: #ffffff;
  --app-help-tooltip-border: rgba(255, 255, 255, 0.12);

  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--color-info);
  cursor: help;
  line-height: 1;
  border-radius: 999px;
  outline: none;
}

:global(.app-theme-dark) .app-help-icon {
  --app-help-tooltip-bg: #f8fafc;
  --app-help-tooltip-text: #102030;
  --app-help-tooltip-border: rgba(15, 23, 42, 0.18);

  color: #93c5fd;
}

.app-help-icon:focus-visible {
  box-shadow: 0 0 0 3px rgba(29, 78, 216, 0.2);
}

.app-help-icon::before,
.app-help-icon::after {
  position: absolute;
  left: 50%;
  opacity: 0;
  pointer-events: none;
  transform: translate(-50%, 0.25rem);
  transition:
    opacity 0.15s ease,
    transform 0.15s ease;
  z-index: 30;
}

.app-help-icon::before {
  content: '';
  bottom: calc(100% + 0.25rem);
  border: 0.35rem solid transparent;
  border-top-color: var(--app-help-tooltip-bg);
}

.app-help-icon::after {
  content: attr(data-help-text);
  bottom: calc(100% + 0.9rem);
  width: max-content;
  max-width: min(18rem, 80vw);
  padding: 0.45rem 0.6rem;
  border: 1px solid var(--app-help-tooltip-border);
  border-radius: var(--radius-sm);
  background: var(--app-help-tooltip-bg);
  color: var(--app-help-tooltip-text);
  box-shadow: var(--shadow-lg);
  font-size: 0.78rem;
  font-weight: 600;
  line-height: 1.35;
  text-align: center;
  white-space: normal;
}

.app-help-icon:hover::before,
.app-help-icon:hover::after,
.app-help-icon:focus::before,
.app-help-icon:focus::after {
  opacity: 1;
  transform: translate(-50%, 0);
}
</style>
