<script setup lang="ts">
import type { LocationQueryValue } from 'vue-router'
import {
  isInternalDocumentUrl,
  isSafeDocumentReturnPath,
  withDownloadQuery,
} from '~/shared/document-links'

definePageMeta({
  layout: false,
  title: 'Document',
})

const route = useRoute()
const router = useRouter()

const firstQueryValue = (value: LocationQueryValue | LocationQueryValue[] | undefined) =>
  Array.isArray(value) ? value[0] : value

const cleanText = (value: unknown, fallback: string) => {
  if (typeof value !== 'string') {
    return fallback
  }

  const normalized = value.replace(/\s+/g, ' ').trim()

  return normalized ? normalized.slice(0, 96) : fallback
}

const documentSrc = computed(() => {
  const src = firstQueryValue(route.query.src)

  return isInternalDocumentUrl(src) ? src : ''
})

const documentTitle = computed(() => cleanText(firstQueryValue(route.query.title), 'Document'))
const downloadFileName = computed(() => cleanText(firstQueryValue(route.query.fileName), `${documentTitle.value}.pdf`))
const downloadUrl = computed(() => (documentSrc.value ? withDownloadQuery(documentSrc.value) : ''))
const returnTo = computed(() => {
  const value = firstQueryValue(route.query.returnTo)

  return isSafeDocumentReturnPath(value) ? value : '/'
})

const goBack = () => {
  if (import.meta.client && window.history.length > 1) {
    router.back()
    return
  }

  void navigateTo(returnTo.value)
}
</script>

<template>
  <div class="document-viewer-page">
    <header class="document-viewer-toolbar">
      <div class="document-viewer-toolbar__title">
        <p class="eyebrow">Document</p>
        <h1>{{ documentTitle }}</h1>
      </div>
      <div class="document-viewer-toolbar__actions">
        <Button
          type="button"
          label="Back"
          icon="pi pi-arrow-left"
          severity="secondary"
          outlined
          @click="goBack"
        />
        <Button
          v-if="documentSrc"
          as="a"
          :href="downloadUrl"
          :download="downloadFileName"
          label="Download"
          icon="pi pi-download"
          severity="secondary"
          outlined
        />
        <Button
          v-if="documentSrc"
          as="a"
          :href="documentSrc"
          target="_blank"
          rel="noopener noreferrer"
          label="Open"
          icon="pi pi-external-link"
        />
      </div>
    </header>

    <main class="document-viewer-stage">
      <object
        v-if="documentSrc"
        :data="documentSrc"
        type="application/pdf"
        class="document-viewer-frame"
      >
        <div class="document-viewer-fallback">
          <AppState
            title="Preview unavailable"
            message="This browser cannot show the PDF preview here. Use Download or Open to view the document."
            variant="empty"
            icon="pi pi-file-pdf"
          />
        </div>
      </object>
      <AppState
        v-else
        title="Document unavailable"
        message="This document link is not valid."
        variant="error"
      />
    </main>
  </div>
</template>
