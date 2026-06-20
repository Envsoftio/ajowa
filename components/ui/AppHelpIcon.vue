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
  width: 1.1rem;
  height: 1.1rem;
  border: 0;
  background: transparent;
  color: #bad6fe;
  cursor: help;
  font-size: 0.82rem;
  line-height: 1;
  border-radius: 999px;
  outline: none;
}

.app-help-icon .pi-info-circle,
.app-help-icon .pi-info-circle::before {
  color: inherit;
  font-size: inherit;
}

:global(.app-theme-dark) .app-help-icon {
  --app-help-tooltip-bg: #0f172a;
  --app-help-tooltip-text: #f8fafc;
  --app-help-tooltip-border: rgba(248, 250, 252, 0.22);

  border: 0;
  background: transparent;
  color: #bad6fe !important;
}

:global(.app-theme-dark) .app-help-icon .pi-info-circle,
:global(.app-theme-dark) .app-help-icon .pi-info-circle::before {
  color: #bad6fe !important;
  text-shadow: 0 1px 2px rgba(15, 23, 42, 0.55);
}

.app-help-icon:focus-visible {
  box-shadow: 0 0 0 3px rgba(100, 116, 139, 0.24);
}

:global(.app-theme-dark) .app-help-icon:focus-visible {
  box-shadow: 0 0 0 3px rgba(248, 250, 252, 0.22);
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
