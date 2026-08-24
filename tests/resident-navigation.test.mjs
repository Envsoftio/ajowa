import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('resident data navigation is lazy, cached per user, and immediately revalidated', async () => {
  const source = await readSource('../composables/useResidentAsyncData.ts')

  assert.match(source, /useLazyAsyncData<DataT>/)
  assert.match(source, /authStore\.me\?\.user\.id/)
  assert.match(source, /app\.payload\.data\[resolvedKey\]/)
  assert.match(source, /app\.static\.data\[resolvedKey\]/)
  assert.match(source, /onMounted\(\(\) => \{/)
  assert.match(source, /cause: 'refresh:manual'/)
  assert.match(source, /asyncData\.pending\.value && asyncData\.data\.value == null/)
})

test('resident shell shows central loading feedback for background data refreshes', async () => {
  const source = await readSource('../components/app/AppShell.vue')

  assert.match(source, /const residentDataLoading = useResidentDataLoading\(\)/)
  assert.match(source, /residentDataLoading\.value > 0/)
  assert.match(source, /v-if="showLoadingOverlay"/)
})
