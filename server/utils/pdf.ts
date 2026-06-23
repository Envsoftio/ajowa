import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import pdfMake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'

pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs

const societyStampAssetPath = 'images/ajowa-stamp-signature.jpeg'
let cachedSocietyStampImage: string | null | undefined

const resolveSocietyStampAssetCandidates = (root: string) => [
  join(root, 'public', societyStampAssetPath),
  join(root, '.output', 'public', societyStampAssetPath),
  join(root, 'dist', 'public', societyStampAssetPath),
]

const findSocietyStampAssetPath = () => {
  let currentRoot = process.cwd()

  for (let depth = 0; depth < 8; depth++) {
    for (const candidate of resolveSocietyStampAssetCandidates(currentRoot)) {
      if (existsSync(candidate)) {
        return candidate
      }
    }

    const nextRoot = dirname(currentRoot)
    if (nextRoot === currentRoot) {
      break
    }
    currentRoot = nextRoot
  }

  return null
}

export const getSocietyStampImage = () => {
  if (cachedSocietyStampImage !== undefined) return cachedSocietyStampImage

  const stampPath = findSocietyStampAssetPath()

  try {
    cachedSocietyStampImage = stampPath
      ? `data:image/jpeg;base64,${readFileSync(stampPath).toString('base64')}`
      : null
  } catch {
    cachedSocietyStampImage = null
  }

  return cachedSocietyStampImage
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
