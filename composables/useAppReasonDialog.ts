type AppReasonSeverity = 'secondary' | 'success' | 'info' | 'warn' | 'help' | 'danger' | 'contrast'

type AppReasonDialogOptions = {
  header: string
  message: string
  acceptLabel?: string
  acceptSeverity?: AppReasonSeverity
  placeholder?: string
}

export const useAppReasonDialog = () => {
  const state = reactive({
    visible: false,
    header: '',
    message: '',
    acceptLabel: 'Continue',
    acceptSeverity: 'danger' as AppReasonSeverity,
    placeholder: 'Enter reason',
    reason: '',
  })

  let resolver: ((reason: string | null) => void) | null = null

  const settle = (reason: string | null) => {
    resolver?.(reason)
    resolver = null
    state.visible = false
    state.reason = ''
  }

  const requestReason = (options: AppReasonDialogOptions) =>
    new Promise<string | null>((resolve) => {
      resolver?.(null)
      resolver = resolve
      state.header = options.header
      state.message = options.message
      state.acceptLabel = options.acceptLabel ?? 'Continue'
      state.acceptSeverity = options.acceptSeverity ?? 'danger'
      state.placeholder = options.placeholder ?? 'Enter reason'
      state.reason = ''
      state.visible = true
    })

  const acceptReason = () => {
    const reason = state.reason.trim()
    if (!reason) return
    settle(reason)
  }

  const cancelReason = () => settle(null)

  return {
    reasonDialog: state,
    requestReason,
    acceptReason,
    cancelReason,
  }
}
