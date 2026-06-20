<script setup lang="ts">
definePageMeta({
  layout: 'guard',
  middleware: ['protected'],
  title: 'Guard Scan',
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
    cameraConfig: { facingMode: string },
    config: { fps: number; qrbox: { width: number; height: number } },
    onSuccess: (decodedText: string) => void,
    onError?: (errorMessage: string) => void,
  ) => Promise<unknown>
  pause?: () => Promise<void> | void
  resume?: () => Promise<void> | void
  stop?: () => Promise<void> | void
  clear?: () => Promise<void> | void
}

const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error ? error.message : fallback

const api = useApi()
const scannerId = 'guard-qr-reader'
const scanner = shallowRef<ScannerController | null>(null)
const isStarting = ref(false)
const isScanning = ref(false)
const cameraError = ref('')
const manualToken = ref('')
const result = ref<VerifyResponse['data'] | null>(null)
const verifying = ref(false)

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
    const { Html5Qrcode } = await import('html5-qrcode')
    await nextTick()
    const scannerInstance: ScannerController = new Html5Qrcode(scannerId)
    scanner.value = scannerInstance
    await scannerInstance.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      (decodedText: string) => verify(decodedText),
    )
    isScanning.value = true
  } catch (error: unknown) {
    cameraError.value = getErrorMessage(error, 'Camera permission is needed to scan QR codes.')
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
</template>
