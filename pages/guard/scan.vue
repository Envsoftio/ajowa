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
const cameraError = ref('')
const manualToken = ref('')
const result = ref<VerifyResponse['data'] | null>(null)
const verifying = ref(false)

const verify = async (token: string) => {
  if (verifying.value) return
  verifying.value = true
  cameraError.value = ''
  try {
    const response = await api<VerifyResponse>('/api/qr/verify', {
      method: 'POST',
      body: { token, gateName: 'Main gate', deviceId: navigator.userAgent.slice(0, 120) },
    })
    result.value = response.data
    await scanner.value?.pause?.()
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
    verifying.value = false
  }
}

const startScanner = async () => {
  if (!import.meta.client || scanner.value || isStarting.value) return
  isStarting.value = true
  cameraError.value = ''
  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      cameraError.value = 'Camera scanning is not supported in this browser.'
      return
    }
    const { Html5Qrcode } = await import('html5-qrcode')
    const scannerInstance: ScannerController = new Html5Qrcode(scannerId)
    scanner.value = scannerInstance
    await scannerInstance.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 260, height: 260 } },
      (decodedText: string) => verify(decodedText),
    )
  } catch (error: unknown) {
    cameraError.value = getErrorMessage(error, 'Camera permission is needed to scan QR codes.')
  } finally {
    isStarting.value = false
  }
}

const rescan = async () => {
  result.value = null
  manualToken.value = ''
  try {
    await scanner.value?.resume?.()
  } catch {
    await startScanner()
  }
}

onMounted(startScanner)
onBeforeUnmount(async () => {
  try {
    await scanner.value?.stop?.()
    scanner.value?.clear?.()
  } catch {
    // Scanner cleanup is best-effort on browser navigation.
  }
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
        <Button icon="pi pi-refresh" aria-label="Retry camera" severity="secondary" rounded outlined @click="startScanner" />
      </header>

      <div v-if="result" class="scan-result" :class="result.allowed ? 'scan-result--allowed' : 'scan-result--blocked'">
        <Tag :severity="result.allowed ? 'success' : 'danger'" :value="result.result" rounded />
        <h2>{{ result.allowed ? 'Allowed' : 'Blocked' }}</h2>
        <p v-if="result.allowed">
          {{ result.residentName }} · {{ result.flatLabels.join(', ') || 'Linked resident' }}
        </p>
        <p v-else>{{ result.reason }}</p>
        <Button label="Scan next" icon="pi pi-qrcode" size="large" @click="rescan" />
      </div>

      <template v-else>
        <div :id="scannerId" class="guard-camera-frame" />
        <Message v-if="cameraError" severity="warn" :closable="false">{{ cameraError }}</Message>
        <Message v-if="verifying" severity="info" :closable="false">Verifying QR...</Message>

        <form class="guard-manual-form" @submit.prevent="verify(manualToken)">
          <InputText v-model="manualToken" placeholder="Paste QR token if camera fails" />
          <Button type="submit" label="Verify" icon="pi pi-check" :disabled="manualToken.length < 20 || verifying" />
        </form>
      </template>
    </section>
  </div>
</template>
