import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import pdfMake from 'pdfmake/build/pdfmake.js'
import pdfFonts from 'pdfmake/build/vfs_fonts.js'

pdfMake.vfs = pdfFonts?.pdfMake?.vfs ?? pdfFonts?.vfs

const societyStampAssetPath = 'images/ajowa-stamp-signature.jpeg'
let cachedSocietyStampImage: string | null | undefined

export const getSocietyStampImage = () => {
  if (cachedSocietyStampImage !== undefined) return cachedSocietyStampImage

  const candidates = [
    join(process.cwd(), 'public', societyStampAssetPath),
    join(process.cwd(), '.output', 'public', societyStampAssetPath),
    join(process.cwd(), '..', 'public', societyStampAssetPath),
  ]
  const stampPath = candidates.find((candidate) => existsSync(candidate))

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
