<script setup lang="ts">
definePageMeta({
  layout: 'service-staff',
  middleware: ['protected'],
  title: 'Service Dashboard',
})

const authStore = useAuthStore()

const isLoading = computed(() => !authStore.loaded)
const displayName = computed(() => authStore.me?.user?.fullName || authStore.me?.authUser?.name || 'Team member')
const departments = computed(() => authStore.me?.departmentAssignments ?? [])
const flatAssignments = computed(() => authStore.me?.flatAccess ?? [])
const accessFlags = computed(() => [
  {
    label: 'Resident access',
    enabled: authStore.me?.access.hasResidentAccess ?? false,
    detail: 'Can access resident-facing data and permissions',
  },
  {
    label: 'Department access',
    enabled: authStore.me?.access.hasDepartmentAccess ?? false,
    detail: 'Can access department scoped actions',
  },
  {
    label: 'App access',
    enabled: authStore.me?.access.hasAppAccess ?? false,
    detail: 'General application authentication is active',
  },
])

const needsPasswordRefresh = computed(() => authStore.me?.access.requiresPasswordChange === true)

const summaryCards = computed(() => [
  {
    title: 'Department assignments',
    value: departments.value.length,
    detail:
      departments.value.length > 0
        ? departments.value.map((dept) => dept.departmentName).join(', ')
        : 'No departments assigned yet',
  },
  {
    title: 'Active role links',
    value: flatAssignments.value.length,
    detail:
      flatAssignments.value.length > 0
        ? flatAssignments.value.map((flat) => `${flat.blockName} ${flat.flatNumber}`).slice(0, 3).join(', ')
        : 'No flat links currently',
  },
  {
    title: 'Permission status',
    value: accessFlags.value.filter((item) => item.enabled).length,
    detail: `${accessFlags.value.filter((item) => item.enabled).length} of ${accessFlags.value.length} enabled`,
  },
  {
    title: 'Account state',
    value: needsPasswordRefresh.value ? 'Action needed' : 'Good',
    detail: needsPasswordRefresh.value ? 'Password reset recommended' : 'No security alerts',
  },
])

const refreshProfile = async () => {
  await authStore.fetchMe(true)
}
</script>

<template>
  <div class="landing-page">
    <section class="hero-panel dashboard-hero">
      <div>
        <Tag severity="warning" value="Service Console" rounded />
        <h1>Service dashboard</h1>
        <p>
          Welcome back, {{ displayName }}. Your dashboard now shows department context, permission status, and quick operational actions.
        </p>
      </div>
      <div class="hero-actions">
        <Button label="Refresh profile" icon="pi pi-refresh" severity="secondary" outlined @click="refreshProfile" />
        <Button label="Change password" icon="pi pi-key" as="a" href="/change-password" />
      </div>
    </section>

    <section class="surface-grid dashboard-kpis">
      <AppSkeletonState v-if="isLoading" v-for="item in 4" :key="`skeleton-${item}`" />
      <section v-else v-for="card in summaryCards" :key="card.title" class="surface-card">
        <p class="eyebrow">{{ card.title }}</p>
        <h3>{{ card.value }}</h3>
        <p>{{ card.detail }}</p>
      </section>
    </section>

    <section class="admin-two-column--wide">
      <section class="surface-card">
        <div class="service-panel__header">
          <div>
            <p class="eyebrow">Departments</p>
            <h2>Assigned departments</h2>
            <p>Primary department is highlighted for quick handoff routing.</p>
          </div>
        </div>
        <div class="service-chip-list">
          <AppState
            v-if="!isLoading && departments.length === 0"
            variant="empty"
            title="No departments"
            message="Please ask an admin to assign departments to unlock routing features."
          />
          <Tag
            v-else-if="!isLoading"
            v-for="department in departments"
            :key="department.id"
            :severity="department.isPrimary ? 'success' : 'secondary'"
            :value="`${department.departmentCode} · ${department.departmentName}`"
            rounded
          />
        </div>
      </section>

      <section class="surface-card">
        <div class="service-panel__header">
          <div>
            <p class="eyebrow">Access controls</p>
            <h2>Live permission checks</h2>
            <p>Only effective permissions are shown in this workspace.</p>
          </div>
        </div>
        <div class="service-access-list">
          <article v-for="access in accessFlags" :key="access.label" class="service-access-row">
            <div>
              <strong>{{ access.label }}</strong>
              <p>{{ access.detail }}</p>
            </div>
            <AppStatusBadge :status="access.enabled ? 'active' : 'inactive'" />
          </article>
        </div>
      </section>
    </section>

    <section class="admin-two-column">
      <section class="surface-card">
        <div class="service-panel__header">
          <div>
            <p class="eyebrow">Quick links</p>
            <h2>Action rail</h2>
            <p>Use these primary links during operations.</p>
          </div>
        </div>
        <div class="dashboard-action-grid">
          <Button label="Security settings" icon="pi pi-lock" as="a" href="/change-password" outlined />
          <Button label="Flat access list" icon="pi pi-building" disabled outlined />
          <Button label="Resident support (soon)" icon="pi pi-ticket" disabled />
          <Button label="Service report (soon)" icon="pi pi-flag" disabled severity="secondary" outlined />
        </div>
      </section>

      <section class="surface-card">
        <div class="service-panel__header">
          <div>
            <p class="eyebrow">Flat visibility</p>
            <h2>Assigned flat links</h2>
            <p>Keep this list for quick handoff during shifts.</p>
          </div>
        </div>
        <div class="service-access-list">
          <article v-for="flat in flatAssignments" :key="flat.id" class="service-access-row">
            <div>
              <strong>{{ flat.blockName }} {{ flat.flatNumber }}</strong>
              <p>{{ flat.relationshipType }} · {{ flat.occupancyStatus || 'No status' }}</p>
            </div>
            <span>{{ flat.isPrimaryContact ? 'Primary' : flat.isBillingContact ? 'Billing' : 'Secondary' }}</span>
          </article>
          <AppState
            v-if="flatAssignments.length === 0 && !isLoading"
            variant="empty"
            title="No flat links"
            message="No flat relationships are attached to this account yet."
          />
        </div>
      </section>
    </section>
  </div>
</template>

<style scoped>
.dashboard-hero h1 {
  margin: 0.8rem 0 0.5rem;
  font-family: var(--font-display);
}

.dashboard-kpis .surface-card {
  min-height: 7.2rem;
}

.service-panel__header {
  display: flex;
  justify-content: space-between;
  gap: 1rem;
  align-items: flex-start;
  flex-wrap: wrap;
}

.service-chip-list {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
  margin-top: 1rem;
}

.service-access-list {
  display: grid;
  gap: 0.65rem;
  margin-top: 1rem;
}

.service-access-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 0.75rem;
  align-items: center;
  border: 1px solid var(--color-border);
  border-radius: var(--radius-md);
  padding: 0.85rem 1rem;
  background: var(--color-surface-strong);
}

.service-access-row strong,
.service-access-row p {
  margin: 0;
}

.service-access-row p {
  color: var(--color-muted);
}

.dashboard-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
  margin-top: 1rem;
}

@media (max-width: 768px) {
  .dashboard-action-grid {
    grid-template-columns: 1fr;
    gap: 0.75rem;
  }
}
</style>
