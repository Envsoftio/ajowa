<script setup lang="ts">
import { isInternalDocumentUrl } from '~/shared/document-links'

defineOptions({
  inheritAttrs: false,
})

const props = withDefaults(defineProps<{
  href: string
  viewerTitle?: string
  mobileViewer?: boolean
}>(), {
  viewerTitle: '',
  mobileViewer: true,
})

const attrs = useAttrs()
const route = useRoute()

const isStandaloneDisplay = () => {
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean }

  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true
}

const shouldUseMobileViewer = () => {
  if (!import.meta.client) {
    return false
  }

  return (
    isStandaloneDisplay() ||
    window.matchMedia('(max-width: 768px)').matches ||
    /Android|iPhone|iPad|iPod|Mobile/i.test(window.navigator.userAgent)
  )
}

const getStringAttr = (name: string) => {
  const value = attrs[name]

  return typeof value === 'string' && value.trim() ? value.trim() : ''
}

const handleClick = (event: MouseEvent) => {
  if (
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    !props.mobileViewer ||
    !shouldUseMobileViewer() ||
    !isInternalDocumentUrl(props.href)
  ) {
    return
  }

  event.preventDefault()

  const query: Record<string, string> = {
    src: props.href,
    returnTo: route.fullPath,
  }

  const title = props.viewerTitle || getStringAttr('label') || getStringAttr('title')
  if (title) {
    query.title = title
  }

  const fileName = getStringAttr('download')
  if (fileName) {
    query.fileName = fileName
  }

  void navigateTo({
    path: '/document',
    query,
  })
}
</script>

<template>
  <Button
    v-bind="$attrs"
    as="a"
    :href="href"
    target="_blank"
    rel="noopener noreferrer"
    @click="handleClick"
  />
</template>
