<script setup lang="ts">
import type { AppShellType } from '~/shared/shell'

definePageMeta({
  layout: false,
  middleware: ['protected'],
  title: 'Scan QR',
})

type VerifyResponse = {
  ok: true
  data: {
    allowed: boolean
    result: string
    reason: string | null
    scannedAt: string
    residentName: string | null
    resident: {
      id: string
      name: string | null
      mobileNumber: string | null
      profilePhotoUrl: string | null
    } | null
    flatLabels: string[]
    flats: {
      id: string
      label: string
      blockName: string | null
      flatNumber: string | null
      unitType: string | null
      occupancyStatus: string | null
      relationshipType: string
      accessScope: string | null
      isPrimaryContact: boolean
      isBillingContact: boolean
      leaseEndDate: string | null
    }[]
    householdMembers: {
      relationshipId: string
      userId: string
      name: string
      mobileNumber: string | null
      profilePhotoUrl: string | null
      flatId: string
      flatLabel: string
      relationshipType: string
      accessScope: string | null
      isPrimaryContact: boolean
      isBillingContact: boolean
      occupancyStatus: string | null
      leaseEndDate: string | null
    }[]
    access: {
      basis: string | null
      totalFlats: number
      totalPaidFlats: number
      totalUnpaidFlats: number
      totalBalance: number
    } | null
  }
}

type GuardAnalyticsResponse = {
  ok: true
  data: {
    timezone: string
    today: {
      date: string
      total: number
      granted: number
      denied: number
      expired: number
      revoked: number
      invalid: number
      firstScanAt: string | null
      latestScanAt: string | null
    }
    daily: {
      date: string
      total: number
      granted: number
      blocked: number
      invalid: number
    }[]
  }
}

type ScannerController = {
  start: (
    cameraConfig: string | { facingMode: string },
    config: ScannerScanConfig,
    onSuccess: (decodedText: string) => void,
    onError?: (errorMessage: string) => void,
  ) => Promise<unknown>
  pause?: () => Promise<void> | void
  resume?: () => Promise<void> | void
  stop?: () => Promise<void> | void
  clear?: () => Promise<void> | void
}

type ScannerClass = {
  new (elementId: string): ScannerController
  getCameras: () => Promise<CameraDevice[]>
}

type ScannerScanConfig = {
  fps: number
  qrbox: { width: number; height: number }
}

type CameraDevice = {
  id: string
  label: string
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const getErrorName = (error: unknown) =>
  typeof error === 'object' &&
  error != null &&
  'name' in error &&
  typeof (error as { name?: unknown }).name === 'string'
    ? (error as { name: string }).name
    : ''

const getCameraStartupErrorMessage = (error: unknown) => {
  const message = getErrorMessage(error, typeof error === 'string' ? error : '')
  const text = `${getErrorName(error)} ${message}`.toLowerCase()

  if (text.includes('notallowed') || text.includes('permission') || text.includes('denied')) {
    return 'Camera permission is blocked. Allow camera access for AJOWA in the browser or phone settings, then tap Start scan again.'
  }

  if (text.includes('notfound') || text.includes('devicesnotfound') || text.includes('no camera')) {
    return 'No camera was found on this device.'
  }

  if (text.includes('notreadable') || text.includes('trackstart') || text.includes('in use')) {
    return 'The camera is already in use or unavailable. Close other camera apps or browser tabs, then try again.'
  }

  if (text.includes('overconstrained') || text.includes('constraint')) {
    return 'Could not open the device camera. Try again, or use manual verification if the camera is unavailable.'
  }

  if (text.includes('not supported')) {
    return 'Camera scanning is not supported in this browser. Open AJOWA in Chrome or Safari and try again.'
  }

  return message || 'Camera permission is needed to scan QR codes.'
}

const scannerScanConfig: ScannerScanConfig = { fps: 10, qrbox: { width: 260, height: 260 } }
const rearCameraLabelPattern = /\b(back|rear|environment|main|world)\b/i

const getPreferredCameraId = (cameras: CameraDevice[]) => {
  const camerasWithIds = cameras.filter((camera) => camera.id)
  const preferredCamera = camerasWithIds.find((camera) => rearCameraLabelPattern.test(camera.label))
  return preferredCamera?.id ?? camerasWithIds[camerasWithIds.length - 1]?.id ?? null
}

const startScannerCamera = async (Scanner: ScannerClass, scannerInstance: ScannerController) => {
  const cameras = await Scanner.getCameras()
  const cameraId = getPreferredCameraId(cameras)
  const cameraConfig = cameraId ?? { facingMode: 'environment' }

  await scannerInstance.start(cameraConfig, scannerScanConfig, (decodedText: string) => verify(decodedText))
}

const api = useApi()
const authStore = useAuthStore()
const scannerId = 'guard-qr-reader'
const scanner = shallowRef<ScannerController | null>(null)
const isStarting = ref(false)
const isScanning = ref(false)
const cameraError = ref('')
const manualToken = ref('')
const result = ref<VerifyResponse['data'] | null>(null)
const verifying = ref(false)
const scanShell = computed<AppShellType>(() => {
  const role = authStore.me?.user.role

  if (role === 'ADMIN' || role === 'MANAGER') return 'admin-manager'
  if (role === 'SERVICE_STAFF') return 'service-staff'

  return 'guard'
})

const { data: analyticsData, pending: analyticsPending, refresh: refreshAnalytics } = await useAsyncData(
  'guard-scan-analytics',
  () => api<GuardAnalyticsResponse>('/api/qr/guard-analytics'),
)

const emptyAnalytics: GuardAnalyticsResponse['data'] = {
  timezone: 'Asia/Kolkata',
  today: {
    date: '',
    total: 0,
    granted: 0,
    denied: 0,
    expired: 0,
    revoked: 0,
    invalid: 0,
    firstScanAt: null,
    latestScanAt: null,
  },
  daily: [],
}

const analytics = computed(() => analyticsData.value?.data ?? emptyAnalytics)
const blockedToday = computed(() =>
  analytics.value.today.denied +
  analytics.value.today.expired +
  analytics.value.today.revoked +
  analytics.value.today.invalid,
)
const maxDailyScans = computed(() => Math.max(1, ...analytics.value.daily.map((day) => day.total)))
const formatDayLabel = (value: string) =>
  value ? new Date(`${value}T00:00:00`).toLocaleDateString('en-IN', { day: '2-digit', month: 'short' }) : '-'

const formatTimeLabel = (value: string | null) =>
  value ? new Date(value).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : '-'

const formatDateTimeLabel = (value: string | null) =>
  value
    ? new Date(value).toLocaleString('en-IN', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      })
    : '-'

const formatLabel = (value: string | null | undefined) =>
  value
    ? value
        .replaceAll('_', ' ')
        .toLowerCase()
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
    : '-'

const getInitials = (name: string | null | undefined) =>
  (name || 'Resident')
    .split(/[\s/]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || 'R'

const getResultSeverity = (scanResult: string) => {
  if (scanResult === 'GRANTED') return 'success'
  if (
    scanResult === 'DENIED' ||
    scanResult === 'REVOKED' ||
    scanResult === 'EXPIRED'
  ) {
    return 'danger'
  }
  return 'secondary'
}

const getResultTitle = (scanResult: VerifyResponse['data']) => {
  if (scanResult.allowed) return 'Access allowed'
  if (scanResult.result === 'DENIED') return 'Access blocked'
  if (scanResult.result === 'EXPIRED') return 'QR expired'
  if (scanResult.result === 'REVOKED') return 'QR revoked'
  return 'QR invalid'
}

const getFlatDetail = (flat: VerifyResponse['data']['flats'][number]) =>
  [
    flat.unitType,
    formatLabel(flat.relationshipType),
    formatLabel(flat.occupancyStatus),
  ]
    .filter((value) => value && value !== '-')
    .join(' - ')

const getMemberDetail = (
  member: VerifyResponse['data']['householdMembers'][number],
) =>
  [formatLabel(member.relationshipType), member.flatLabel].filter(Boolean).join(' - ')

const formatAccessBalance = (value: number | null | undefined) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(value ?? 0)

const scannerButtonLabel = computed(() => {
  if (isScanning.value) return 'Scanning'
  if (scanner.value) return 'Resume scan'
  return 'Start scan'
})
const scannerButtonIcon = computed(() => (isScanning.value ? 'pi pi-video' : 'pi pi-qrcode'))
const scannerStats = computed(() => [
  {
    label: 'Today',
    value: analytics.value.today.total,
    detail: formatDayLabel(analytics.value.today.date),
  },
  {
    label: 'Allowed',
    value: analytics.value.today.granted,
    detail: 'granted',
  },
  {
    label: 'Blocked',
    value: blockedToday.value,
    detail: 'denied or invalid',
  },
  {
    label: 'Last scan',
    value: formatTimeLabel(analytics.value.today.latestScanAt),
    detail: analytics.value.timezone,
  },
])

const verify = async (token: string) => {
  const trimmedToken = token.trim()
  if (verifying.value || trimmedToken.length < 20) return
  verifying.value = true
  cameraError.value = ''
  try {
    const response = await api<VerifyResponse>('/api/qr/verify', {
      method: 'POST',
      body: {
        token: trimmedToken,
        gateName: 'Main gate',
        deviceId: import.meta.client ? navigator.userAgent.slice(0, 120) : undefined,
      },
    })
    result.value = response.data
    await refreshAnalytics().catch(() => undefined)
  } catch (error: unknown) {
    result.value = {
      allowed: false,
      result: 'INVALID',
      reason:
        typeof error === 'object' &&
        error != null &&
        'data' in error &&
        typeof (error as { data?: { message?: unknown } }).data?.message === 'string'
          ? (error as { data: { message: string } }).data.message
          : 'Network or verification error. Try again.',
      scannedAt: new Date().toISOString(),
      residentName: null,
      resident: null,
      flatLabels: [],
      flats: [],
      householdMembers: [],
      access: null,
    }
  } finally {
    if (result.value) {
      try {
        await scanner.value?.pause?.()
      } catch {
        // Some browser camera implementations cannot pause after an error result.
      }
      isScanning.value = false
    }
    verifying.value = false
  }
}

const startScanner = async () => {
  if (!import.meta.client || isStarting.value || verifying.value) return
  isStarting.value = true
  cameraError.value = ''
  try {
    if (scanner.value) {
      await scanner.value.resume?.()
      isScanning.value = true
      return
    }
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError.value = 'Camera scanning is not supported in this browser.'
      return
    }
    if (!window.isSecureContext) {
      cameraError.value = 'Camera access requires HTTPS. Open AJOWA from https://ajowa.in and try again.'
      return
    }
    const { Html5Qrcode } = await import('html5-qrcode')
    await nextTick()
    const Scanner = Html5Qrcode as ScannerClass
    const scannerInstance: ScannerController = new Scanner(scannerId)
    scanner.value = scannerInstance
    await startScannerCamera(Scanner, scannerInstance)
    isScanning.value = true
  } catch (error: unknown) {
    cameraError.value = getCameraStartupErrorMessage(error)
    await scanner.value?.clear?.()
    scanner.value = null
    isScanning.value = false
  } finally {
    isStarting.value = false
  }
}

const stopScanner = async () => {
  if (!scanner.value || isStarting.value) return
  try {
    await scanner.value.stop?.()
    await scanner.value.clear?.()
  } catch {
    // Scanner shutdown is best-effort across mobile browsers.
  } finally {
    scanner.value = null
    isScanning.value = false
  }
}

const rescan = async () => {
  result.value = null
  manualToken.value = ''
  if (!scanner.value) {
    await startScanner()
    return
  }
  try {
    await scanner.value.resume?.()
    isScanning.value = true
  } catch {
    scanner.value = null
    isScanning.value = false
    await startScanner()
  }
}

onBeforeUnmount(async () => {
  await stopScanner()
})
</script>

<template>
  <AppShell :shell="scanShell">
    <div class="landing-page guard-scan-page">
      <section class="guard-scan-shell">
        <header class="guard-scan-header">
          <div>
            <p class="eyebrow">Gate desk</p>
            <h1>Scan QR</h1>
          </div>
          <div class="guard-scan-header__actions">
            <Button
              icon="pi pi-refresh"
              aria-label="Refresh analytics"
              severity="secondary"
              rounded
              outlined
              :loading="analyticsPending"
              @click="() => refreshAnalytics()"
            />
            <Button
              :label="scannerButtonLabel"
              :icon="scannerButtonIcon"
              :loading="isStarting"
              :disabled="isScanning || verifying"
              @click="startScanner"
            />
          </div>
        </header>

        <div class="guard-analytics-panel" aria-label="Guard scan analytics">
          <div v-for="stat in scannerStats" :key="stat.label" class="guard-stat">
            <span>{{ stat.label }}</span>
            <strong>{{ stat.value }}</strong>
            <small>{{ stat.detail }}</small>
          </div>
        </div>

        <div v-if="analytics.daily.length" class="guard-trend-strip" aria-label="Daily scan counts">
          <div v-for="day in analytics.daily" :key="day.date" class="guard-trend-day">
            <span>{{ formatDayLabel(day.date) }}</span>
            <div class="guard-trend-bar">
              <i :style="{ height: `${Math.max(8, (day.total / maxDailyScans) * 100)}%` }" />
            </div>
            <strong>{{ day.total }}</strong>
          </div>
        </div>

        <div v-if="result" class="scan-result" :class="result.allowed ? 'scan-result--allowed' : 'scan-result--blocked'">
          <div class="scan-result__topline">
            <Tag :severity="getResultSeverity(result.result)" :value="result.result" rounded />
            <span>{{ formatDateTimeLabel(result.scannedAt) }}</span>
          </div>

          <div class="scan-result__hero">
            <div class="scan-result__photo">
              <img
                v-if="result.resident?.profilePhotoUrl"
                :src="result.resident.profilePhotoUrl"
                :alt="result.resident.name || 'Resident photo'"
                loading="lazy"
                decoding="async"
                fetchpriority="low"
              >
              <span v-else>{{ getInitials(result.residentName) }}</span>
            </div>
            <div class="scan-result__identity">
              <p class="eyebrow">Gate result</p>
              <h2>{{ getResultTitle(result) }}</h2>
              <strong>{{ result.residentName || 'Unknown resident' }}</strong>
              <p>{{ result.flatLabels.join(', ') || result.reason || 'No linked flat details' }}</p>
            </div>
          </div>

          <Message
            v-if="!result.allowed && result.reason"
            :severity="result.result === 'INVALID' ? 'warn' : 'error'"
            :closable="false"
          >
            {{ result.reason }}
          </Message>

          <div v-if="result.access || result.flats.length" class="scan-result__summary">
            <div>
              <span>Access basis</span>
              <strong>{{ formatLabel(result.access?.basis) }}</strong>
            </div>
            <div>
              <span>Cleared flats</span>
              <strong>
                {{ result.access?.totalPaidFlats ?? 0 }}/{{ result.access?.totalFlats ?? result.flats.length }}
              </strong>
            </div>
            <div>
              <span>Blocked balance</span>
              <strong>{{ formatAccessBalance(result.access?.totalBalance) }}</strong>
            </div>
          </div>

          <section v-if="result.flats.length" class="scan-result__section">
            <div class="scan-result__section-header">
              <div>
                <p class="eyebrow">Linked flats</p>
                <h3>
                  {{ result.flats.length }} active link{{ result.flats.length === 1 ? '' : 's' }}
                </h3>
              </div>
            </div>
            <div class="scan-flat-list">
              <article v-for="flat in result.flats" :key="flat.id" class="scan-flat-row">
                <div>
                  <strong>{{ flat.label }}</strong>
                  <span>{{ getFlatDetail(flat) }}</span>
                </div>
                <div class="scan-chip-row">
                  <Tag v-if="flat.isPrimaryContact" value="Primary" severity="success" rounded />
                  <Tag v-if="flat.isBillingContact" value="Billing" severity="info" rounded />
                </div>
              </article>
            </div>
          </section>

          <section v-if="result.householdMembers.length" class="scan-result__section">
            <div class="scan-result__section-header">
              <div>
                <p class="eyebrow">Registered residents</p>
                <h3>
                  {{ result.householdMembers.length }} owner, tenant, or member record{{
                    result.householdMembers.length === 1 ? '' : 's'
                  }}
                </h3>
              </div>
            </div>
            <div class="scan-household-list">
              <article
                v-for="member in result.householdMembers"
                :key="member.relationshipId"
                class="scan-member-row"
              >
                <div class="scan-member-photo">
                  <img
                    v-if="member.profilePhotoUrl"
                    :src="member.profilePhotoUrl"
                    :alt="member.name"
                    loading="lazy"
                    decoding="async"
                    fetchpriority="low"
                  >
                  <span v-else>{{ getInitials(member.name) }}</span>
                </div>
                <div>
                  <strong>{{ member.name }}</strong>
                  <span>{{ getMemberDetail(member) }}</span>
                  <small v-if="member.mobileNumber">{{ member.mobileNumber }}</small>
                </div>
                <Tag
                  :severity="
                    member.relationshipType === 'OWNER'
                      ? 'success'
                      : member.relationshipType === 'TENANT'
                        ? 'info'
                        : 'secondary'
                  "
                  :value="formatLabel(member.relationshipType)"
                  rounded
                />
              </article>
            </div>
          </section>

          <div class="scan-result__actions">
            <Button label="Scan next" icon="pi pi-qrcode" size="large" @click="rescan" />
          </div>
        </div>

        <div v-else class="guard-scan-panel">
          <div class="guard-camera-frame">
            <div :id="scannerId" class="guard-camera-reader" />
            <div v-if="!scanner && !isStarting" class="guard-camera-placeholder">
              <i class="pi pi-qrcode" aria-hidden="true" />
              <strong>Camera off</strong>
              <Button label="Start scan" icon="pi pi-qrcode" size="large" @click="startScanner" />
            </div>
          </div>

          <div class="guard-scan-actions">
            <Button
              :label="scannerButtonLabel"
              :icon="scannerButtonIcon"
              size="large"
              :loading="isStarting"
              :disabled="isScanning || verifying"
              @click="startScanner"
            />
            <Button
              v-if="scanner"
              label="Stop camera"
              icon="pi pi-stop-circle"
              size="large"
              severity="secondary"
              outlined
              :disabled="isStarting || verifying"
              @click="stopScanner"
            />
          </div>

          <Message v-if="cameraError" severity="warn" :closable="false">{{ cameraError }}</Message>
          <Message v-if="verifying" severity="info" :closable="false">Verifying QR...</Message>

          <form class="guard-manual-form" @submit.prevent="verify(manualToken)">
            <InputText v-model="manualToken" placeholder="Paste QR token if camera fails" />
            <Button type="submit" label="Verify" icon="pi pi-check" :disabled="manualToken.length < 20 || verifying" />
          </form>
        </div>
      </section>
    </div>
  </AppShell>
</template>
