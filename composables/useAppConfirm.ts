type AppConfirmSeverity =
  | 'secondary'
  | 'success'
  | 'info'
  | 'warn'
  | 'help'
  | 'danger'
  | 'contrast'

type AppConfirmOptions = {
  header: string
  message: string
  icon?: string
  acceptLabel?: string
  acceptSeverity?: AppConfirmSeverity
  rejectLabel?: string
}

export const useAppConfirm = () => {
  const confirm = useConfirm()

  return (options: AppConfirmOptions) =>
    new Promise<boolean>((resolve) => {
      let settled = false
      const settle = (value: boolean) => {
        if (settled) return
        settled = true
        resolve(value)
      }

      confirm.require({
        header: options.header,
        message: options.message,
        icon: options.icon ?? 'pi pi-exclamation-triangle',
        rejectProps: {
          label: options.rejectLabel ?? 'Cancel',
          severity: 'secondary',
          outlined: true,
        },
        acceptProps: {
          label: options.acceptLabel ?? 'Confirm',
          severity: options.acceptSeverity ?? 'danger',
        },
        accept: () => settle(true),
        reject: () => settle(false),
        onHide: () => settle(false),
      })
    })
}
