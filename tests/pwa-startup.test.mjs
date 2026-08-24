import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('installed PWA starts from the lightweight launch page', async () => {
  const manifest = JSON.parse(await readSource('../public/manifest.webmanifest'))
  const launchPage = await readSource('../public/launch.html')

  assert.equal(manifest.start_url, '/launch.html')
  assert.match(launchPage, /fetch\('\/api\/auth\/me'/)
  assert.match(launchPage, /readRememberedDestination/)
  assert.match(launchPage, /window\.localStorage\.getItem\(destinationStorageKey\)/)
  assert.match(launchPage, /window\.location\.replace/)
})

test('auth store remembers only the landing route and clears it on logout', async () => {
  const source = await readSource('../stores/auth.ts')

  assert.match(source, /PWA_DESTINATION_STORAGE_KEY = 'ajowa:pwa-destination'/)
  assert.match(source, /rememberPwaDestination\(this\.me\)/)
  assert.match(source, /rememberPwaDestination\(null\)/)
  assert.doesNotMatch(source, /localStorage\.setItem\([^,]+,\s*JSON\.stringify\(me/)
})

test('service worker precaches only the public launch document', async () => {
  const source = await readSource('../public/sw.js')

  assert.match(source, /'\/launch\.html'/)
  assert.match(source, /url\.pathname === '\/launch\.html'/)
  assert.match(source, /Authenticated Nuxt/)
  assert.match(source, /request\.mode === 'navigate'/)
})
