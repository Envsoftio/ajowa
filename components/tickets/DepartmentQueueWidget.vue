<script setup lang="ts">
defineProps<{
  backlog: Array<{
    departmentId: string | null
    departmentName: string
    openCount: number
    overdueCount: number
  }>
}>()
</script>

<template>
  <section class="department-queue-widget">
    <article v-for="department in backlog" :key="department.departmentId || 'unassigned'">
      <div>
        <strong>{{ department.departmentName }}</strong>
        <span>{{ department.openCount }} open</span>
      </div>
      <Tag :severity="department.overdueCount > 0 ? 'danger' : 'success'" :value="`${department.overdueCount} overdue`" rounded />
    </article>
    <AppState
      v-if="backlog.length === 0"
      variant="empty"
      title="No backlog"
      message="Active department workload will appear here."
    />
  </section>
</template>

<style scoped>
.department-queue-widget {
  display: grid;
  gap: 0.65rem;
}

.department-queue-widget article {
  display: flex;
  justify-content: space-between;
  gap: 0.75rem;
  align-items: center;
  padding: 0.75rem;
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.department-queue-widget div {
  display: grid;
  gap: 0.15rem;
}

.department-queue-widget span {
  color: var(--color-muted);
  font-size: 0.85rem;
}
</style>
