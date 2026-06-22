<script setup lang="ts">
import type { ResidentDetail } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Resident Detail',
})

type ResidentAction =
  | 'SEND_INVITE'
  | 'RESEND_INVITE'
  | 'DEACTIVATE_LOGIN'
  | 'RESET_ONBOARDING'

type DocumentField =
  | 'profileImagePath'
  | 'governmentIdDocumentPath'
  | 'ownershipProofPath'
  | 'leaseAgreementPath'

const route = useRoute()
const router = useRouter()
const api = useApi()
const toast = useToast()
const { formatMoney, formatDate, formatDateTime } = useFinanceFormatters()

const residentId = computed(() => String(route.params.id))

const { data, pending, error, refresh } = await useAsyncData(
  () => `admin-resident-${residentId.value}`,
  () => api<{ ok: true; data: ResidentDetail }>(`/api/admin/residents/${residentId.value}`),
  { watch: [residentId] },
)

const resident = computed(() => data.value?.data ?? null)
const runningAction = ref<ResidentAction | ''>('')
const displayValue = (value: string | null | undefined) => value || '-'
const relationshipSeverity = (type: string) => {
  if (type === 'OWNER') return 'success'
  if (type === 'TENANT') return 'info'
  return 'secondary'
}
const displayRelationshipNote = (note: string | null | undefined) => {
  const trimmed = note?.trim()

  if (!trimmed) {
    return null
  }

  const normalized = trimmed.toLowerCase()

  if (normalized.startsWith('imported from workbook') || normalized.startsWith('tenant imported from workbook')) {
    return null
  }

  return trimmed
}
const statusSeverity = (status: string | null | undefined) => {
  if (!status) return 'secondary'
  if (['PAID', 'VERIFIED', 'RESOLVED', 'CLOSED', 'ALLOWED', 'ACTIVE'].includes(status)) return 'success'
  if (['OPEN', 'PARTIALLY_PAID', 'PENDING_VERIFICATION', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS'].includes(status)) return 'info'
  if (['OVERDUE', 'FAILED', 'REJECTED', 'DENIED', 'CANCELLED'].includes(status)) return 'danger'
  return 'secondary'
}

const initials = computed(() =>
  (resident.value?.fullName ?? 'Resident')
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join(''),
)

const fileUrl = (field: DocumentField) => {
  const value = resident.value?.[field]

  if (!value) {
    return ''
  }

  if (/^(data:|https?:\/\/)/.test(value)) {
    return value
  }

  return `/api/admin/residents/${residentId.value}/files/${field}`
}

const profileImageSrc = computed(() => fileUrl('profileImagePath'))
const displayEmail = computed(() => resident.value?.email ?? resident.value?.sourceEmail ?? null)
const displayMobile = computed(() => resident.value?.mobileNumber ?? resident.value?.sourceContact ?? null)
const contactLine = computed(() => {
  const parts = [displayEmail.value, displayMobile.value].filter(Boolean)
  return parts.length > 0 ? parts.join(' · ') : 'No contact details on record'
})
const hasLoginIdentity = computed(() => Boolean(resident.value?.authUserId && resident.value?.email))

const relationshipTypes = computed(() => {
  const types = resident.value?.relationships.map((relationship) => relationship.relationshipType) ?? []
  return Array.from(new Set(types))
})

const relationshipFlatNumbers = computed(() => {
  const flatNumbers = resident.value?.relationships
    .map((relationship) => relationship.flatNumber)
    .filter((flatNumber): flatNumber is string => Boolean(flatNumber)) ?? []

  return Array.from(new Set(flatNumbers))
})

const loginStatus = computed(() => {
  if (!resident.value?.isActive) return 'inactive'
  if (!hasLoginIdentity.value) return 'inactive'
  if (!resident.value.canLogin) return 'inactive'
  if (!resident.value.emailVerified) return 'pending'
  return 'active'
})

const linkedFlatLabel = (relationship: ResidentDetail['relationships'][number]) =>
  [relationship.blockName, relationship.flatNumber].filter(Boolean).join(' · ') || relationship.flatId

const relationshipSummary = computed(() => {
  const relationships = resident.value?.relationships ?? []

  return {
    total: relationships.length,
    active: relationships.filter((item) => item.isActive).length,
    billing: relationships.filter((item) => item.isBillingContact).length,
    primary: relationships.filter((item) => item.isPrimaryContact).length,
  }
})

const financialSummary = computed(() => {
  const dues = resident.value?.dues ?? []
  const payments = resident.value?.payments ?? []

  return {
    dueBalance: dues.reduce((sum, due) => sum + due.balanceAmount, 0),
    dueTotal: dues.reduce((sum, due) => sum + due.totalAmount, 0),
    paidTotal: dues.reduce((sum, due) => sum + due.paidAmount, 0),
    paymentTotal: payments.reduce((sum, payment) => sum + payment.amount, 0),
  }
})

const requestSummary = computed(() => {
  const requests = resident.value?.serviceRequests ?? []
  const openStatuses = new Set(['OPEN', 'ASSIGNED', 'ACKNOWLEDGED', 'IN_PROGRESS', 'ON_HOLD', 'REOPENED', 'NEEDS_REASSIGNMENT'])

  return {
    total: requests.length,
    open: requests.filter((request) => openStatuses.has(request.status)).length,
    overdue: requests.filter((request) => request.isSlaBreached).length,
  }
})

const flatLabel = (item: { blockName?: string | null; flatNumber?: string | null }) =>
  [item.blockName, item.flatNumber].filter(Boolean).join(' · ') || item.flatNumber || '-'

const documentItems = computed(() => {
  const current = resident.value

  return [
    {
      field: 'governmentIdDocumentPath' as const,
      label: 'Government ID',
      icon: 'pi pi-id-card',
      value: current?.governmentIdDocumentPath,
      detail: current?.governmentIdType || 'Identity document',
    },
    {
      field: 'ownershipProofPath' as const,
      label: 'Ownership proof',
      icon: 'pi pi-home',
      value: current?.ownershipProofPath,
      detail: 'Flat ownership record',
    },
    {
      field: 'leaseAgreementPath' as const,
      label: 'Lease agreement',
      icon: 'pi pi-file-pdf',
      value: current?.leaseAgreementPath,
      detail: 'Tenancy record',
    },
  ]
})

const runAction = async (action: ResidentAction) => {
  runningAction.value = action

  try {
    await api(`/api/admin/residents/${residentId.value}/actions`, {
      method: 'POST',
      body: { action },
    })

    toast.add({
      severity: 'success',
      summary: 'Action completed',
      detail: action.replaceAll('_', ' ').toLowerCase(),
      life: 10000,
    })
    await refresh()
  } finally {
    runningAction.value = ''
  }
}
</script>

<template>
  <div class="landing-page resident-detail-page">
    <AppState
      v-if="pending"
      variant="loading"
      title="Loading resident"
      message="Fetching resident profile."
    />

    <AppState
      v-else-if="error || !resident"
      variant="error"
      title="Resident not found"
      message="The selected resident record is unavailable."
      action-label="Back to residents"
      @retry="router.push('/admin/residents')"
    />

    <template v-else>
      <section class="hero-panel resident-detail-hero">
        <div class="resident-detail-identity">
          <div class="resident-avatar resident-avatar--large">
            <img v-if="profileImageSrc" :src="profileImageSrc" :alt="resident.fullName">
            <span v-else>{{ initials }}</span>
          </div>
          <div>
            <div class="resident-detail-tags">
              <Tag
                v-for="type in relationshipTypes"
                :key="type"
                :severity="relationshipSeverity(type)"
                :value="type.replaceAll('_', ' ')"
                rounded
              />
              <Tag
                v-for="flatNumber in relationshipFlatNumbers"
                :key="flatNumber"
                severity="secondary"
                :value="`Flat ${flatNumber}`"
                rounded
              />
              <AppStatusBadge :status="resident.isActive ? 'active' : 'inactive'" />
              <AppStatusBadge :status="loginStatus" />
            </div>
            <h1>{{ resident.fullName }}</h1>
            <p>{{ contactLine }}</p>
          </div>
        </div>

        <div class="hero-actions">
          <Button
            label="Residents"
            icon="pi pi-arrow-left"
            severity="secondary"
            outlined
            @click="router.push('/admin/residents')"
          />
          <Button
            label="Send invite"
            icon="pi pi-send"
            :disabled="!hasLoginIdentity"
            :loading="runningAction === 'SEND_INVITE'"
            @click="runAction('SEND_INVITE')"
          />
          <Button
            label="Resend invite"
            icon="pi pi-refresh"
            severity="secondary"
            outlined
            :disabled="!hasLoginIdentity"
            :loading="runningAction === 'RESEND_INVITE'"
            @click="runAction('RESEND_INVITE')"
          />
          <Button
            label="Reset onboarding"
            icon="pi pi-key"
            severity="secondary"
            outlined
            :disabled="!hasLoginIdentity"
            :loading="runningAction === 'RESET_ONBOARDING'"
            @click="runAction('RESET_ONBOARDING')"
          />
          <Button
            label="Deactivate login"
            icon="pi pi-ban"
            severity="danger"
            text
            :disabled="!resident.canLogin"
            :loading="runningAction === 'DEACTIVATE_LOGIN'"
            @click="runAction('DEACTIVATE_LOGIN')"
          />
        </div>
      </section>

      <div class="surface-grid">
        <section class="surface-card">
          <p class="eyebrow">Login</p>
          <h3>{{ resident.canLogin && hasLoginIdentity ? 'Enabled' : 'Disabled' }}</h3>
          <p>{{ hasLoginIdentity ? (resident.emailVerified ? 'Email verified' : 'Email pending') : 'No login email' }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Compliance</p>
          <h3>{{ resident.kycStatus }}</h3>
          <p>Police: {{ resident.policeVerificationStatus }}</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Linked flats</p>
          <h3>{{ relationshipSummary.active }}</h3>
          <p>{{ relationshipSummary.billing }} billing contact · {{ relationshipSummary.primary }} primary</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Outstanding</p>
          <h3>{{ formatMoney(financialSummary.dueBalance) }}</h3>
          <p>{{ formatMoney(financialSummary.paidTotal) }} paid</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Payments</p>
          <h3>{{ resident.payments.length }}</h3>
          <p>{{ formatMoney(financialSummary.paymentTotal) }} recorded</p>
        </section>
        <section class="surface-card">
          <p class="eyebrow">Requests</p>
          <h3>{{ requestSummary.open }}</h3>
          <p>{{ requestSummary.total }} total · {{ requestSummary.overdue }} breached</p>
        </section>
      </div>

      <section class="admin-two-column--wide resident-detail-columns">
        <section class="surface-card resident-info-panel">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Profile</p>
              <h2>Contact and identity</h2>
            </div>
          </div>

          <div class="resident-fact-grid">
            <div>
              <span>Email</span>
              <strong>{{ displayValue(displayEmail) }}</strong>
            </div>
            <div>
              <span>Mobile</span>
              <strong>{{ displayValue(displayMobile) }}</strong>
            </div>
            <div>
              <span>WhatsApp</span>
              <strong>{{ resident.whatsappNumber || '-' }}</strong>
            </div>
            <div>
              <span>Notification preset</span>
              <strong>{{ resident.preferredNotificationChannels.replaceAll('_', ' ') }}</strong>
            </div>
            <div>
              <span>Emergency contact</span>
              <strong>{{ resident.emergencyContactName || '-' }}</strong>
            </div>
            <div>
              <span>Emergency phone</span>
              <strong>{{ resident.emergencyContactNumber || '-' }}</strong>
            </div>
            <div>
              <span>Government ID</span>
              <strong>{{ resident.governmentIdType || '-' }}</strong>
            </div>
            <div>
              <span>ID number</span>
              <strong>{{ resident.governmentIdNumber || '-' }}</strong>
            </div>
            <div>
              <span>Created</span>
              <strong>{{ formatDateTime(resident.createdAt) }}</strong>
            </div>
            <div>
              <span>Updated</span>
              <strong>{{ formatDateTime(resident.updatedAt) }}</strong>
            </div>
          </div>
        </section>

        <section class="surface-card resident-document-panel">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Documents</p>
              <h2>Files on record</h2>
            </div>
          </div>

          <div class="resident-document-list">
            <article
              v-for="document in documentItems"
              :key="document.field"
              class="resident-document-row"
            >
              <i :class="document.icon" aria-hidden="true" />
              <div>
                <h3>{{ document.label }}</h3>
                <p>{{ document.value ? document.detail : 'Not uploaded' }}</p>
              </div>
              <Button
                v-if="document.value"
                icon="pi pi-external-link"
                severity="secondary"
                text
                rounded
                as="a"
                :href="fileUrl(document.field)"
                target="_blank"
                rel="noopener"
                :aria-label="`Open ${document.label}`"
                :title="`Open ${document.label}`"
              />
            </article>
          </div>
        </section>
      </section>

      <section class="surface-card admin-detail-list">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Relationships</p>
            <h2>Flat links and occupancy</h2>
          </div>
          <Tag :value="`${relationshipSummary.total} total`" severity="secondary" rounded />
        </div>

        <AppState
          v-if="resident.relationships.length === 0"
          title="No flat links"
          message="No active or historical flat relationship is attached."
          icon="pi pi-home"
        />

        <div v-else class="resident-relationship-grid">
          <article
            v-for="relationship in resident.relationships"
            :key="relationship.id"
            class="admin-detail-card resident-relationship-card"
          >
            <div class="admin-detail-card__header">
              <div>
                <p class="eyebrow">{{ relationship.relationshipType.replaceAll('_', ' ') }}</p>
                <h3>{{ linkedFlatLabel(relationship) }}</h3>
                <p>{{ relationship.accessScope || 'Access pending' }}</p>
              </div>
              <AppStatusBadge :status="relationship.isActive ? 'active' : 'inactive'" />
            </div>

            <div class="resident-chip-row">
              <Tag
                :severity="relationship.isPrimaryContact ? 'success' : 'secondary'"
                :value="relationship.isPrimaryContact ? 'Primary' : 'Secondary'"
                rounded
              />
              <Tag
                :severity="relationship.isBillingContact ? 'success' : 'secondary'"
                :value="relationship.isBillingContact ? 'Billing' : 'Non-billing'"
                rounded
              />
              <Tag
                :severity="relationship.canLogin ? 'info' : 'secondary'"
                :value="relationship.canLogin ? 'Login allowed' : 'No login'"
                rounded
              />
            </div>

            <div class="resident-relationship-facts">
              <div>
                <span>Occupancy</span>
                <strong>{{ relationship.occupancyStatus || '-' }}</strong>
              </div>
              <div>
                <span>Ownership start</span>
                <strong>{{ formatDate(relationship.ownershipStartDate) }}</strong>
              </div>
              <div>
                <span>Lease start</span>
                <strong>{{ formatDate(relationship.leaseStartDate) }}</strong>
              </div>
              <div>
                <span>Lease end</span>
                <strong>{{ formatDate(relationship.leaseEndDate) }}</strong>
              </div>
            </div>

            <p v-if="displayRelationshipNote(relationship.relationshipNote)" class="resident-note">
              {{ displayRelationshipNote(relationship.relationshipNote) }}
            </p>
          </article>
        </div>
      </section>

      <section class="surface-card admin-detail-list">
        <div class="admin-form-section__header">
          <div>
            <p class="eyebrow">Household</p>
            <h2>Owners and tenants for linked flats</h2>
          </div>
          <Tag :value="`${resident.flatOccupants.length} records`" severity="secondary" rounded />
        </div>

        <AppDataTable
          v-if="resident.flatOccupants.length"
          :value="resident.flatOccupants"
          responsive-layout="scroll"
          class="list-page__table"
        >
          <Column header="Resident">
            <template #body="{ data: row }">
              <NuxtLink :to="`/admin/residents/${row.userId}`" class="table-link-button">
                {{ row.residentName }}
              </NuxtLink>
            </template>
          </Column>
          <Column header="Type">
            <template #body="{ data: row }">
              <Tag
                :severity="relationshipSeverity(row.relationshipType)"
                :value="row.relationshipType.replaceAll('_', ' ')"
                rounded
              />
            </template>
          </Column>
          <Column header="Flat">
            <template #body="{ data: row }">{{ linkedFlatLabel(row) }}</template>
          </Column>
          <Column header="Contact">
            <template #body="{ data: row }">
              {{ [row.residentEmail, row.residentMobileNumber].filter(Boolean).join(' · ') || '-' }}
            </template>
          </Column>
          <Column header="Flags">
            <template #body="{ data: row }">
              <div class="resident-chip-row">
                <Tag v-if="row.isPrimaryContact" value="Primary" severity="success" rounded />
                <Tag v-if="row.isBillingContact" value="Billing" severity="info" rounded />
                <Tag :value="row.isActive ? 'Active' : 'Inactive'" :severity="row.isActive ? 'success' : 'secondary'" rounded />
              </div>
            </template>
          </Column>
        </AppDataTable>
        <AppState
          v-else
          title="No linked occupants"
          message="No owner or tenant records are attached to the linked flats."
          icon="pi pi-users"
        />
      </section>

      <section class="admin-two-column--wide resident-detail-columns">
        <section class="surface-card admin-detail-list">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Billing</p>
              <h2>Dues for linked flats</h2>
            </div>
            <Tag :value="formatMoney(financialSummary.dueBalance)" :severity="financialSummary.dueBalance > 0 ? 'danger' : 'success'" rounded />
          </div>

          <AppDataTable
            v-if="resident.dues.length"
            :value="resident.dues"
            responsive-layout="scroll"
            class="list-page__table"
          >
            <Column field="billingPeriodLabel" header="Period" />
            <Column header="Flat">
              <template #body="{ data: row }">{{ flatLabel(row) }}</template>
            </Column>
            <Column header="Due">
              <template #body="{ data: row }">{{ formatMoney(row.totalAmount) }}</template>
            </Column>
            <Column header="Paid">
              <template #body="{ data: row }">{{ formatMoney(row.paidAmount) }}</template>
            </Column>
            <Column header="Balance">
              <template #body="{ data: row }">
                <strong>{{ formatMoney(row.balanceAmount) }}</strong>
              </template>
            </Column>
            <Column header="Status">
              <template #body="{ data: row }">
                <Tag :severity="statusSeverity(row.status)" :value="row.status.replaceAll('_', ' ')" rounded />
              </template>
            </Column>
          </AppDataTable>
          <AppState
            v-else
            title="No dues"
            message="No maintenance dues are linked to this resident's flats."
            icon="pi pi-receipt"
          />
        </section>

        <section class="surface-card admin-detail-list">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Payments</p>
              <h2>Recent payments</h2>
            </div>
            <Tag :value="formatMoney(financialSummary.paymentTotal)" severity="success" rounded />
          </div>

          <AppDataTable
            v-if="resident.payments.length"
            :value="resident.payments"
            responsive-layout="scroll"
            class="list-page__table"
          >
            <Column header="Date">
              <template #body="{ data: row }">{{ formatDate(row.paymentDate) }}</template>
            </Column>
            <Column header="Flat">
              <template #body="{ data: row }">{{ flatLabel(row) }}</template>
            </Column>
            <Column field="payerName" header="Payer" />
            <Column header="Amount">
              <template #body="{ data: row }">
                <strong>{{ formatMoney(row.amount) }}</strong>
              </template>
            </Column>
            <Column header="Status">
              <template #body="{ data: row }">
                <Tag :severity="statusSeverity(row.status)" :value="row.status.replaceAll('_', ' ')" rounded />
              </template>
            </Column>
            <Column field="receiptNumber" header="Receipt" />
          </AppDataTable>
          <AppState
            v-else
            title="No payments"
            message="No payment records are linked to this resident or the linked flats."
            icon="pi pi-wallet"
          />
        </section>
      </section>

      <section class="admin-two-column--wide resident-detail-columns">
        <section class="surface-card admin-detail-list">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Requests</p>
              <h2>Service requests</h2>
            </div>
            <Tag :value="`${requestSummary.open} open`" :severity="requestSummary.open > 0 ? 'info' : 'success'" rounded />
          </div>

          <AppDataTable
            v-if="resident.serviceRequests.length"
            :value="resident.serviceRequests"
            responsive-layout="scroll"
            class="list-page__table"
          >
            <Column header="Request">
              <template #body="{ data: row }">
                <strong>{{ row.requestNumber }}</strong>
                <p class="resident-note resident-note--plain">{{ row.title }}</p>
              </template>
            </Column>
            <Column field="category" header="Category" />
            <Column field="flatLabel" header="Flat" />
            <Column header="Priority">
              <template #body="{ data: row }">
                <Tag :severity="row.priority === 'EMERGENCY' ? 'danger' : 'secondary'" :value="row.priority" rounded />
              </template>
            </Column>
            <Column header="Status">
              <template #body="{ data: row }">
                <Tag :severity="statusSeverity(row.status)" :value="row.status.replaceAll('_', ' ')" rounded />
              </template>
            </Column>
          </AppDataTable>
          <AppState
            v-else
            title="No service requests"
            message="No requests are linked to this resident or the linked flats."
            icon="pi pi-ticket"
          />
        </section>

        <section class="surface-card admin-detail-list">
          <div class="admin-form-section__header">
            <div>
              <p class="eyebrow">Access</p>
              <h2>Recent gate scans</h2>
            </div>
            <Tag :value="`${resident.accessLogs.length} scans`" severity="secondary" rounded />
          </div>

          <AppDataTable
            v-if="resident.accessLogs.length"
            :value="resident.accessLogs"
            responsive-layout="scroll"
            class="list-page__table"
          >
            <Column header="Time">
              <template #body="{ data: row }">{{ formatDateTime(row.scannedAt) }}</template>
            </Column>
            <Column field="userName" header="Resident" />
            <Column header="Flat">
              <template #body="{ data: row }">{{ flatLabel(row) }}</template>
            </Column>
            <Column field="gateName" header="Gate" />
            <Column header="Result">
              <template #body="{ data: row }">
                <Tag :severity="statusSeverity(row.scanResult)" :value="row.scanResult.replaceAll('_', ' ')" rounded />
              </template>
            </Column>
          </AppDataTable>
          <AppState
            v-else
            title="No access scans"
            message="No gate scan records are linked to this resident or the linked flats."
            icon="pi pi-qrcode"
          />
        </section>
      </section>
    </template>
  </div>
</template>

<style scoped>
.resident-detail-hero {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 1.25rem;
}

.resident-detail-identity {
  display: flex;
  align-items: center;
  gap: 1rem;
  min-width: 0;
}

.resident-detail-tags,
.resident-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 0.5rem;
}

.resident-avatar {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  overflow: hidden;
  border-radius: 50%;
  border: 1px solid var(--color-border);
  background: var(--color-surface-strong);
  color: var(--color-brand-strong);
  font-weight: 800;
}

.resident-avatar--large {
  width: 5rem;
  height: 5rem;
  font-size: 1.35rem;
}

.resident-avatar img {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.resident-detail-columns {
  display: grid;
}

.resident-info-panel,
.resident-document-panel {
  display: grid;
  gap: 1rem;
}

.resident-fact-grid,
.resident-relationship-facts {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 0.75rem;
}

.resident-fact-grid div,
.resident-relationship-facts div {
  display: grid;
  gap: 0.25rem;
  min-width: 0;
  padding: 0.75rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.resident-fact-grid span,
.resident-relationship-facts span {
  color: var(--color-muted);
  font-size: 0.82rem;
}

.resident-fact-grid strong,
.resident-relationship-facts strong {
  overflow-wrap: anywhere;
}

.resident-document-list,
.resident-relationship-grid {
  display: grid;
  gap: 0.75rem;
}

.resident-document-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 0.75rem;
  padding: 0.85rem;
  border-radius: var(--radius-md);
  border: 1px solid var(--color-border);
  background: var(--color-bg);
}

.resident-document-row i {
  color: var(--color-brand);
  font-size: 1.25rem;
}

.resident-document-row h3 {
  margin: 0;
  font-size: 1rem;
}

.resident-document-row p,
.resident-relationship-card p,
.resident-note {
  margin: 0.25rem 0 0;
  color: var(--color-muted);
}

.resident-relationship-card {
  display: grid;
  gap: 1rem;
}

.resident-note {
  padding-top: 0.75rem;
  border-top: 1px solid var(--color-border);
}

@media (max-width: 900px) {
  .resident-detail-identity {
    align-items: flex-start;
  }

  .resident-fact-grid,
  .resident-relationship-facts {
    grid-template-columns: 1fr;
  }
}
</style>
