type ResidentPhotoPreviewState = {
  visible: boolean
  src: string
  name: string
}

export const useResidentPhotoPreview = () => {
  const state = useState<ResidentPhotoPreviewState>(
    'resident-photo-preview',
    () => ({
      visible: false,
      src: '',
      name: '',
    }),
  )

  const openResidentPhotoPreview = (payload: {
    src: string
    name: string | null | undefined
  }) => {
    if (!payload.src) {
      return
    }

    state.value = {
      visible: true,
      src: payload.src,
      name: payload.name?.trim() || 'Resident',
    }
  }

  const closeResidentPhotoPreview = () => {
    state.value = {
      visible: false,
      src: '',
      name: '',
    }
  }

  return {
    residentPhotoPreview: state,
    openResidentPhotoPreview,
    closeResidentPhotoPreview,
  }
}
