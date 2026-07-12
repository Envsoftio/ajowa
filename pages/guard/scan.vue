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
    residentName: string | null
    flatLabels: string[]
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
      residentName: null,
      flatLabels: [],
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
          <Tag :severity="result.allowed ? 'success' : 'danger'" :value="result.result" rounded />
          <h2>{{ result.allowed ? 'Allowed' : 'Blocked' }}</h2>
          <p v-if="result.allowed">
            {{ result.residentName }} · {{ result.flatLabels.join(', ') || 'Linked resident' }}
          </p>
          <p v-else>{{ result.reason }}</p>
          <Button label="Scan next" icon="pi pi-qrcode" size="large" @click="rescan" />
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
