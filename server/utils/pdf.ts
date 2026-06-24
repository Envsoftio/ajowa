import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import pdfMake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'

pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs

const societyStampAssetPath = 'images/ajowa-stamp-signature.jpeg'
const societyStampPublicPath = '/images/ajowa-stamp-signature.jpeg'
let cachedSocietyStampImage: string | null | undefined

const resolveSocietyStampAssetCandidates = (root: string) => [
  join(root, societyStampAssetPath),
  join(root, 'public', societyStampAssetPath),
  join(root, '.output', 'public', societyStampAssetPath),
  join(root, 'dist', 'public', societyStampAssetPath),
  join(root, '.netlify', 'output', 'static', societyStampAssetPath),
  join(root, '.netlify', 'output', 'public', societyStampAssetPath),
  join(root, 'server', 'assets', societyStampAssetPath),
  join(root, 'assets', societyStampAssetPath),
  join(root, '..', 'public', societyStampAssetPath),
  join(root, '..', '..', 'public', societyStampAssetPath),
]

const findSocietyStampAssetPath = () => {
  const roots = new Set<string>()
  const seeds = [
    process.cwd(),
    process.env.PWD,
    process.env.INIT_CWD,
    process.argv[1] ? dirname(process.argv[1]) : null,
    dirname(fileURLToPath(import.meta.url)),
  ].filter((seed): seed is string => Boolean(seed))

  for (const seed of seeds) {
    let currentRoot = seed

    for (let depth = 0; depth < 10; depth++) {
      roots.add(currentRoot)

      const nextRoot = dirname(currentRoot)
      if (nextRoot === currentRoot) {
        break
      }
      currentRoot = nextRoot
    }
  }

  for (const currentRoot of roots) {
    for (const candidate of resolveSocietyStampAssetCandidates(currentRoot)) {
      if (existsSync(candidate)) {
        return candidate
      }
    }
  }

  return null
}

export const getSocietyStampImage = () => {
  if (cachedSocietyStampImage !== undefined) return cachedSocietyStampImage

  const stampPath = findSocietyStampAssetPath()

  try {
    if (!stampPath) {
      return null
    }

    cachedSocietyStampImage = `data:image/jpeg;base64,${readFileSync(stampPath).toString('base64')}`
  } catch {
    return null
  }

  return cachedSocietyStampImage
}

const getSocietyStampUrlCandidates = () =>
  [
    process.env.APP_URL,
    process.env.NUXT_PUBLIC_APP_URL,
    process.env.BETTER_AUTH_URL,
  ]
    .map((baseUrl) => baseUrl?.trim())
    .filter((baseUrl): baseUrl is string => Boolean(baseUrl))
    .map((baseUrl) => new URL(societyStampPublicPath, baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`).toString())

export const getSocietyStampImageForPdf = async () => {
  const localImage = getSocietyStampImage()
  if (localImage) return localImage

  for (const stampUrl of getSocietyStampUrlCandidates()) {
    try {
      const response = await fetch(stampUrl)
      if (!response.ok) continue

      const contentType = response.headers.get('content-type') ?? 'image/jpeg'
      const buffer = Buffer.from(await response.arrayBuffer())
      if (buffer.length === 0) continue

      cachedSocietyStampImage = `data:${contentType.includes('image/') ? contentType : 'image/jpeg'};base64,${buffer.toString('base64')}`
      return cachedSocietyStampImage
    } catch {
      // Keep trying the remaining configured public URLs.
    }
  }

  return null
}

export const createPdfBuffer = async (docDefinition: Record<string, unknown>) =>
  await new Promise<Buffer>((resolve, reject) => {
    pdfMake.createPdf(docDefinition).getBuffer((pdfBuffer: Buffer) => {
      try {
        resolve(Buffer.from(pdfBuffer))
      } catch (error) {
        reject(error)
      }
    })
  })
