import { spawn } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import http from 'node:http'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import WebSocket from 'ws'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const rootDir = path.resolve(__dirname, '..')
const outDir = path.join(rootDir, 'docs')
const assetDir = path.join(outDir, 'flat-owner-guide-assets')
const guideHtmlPath = path.join(outDir, 'ajowa-flat-owner-user-guide.html')
const guidePdfPath = path.join(outDir, 'ajowa-flat-owner-user-guide.pdf')
const chromePath = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'
const baseUrl = process.env.AJOWA_GUIDE_BASE_URL ?? 'https://ajowa.in'
const email = process.env.AJOWA_GUIDE_EMAIL
const password = process.env.AJOWA_GUIDE_PASSWORD

if (!email || !password) {
  throw new Error('Set AJOWA_GUIDE_EMAIL and AJOWA_GUIDE_PASSWORD before running this script.')
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

const httpJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let body = ''
        response.on('data', (chunk) => {
          body += chunk
        })
        response.on('end', () => {
          try {
            resolve(JSON.parse(body))
          } catch (error) {
            reject(error)
          }
        })
      })
      .on('error', reject)
  })

class Cdp {
  constructor(wsUrl) {
    this.ws = new WebSocket(wsUrl)
    this.nextId = 1
    this.pending = new Map()
    this.sessions = new Map()
  }

  async open() {
    await new Promise((resolve, reject) => {
      this.ws.once('open', resolve)
      this.ws.once('error', reject)
    })

    this.ws.on('message', (raw) => {
      const message = JSON.parse(raw)
      if (message.id && this.pending.has(message.id)) {
        const { resolve, reject } = this.pending.get(message.id)
        this.pending.delete(message.id)
        if (message.error) reject(new Error(message.error.message))
        else resolve(message.result)
        return
      }

      if (message.sessionId && this.sessions.has(message.sessionId)) {
        this.sessions.get(message.sessionId)(message)
      }
    })
  }

  command(method, params = {}, sessionId) {
    const id = this.nextId++
    this.ws.send(JSON.stringify({ id, method, params, sessionId }))
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
    })
  }

  onSession(sessionId, handler) {
    this.sessions.set(sessionId, handler)
  }

  close() {
    this.ws.close()
  }
}

const waitForChrome = async (port) => {
  const deadline = Date.now() + 15000
  while (Date.now() < deadline) {
    try {
      return await httpJson(`http://127.0.0.1:${port}/json/version`)
    } catch {
      await sleep(250)
    }
  }
  throw new Error('Chrome did not expose a debugging endpoint in time.')
}

const jsString = (value) => JSON.stringify(value)

const guideSteps = [
  {
    title: 'Sign In',
    url: '/login',
    file: '01-sign-in.png',
    notes: [
      'Open ajowa.in/login, enter the registered flat-owner email address and password, then select Login.',
      'Use Forgot password if access needs to be reset.',
    ],
    markers: [
      { n: 1, x: 51, y: 47, text: 'Email' },
      { n: 2, x: 51, y: 55, text: 'Password' },
      { n: 3, x: 51, y: 63, text: 'Login' },
    ],
  },
  {
    title: 'Review Dues',
    url: '/my/dues',
    file: '02-my-dues.png',
    notes: [
      'The top cards summarize current balance, total due, and linked flats.',
      'Each flat section shows bill rows, due dates, paid amounts, pending balance, and payment availability.',
      'Select View breakdown to inspect charge components before making a payment.',
    ],
    markers: [
      { n: 1, x: 30, y: 22, text: 'Balance summary' },
      { n: 2, x: 74, y: 22, text: 'Linked flats' },
      { n: 3, x: 81, y: 56, text: 'Bill actions' },
    ],
  },
  {
    title: 'Download Receipts',
    url: '/my/receipts',
    file: '03-receipts.png',
    notes: [
      'Use Receipts to confirm payments already recorded against the owner account.',
      'Filter or search when many receipts are listed, then download or open the receipt needed for records.',
    ],
    markers: [
      { n: 1, x: 24, y: 25, text: 'Receipt list' },
      { n: 2, x: 78, y: 44, text: 'Open/download' },
    ],
  },
  {
    title: 'Read Notices',
    url: '/my/notices',
    file: '04-notices.png',
    notes: [
      'Notices show society announcements, attachments, priority, and publish dates.',
      'Pinned or recent items should be reviewed first.',
    ],
    markers: [
      { n: 1, x: 28, y: 30, text: 'Notice cards' },
      { n: 2, x: 76, y: 34, text: 'Attachments/status' },
    ],
  },
  {
    title: 'Raise Service Requests',
    url: '/my/service-requests',
    file: '05-service-requests.png',
    notes: [
      'Open Service Requests to track existing tickets and their current status.',
      'Select New request to report an issue for a linked flat or common area.',
    ],
    markers: [
      { n: 1, x: 26, y: 26, text: 'Ticket overview' },
      { n: 2, x: 82, y: 20, text: 'New request' },
      { n: 3, x: 74, y: 55, text: 'Ticket status' },
    ],
  },
  {
    title: 'Create A New Request',
    url: '/my/service-requests/new',
    file: '06-new-service-request.png',
    notes: [
      'Choose the flat or location, select the service category, add a clear title, and describe the issue.',
      'Attach photos when helpful, then submit the request for society/service-team action.',
    ],
    markers: [
      { n: 1, x: 30, y: 34, text: 'Flat/location' },
      { n: 2, x: 31, y: 49, text: 'Issue details' },
      { n: 3, x: 77, y: 76, text: 'Submit' },
    ],
  },
  {
    title: 'Use Gate QR Access',
    url: '/my/qr',
    file: '07-qr-access.png',
    notes: [
      'The QR page shows the resident access pass linked to active flats.',
      'Keep the QR visible for guard scanning and refresh the page if the code has expired.',
    ],
    markers: [
      { n: 1, x: 50, y: 38, text: 'QR pass' },
      { n: 2, x: 50, y: 71, text: 'Linked flat details' },
    ],
  },
  {
    title: 'Manage Profile',
    url: '/my/profile',
    file: '08-profile.png',
    notes: [
      'Profile contains contact details, linked flat information, photo, and resident visibility settings.',
      'Keep phone, email, profession, and emergency information up to date.',
    ],
    markers: [
      { n: 1, x: 25, y: 28, text: 'Personal details' },
      { n: 2, x: 75, y: 40, text: 'Linked flats' },
      { n: 3, x: 75, y: 68, text: 'Visibility/settings' },
    ],
  },
  {
    title: 'Notification Settings',
    url: '/my/settings/notifications',
    file: '09-notification-settings.png',
    notes: [
      'Choose email, SMS, WhatsApp, or browser notification preferences where available.',
      'Use these settings to keep bill, notice, and service updates reaching the right channel.',
    ],
    markers: [
      { n: 1, x: 31, y: 34, text: 'Channels' },
      { n: 2, x: 77, y: 65, text: 'Save changes' },
    ],
  },
  {
    title: 'Book Amenities',
    url: '/my/amenity-bookings',
    file: '10-amenity-bookings.png',
    notes: [
      'Amenity bookings show upcoming and past reservations for linked flats.',
      'Use New booking when the society has bookable facilities enabled.',
    ],
    markers: [
      { n: 1, x: 28, y: 30, text: 'Booking list' },
      { n: 2, x: 82, y: 20, text: 'New booking' },
    ],
  },
]

const waitForApp = async (cdp, sessionId) => {
  const deadline = Date.now() + 25000
  while (Date.now() < deadline) {
    const result = await cdp.command(
      'Runtime.evaluate',
      {
        expression: `(() => {
          const loading = document.querySelector('.app-loading-overlay')
          const bodyText = document.body?.innerText || ''
          return {
            ready: document.readyState,
            loading: Boolean(loading),
            bodyLength: bodyText.length,
            path: location.pathname
          }
        })()`,
        returnByValue: true,
      },
      sessionId,
    )
    const value = result.result.value
    if (value.ready === 'complete' && !value.loading && value.bodyLength > 50) return value
    await sleep(500)
  }
}

const navigate = async (cdp, sessionId, targetUrl) => {
  await cdp.command('Page.navigate', { url: targetUrl }, sessionId)
  await waitForApp(cdp, sessionId)
  await sleep(1200)
}

const screenshot = async (cdp, sessionId, filePath) => {
  const result = await cdp.command(
    'Page.captureScreenshot',
    { format: 'png', captureBeyondViewport: false, fromSurface: true },
    sessionId,
  )
  await writeFile(filePath, Buffer.from(result.data, 'base64'))
}

const evalValue = async (cdp, sessionId, expression) => {
  const result = await cdp.command('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, sessionId)
  return result.result.value
}

const makeGuideHtml = async () => {
  const imageTags = await Promise.all(
    guideSteps.map(async (step) => {
      const imagePath = path.join(assetDir, step.file)
      const image = (await readFile(imagePath)).toString('base64')
      const markers = step.markers
        .map(
          (marker) => `
            <div class="marker" style="left:${marker.x}%;top:${marker.y}%">
              <span>${marker.n}</span><b>${marker.text}</b>
            </div>`,
        )
        .join('')
      const notes = step.notes.map((note) => `<li>${note}</li>`).join('')
      return `
        <section class="step">
          <h2>${step.title}</h2>
          <div class="screenshot-wrap">
            <img src="data:image/png;base64,${image}" alt="${step.title} screenshot" />
            ${markers}
          </div>
          <ol>${notes}</ol>
        </section>`
    }),
  )

  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>AJOWA Flat Owner User Guide</title>
  <style>
    @page { size: A4; margin: 14mm; }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      color: #172033;
      font-family: Inter, Arial, sans-serif;
      font-size: 12px;
      line-height: 1.45;
      background: #fff;
    }
    .cover {
      min-height: 258mm;
      display: flex;
      flex-direction: column;
      justify-content: center;
      border-left: 8px solid #126c74;
      padding-left: 26px;
      page-break-after: always;
    }
    .cover p:first-child {
      color: #126c74;
      font-size: 13px;
      font-weight: 800;
      letter-spacing: 0;
      margin: 0 0 14px;
      text-transform: uppercase;
    }
    h1 {
      font-size: 38px;
      line-height: 1.08;
      margin: 0 0 18px;
      color: #0d2430;
    }
    .cover .subtitle {
      max-width: 520px;
      color: #435366;
      font-size: 16px;
      margin: 0 0 28px;
    }
    .meta {
      display: grid;
      grid-template-columns: 120px 1fr;
      gap: 8px 16px;
      max-width: 440px;
      border-top: 1px solid #d6dde5;
      padding-top: 18px;
    }
    .meta dt { color: #667488; font-weight: 700; }
    .meta dd { margin: 0; }
    .toc {
      page-break-after: always;
    }
    h2 {
      color: #0d2430;
      font-size: 22px;
      margin: 0 0 12px;
    }
    .toc ol {
      columns: 2;
      padding-left: 18px;
      line-height: 1.8;
    }
    .step {
      page-break-after: always;
    }
    .step:last-child {
      page-break-after: auto;
    }
    .screenshot-wrap {
      position: relative;
      width: 100%;
      border: 1px solid #d6dde5;
      border-radius: 6px;
      overflow: hidden;
      background: #f7fafc;
      box-shadow: 0 8px 22px rgba(15, 23, 42, 0.08);
    }
    img {
      display: block;
      width: 100%;
    }
    .marker {
      position: absolute;
      transform: translate(-18px, -18px);
      display: flex;
      align-items: center;
      gap: 6px;
      max-width: 190px;
      filter: drop-shadow(0 2px 4px rgba(0,0,0,.2));
    }
    .marker span {
      display: inline-flex;
      width: 28px;
      height: 28px;
      align-items: center;
      justify-content: center;
      border-radius: 50%;
      background: #d62f2f;
      color: #fff;
      border: 2px solid #fff;
      font-weight: 800;
      flex: 0 0 auto;
    }
    .marker b {
      padding: 4px 7px;
      border-radius: 4px;
      background: rgba(255,255,255,.96);
      color: #1f2937;
      border: 1px solid rgba(15,23,42,.16);
      font-size: 10px;
      line-height: 1.2;
    }
    .step ol {
      margin: 14px 0 0;
      padding-left: 19px;
      color: #324155;
      font-size: 12.5px;
    }
    .step li {
      margin-bottom: 6px;
    }
    .footer-note {
      color: #667488;
      font-size: 10px;
      margin-top: 16px;
    }
  </style>
</head>
<body>
  <section class="cover">
    <p>AJOWA Resident Portal</p>
    <h1>Flat Owner User Guide</h1>
    <p class="subtitle">A step-by-step guide for flat owners to sign in, review dues, download receipts, read notices, raise service requests, use QR access, update profile details, manage notifications, and book amenities.</p>
    <dl class="meta">
      <dt>Portal</dt><dd>${baseUrl}</dd>
      <dt>Audience</dt><dd>Flat owners / resident users</dd>
      <dt>Generated</dt><dd>${new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}</dd>
    </dl>
  </section>
  <section class="toc">
    <h2>Contents</h2>
    <ol>${guideSteps.map((step) => `<li>${step.title}</li>`).join('')}</ol>
    <p class="footer-note">Markers on screenshots identify the primary controls or areas referenced in each step.</p>
  </section>
  ${imageTags.join('\n')}
</body>
</html>`
}

const main = async () => {
  await mkdir(assetDir, { recursive: true })

  const port = 9228 + Math.floor(Math.random() * 500)
  const profileDir = path.join('/private/tmp', `ajowa-guide-chrome-${Date.now()}`)
  const chrome = spawn(chromePath, [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-networking',
    '--disable-sync',
    `--user-data-dir=${profileDir}`,
    `--remote-debugging-port=${port}`,
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] })

  try {
    const version = await waitForChrome(port)
    const cdp = new Cdp(version.webSocketDebuggerUrl)
    await cdp.open()
    const target = await cdp.command('Target.createTarget', { url: 'about:blank' })
    const attached = await cdp.command('Target.attachToTarget', { targetId: target.targetId, flatten: true })
    const sessionId = attached.sessionId

    await cdp.command('Page.enable', {}, sessionId)
    await cdp.command('Runtime.enable', {}, sessionId)
    await cdp.command('Emulation.setDeviceMetricsOverride', {
      width: 1440,
      height: 1100,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)

    await navigate(cdp, sessionId, `${baseUrl}/login`)
    await screenshot(cdp, sessionId, path.join(assetDir, guideSteps[0].file))

    const authResult = await evalValue(cdp, sessionId, `(async () => {
      const response = await fetch('/api/auth/sign-in/email', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          email: ${jsString(email)},
          password: ${jsString(password)},
          callbackURL: '/'
        })
      })
      return { ok: response.ok, status: response.status, text: await response.text() }
    })()`)
    if (!authResult?.ok) {
      throw new Error(`Login failed with status ${authResult?.status}: ${authResult?.text ?? ''}`)
    }
    await cdp.command('Page.navigate', { url: `${baseUrl}/` }, sessionId)
    await waitForApp(cdp, sessionId)
    await sleep(2500)

    const loggedIn = await evalValue(cdp, sessionId, `location.pathname !== '/login' && !document.body.innerText.includes('Login failed')`)
    if (!loggedIn) {
      throw new Error('Login did not complete. Check the provided credentials or account status.')
    }

    for (const step of guideSteps.slice(1)) {
      await navigate(cdp, sessionId, `${baseUrl}${step.url}`)
      await screenshot(cdp, sessionId, path.join(assetDir, step.file))
    }

    const guideHtml = await makeGuideHtml()
    await writeFile(guideHtmlPath, guideHtml, 'utf8')

    await navigate(cdp, sessionId, `file://${guideHtmlPath}`)
    await cdp.command('Emulation.setDeviceMetricsOverride', {
      width: 1240,
      height: 1754,
      deviceScaleFactor: 1,
      mobile: false,
    }, sessionId)
    await waitForApp(cdp, sessionId)
    const pdf = await cdp.command('Page.printToPDF', {
      printBackground: true,
      preferCSSPageSize: true,
    }, sessionId)
    await writeFile(guidePdfPath, Buffer.from(pdf.data, 'base64'))
    cdp.close()

    console.log(JSON.stringify({ guidePdfPath, guideHtmlPath, assetDir }, null, 2))
  } finally {
    chrome.kill('SIGTERM')
  }
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
