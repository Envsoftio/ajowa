<script setup lang="ts">
import type { PaginatedResponse } from '~/types/api'
import type { FlatSummary } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Web Push Test',
})

type WebPushDebugSubscription = {
  id: string
  endpointHost: string
  endpointPreview: string
  deviceLabel: string | null
  browserName: string | null
  platform: string | null
  status: string
  lastSeenAt: string | null
  lastError: string | null
  revokedAt: string | null
  createdAt: string
  updatedAt: string
}

type WebPushDebugOwner = {
  id: string
  fullName: string
  email: string | null
  mobileNumber: string | null
  preferredNotificationChannels: string
  notificationPushEnabled: boolean
  userActive: boolean
  canLogin: boolean
  relationshipActive: boolean
  isPrimaryContact: boolean
  isBillingContact: boolean
  preferencePushEnabled: boolean | null
  preferencePauseUntil: string | null
  preferencePaused: boolean
  subscriptions: WebPushDebugSubscription[]
  activeSubscriptionCount: number
  normalFlowEligible: boolean
  normalFlowEligibilityReasons: string[]
}

type WebPushDiagnostics = {
  provider: {
    enabled: boolean
    reason: string | null
  }
  manualBroadcastPushSetting: {
    eventKey: string
    configured: boolean
    pushEnabled: boolean
    paused: boolean
    pauseUntil: string | null
  }
  flat: {
    id: string
    label: string
    isActive: boolean
  } | null
  owners: WebPushDebugOwner[]
}

type WebPushTestResponse = {
  attempted: boolean
  flat: WebPushDiagnostics['flat']
  owner: WebPushDebugOwner
  diagnostics: WebPushDiagnostics
  result: {
    ok: boolean
    providerName: string
    providerMessageId: string | null
    reason: string | null
    responseBody: Record<string, unknown>
    permanentFailure: boolean
  }
}

const api = useApi()
const toast = useToast()
const diagnostics = ref<WebPushDiagnostics | null>(null)
const lastResult = ref<WebPushTestResponse | null>(null)
const loadingDiagnostics = ref(false)
const sending = ref(false)
const form = reactive({
  flatId: null as string | null,
  ownerUserId: null as string | null,
  title: 'AJOWA Web Push test',
  body: 'This is a Web Push test for the selected flat owner.',
  deepLinkUrl: '/my/notifications',
  respectNormalFlow: true,
})

const { data: flatsData } = await useAsyncData('admin-web-push-test-flats', () =>
  api<PaginatedResponse<FlatSummary>>('/api/admin/flats', {
    query: {
      page: 1,
      pageSize: 2000,
      sortBy: 'flatNumber',
      sortDirection: 'asc',
      'filters[isActive]': 'true',
    },
  }),
)

const flatOptions = computed(() =>
  (flatsData.value?.data.items ?? []).map((flat) => ({
    label: `${flat.blockName} ${flat.flatNumber}`,
    value: flat.id,
  })),
)

const ownerOptions = computed(() =>
  (diagnostics.value?.owners ?? []).map((owner) => ({
    label: `${owner.fullName} - ${owner.activeSubscriptionCount} active push`,
    value: owner.id,
  })),
)

const selectedOwner = computed(() =>
  (diagnostics.value?.owners ?? []).find((owner) => owner.id === form.ownerUserId) ?? null,
)

const selectedOwnerHardStop = computed(() => {
  const owner = selectedOwner.value
  if (!owner) return null
  if (!owner.userActive) return 'The owner user account is inactive.'
  if (!owner.canLogin) return 'The owner user account cannot log in.'
  if (!owner.relationshipActive) return 'The owner relationship for this flat is inactive.'
  return null
})

const canSend = computed(() =>
  Boolean(
    form.flatId &&
      selectedOwner.value &&
      !selectedOwnerHardStop.value &&
      form.title.trim().length >= 3 &&
      form.body.trim().length >= 3,
  ),
)

const sendButtonLabel = computed(() =>
  form.respectNormalFlow ? 'Send normal-flow test' : 'Send direct Web Push',
)

const providerSeverity = computed(() => diagnostics.value?.provider.enabled ? 'success' : 'danger')

const pushSettingSeverity = computed(() => {
  const setting = diagnostics.value?.manualBroadcastPushSetting
  if (!setting) return 'secondary'
  if (!setting.pushEnabled || setting.paused) return 'warn'
  return 'success'
})

const chooseDefaultOwnerId = (owners: WebPushDebugOwner[]) =>
  owners.find((owner) => owner.normalFlowEligible)?.id ??
  owners.find((owner) => owner.activeSubscriptionCount > 0)?.id ??
  owners[0]?.id ??
  null

const loadDiagnostics = async () => {
  lastResult.value = null

  if (!form.flatId) {
    diagnostics.value = null
    form.ownerUserId = null
    return
  }

  loadingDiagnostics.value = true
  try {
    const response = await api<{ ok: true; data: WebPushDiagnostics }>('/api/admin/notifications/web-push-test', {
      query: { flatId: form.flatId },
    })
    diagnostics.value = response.data

    if (!response.data.owners.some((owner) => owner.id === form.ownerUserId)) {
      form.ownerUserId = chooseDefaultOwnerId(response.data.owners)
    }
  } finally {
    loadingDiagnostics.value = false
  }
}

watch(() => form.flatId, loadDiagnostics)

const sendTest = async () => {
  if (!form.flatId || !selectedOwner.value) {
    return
  }

  sending.value = true
  try {
    const response = await api<{ ok: true; data: WebPushTestResponse }>('/api/admin/notifications/web-push-test', {
      method: 'POST',
      body: {
        flatId: form.flatId,
        ownerUserId: selectedOwner.value.id,
        title: form.title,
        body: form.body,
        deepLinkUrl: form.deepLinkUrl,
        respectNormalFlow: form.respectNormalFlow,
      },
    })
    diagnostics.value = response.data.diagnostics
    form.ownerUserId = response.data.owner.id
    lastResult.value = response.data
    toast.add({
      severity: response.data.result.ok ? 'success' : 'warn',
      summary: response.data.result.ok ? 'Web Push sent' : 'Web Push not sent',
      detail: response.data.result.reason ?? `${response.data.result.providerName} accepted the test request.`,
      life: 10000,
    })
  } finally {
    sending.value = false
  }
}

const ownerSeverity = (owner: WebPushDebugOwner) => {
  if (owner.normalFlowEligible) return 'success'
  if (owner.activeSubscriptionCount > 0) return 'warn'
  return 'danger'
}

const subscriptionSeverity = (status: string) => {
  if (status === 'ACTIVE') return 'success'
  if (status === 'EXPIRED') return 'danger'
  if (status === 'REVOKED') return 'secondary'
  return 'warn'
}

const formatDateTime = (value: string | null) => value ?? '-'
const formatJson = (value: unknown) => JSON.stringify(value ?? {}, null, 2)
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Web Push test</h1>
          <p>Temporary flat-owner delivery diagnostics.</p>
        </div>
        <Button
          :label="sendButtonLabel"
          icon="pi pi-send"
          :loading="sending"
          :disabled="!canSend || loadingDiagnostics"
          @click="sendTest"
        />
      </header>

      <div class="web-push-test__toolbar">
        <Select
          v-model="form.flatId"
          :options="flatOptions"
          option-label="label"
          option-value="value"
          filter
          placeholder="Select flat"
          class="web-push-test__control"
        />
        <Select
          v-model="form.ownerUserId"
          :options="ownerOptions"
          option-label="label"
          option-value="value"
          :disabled="!diagnostics || diagnostics.owners.length === 0"
          placeholder="Select owner"
          class="web-push-test__control"
        />
        <Button
          icon="pi pi-refresh"
          label="Refresh"
          severity="secondary"
          outlined
          :loading="loadingDiagnostics"
          :disabled="!form.flatId"
          @click="loadDiagnostics"
        />
      </div>

      <div class="web-push-test__settings">
        <InputText v-model="form.title" placeholder="Push title" />
        <InputText v-model="form.deepLinkUrl" placeholder="Deep link" />
        <Textarea v-model="form.body" rows="3" placeholder="Push body" />
        <div class="web-push-test__toggle">
          <ToggleSwitch v-model="form.respectNormalFlow" />
          <span>Respect normal notification gates</span>
        </div>
      </div>

      <div v-if="diagnostics" class="web-push-test__summary">
        <Tag
          :value="diagnostics.provider.enabled ? 'Provider enabled' : 'Provider disabled'"
          :severity="providerSeverity"
        />
        <Tag
          :value="diagnostics.manualBroadcastPushSetting.pushEnabled ? 'Manual push enabled' : 'Manual push disabled'"
          :severity="pushSettingSeverity"
        />
        <Tag
          v-if="diagnostics.manualBroadcastPushSetting.paused"
          value="Manual push paused"
          severity="warn"
        />
        <Tag
          v-if="diagnostics.flat"
          :value="diagnostics.flat.isActive ? `${diagnostics.flat.label} active` : `${diagnostics.flat.label} inactive`"
          :severity="diagnostics.flat.isActive ? 'success' : 'warn'"
        />
      </div>

      <div v-if="diagnostics?.provider.reason" class="web-push-test__notice">
        {{ diagnostics.provider.reason }}
      </div>

      <div v-if="selectedOwner" class="web-push-test__owner">
        <div class="web-push-test__owner-header">
          <div>
            <h2>{{ selectedOwner.fullName }}</h2>
            <p>{{ selectedOwner.email || selectedOwner.mobileNumber || selectedOwner.id }}</p>
          </div>
          <Tag
            :value="selectedOwner.normalFlowEligible ? 'Normal flow ready' : 'Normal flow blocked'"
            :severity="ownerSeverity(selectedOwner)"
          />
        </div>

        <div class="web-push-test__facts">
          <span>Preset: {{ selectedOwner.preferredNotificationChannels }}</span>
          <span>Profile push: {{ selectedOwner.notificationPushEnabled ? 'enabled' : 'disabled' }}</span>
          <span>Category push: {{ selectedOwner.preferencePushEnabled === false ? 'disabled' : 'enabled' }}</span>
          <span>Active subscriptions: {{ selectedOwner.activeSubscriptionCount }}</span>
        </div>

        <ul v-if="selectedOwner.normalFlowEligibilityReasons.length" class="web-push-test__reasons">
          <li v-for="reason in selectedOwner.normalFlowEligibilityReasons" :key="reason">
            {{ reason }}
          </li>
        </ul>
        <p v-if="selectedOwnerHardStop" class="web-push-test__notice">
          {{ selectedOwnerHardStop }}
        </p>
      </div>

      <AppDataTable
        :value="selectedOwner?.subscriptions ?? []"
        :loading="loadingDiagnostics"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column field="status" header="Status">
          <template #body="{ data: row }">
            <Tag :value="row.status" :severity="subscriptionSeverity(row.status)" />
          </template>
        </Column>
        <Column field="endpointHost" header="Endpoint" />
        <Column field="deviceLabel" header="Device" />
        <Column field="browserName" header="Browser" />
        <Column field="platform" header="Platform" />
        <Column field="lastSeenAt" header="Last seen">
          <template #body="{ data: row }">{{ formatDateTime(row.lastSeenAt) }}</template>
        </Column>
        <Column field="lastError" header="Last error">
          <template #body="{ data: row }">{{ row.lastError || '-' }}</template>
        </Column>
      </AppDataTable>

      <div v-if="lastResult" class="web-push-test__result">
        <div class="web-push-test__owner-header">
          <div>
            <h2>{{ lastResult.result.ok ? 'Provider accepted' : 'Provider rejected' }}</h2>
            <p>{{ lastResult.attempted ? lastResult.result.providerName : 'Not attempted' }}</p>
          </div>
          <Tag
            :value="lastResult.result.ok ? 'Sent' : 'Failed'"
            :severity="lastResult.result.ok ? 'success' : 'danger'"
          />
        </div>
        <p v-if="lastResult.result.reason" class="web-push-test__notice">
          {{ lastResult.result.reason }}
        </p>
        <pre>{{ formatJson(lastResult.result.responseBody) }}</pre>
      </div>
    </section>
  </div>
</template>

<style scoped>
.web-push-test__toolbar,
.web-push-test__settings,
.web-push-test__summary,
.web-push-test__facts {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: center;
}

.web-push-test__toolbar,
.web-push-test__settings {
  margin-bottom: 1rem;
}

.web-push-test__control {
  min-width: min(100%, 18rem);
}

.web-push-test__settings :deep(.p-inputtext),
.web-push-test__settings :deep(.p-textarea) {
  min-width: min(100%, 18rem);
}

.web-push-test__settings :deep(.p-textarea) {
  flex: 1 1 24rem;
}

.web-push-test__toggle,
.web-push-test__owner-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.web-push-test__owner,
.web-push-test__result {
  margin-top: 1rem;
  padding-top: 1rem;
  border-top: 1px solid var(--surface-border);
}

.web-push-test__owner-header {
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 0.75rem;
}

.web-push-test__owner-header h2 {
  margin: 0;
  font-size: 1.15rem;
}

.web-push-test__owner-header p,
.web-push-test__notice {
  margin: 0.25rem 0 0;
  color: var(--text-color-secondary);
}

.web-push-test__facts span {
  padding: 0.35rem 0.55rem;
  border: 1px solid var(--surface-border);
  border-radius: 6px;
  font-size: 0.9rem;
}

.web-push-test__reasons {
  margin: 0.75rem 0 0;
  padding-left: 1.25rem;
  color: var(--text-color-secondary);
}

.web-push-test__notice {
  width: 100%;
}

.web-push-test__result pre {
  max-height: 18rem;
  overflow: auto;
  padding: 0.75rem;
  border-radius: 6px;
  background: var(--surface-ground);
  font-size: 0.85rem;
  white-space: pre-wrap;
  word-break: break-word;
}
</style>
