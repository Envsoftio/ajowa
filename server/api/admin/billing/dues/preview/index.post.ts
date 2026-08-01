import { readJsonBody, validateInput } from '~/server/utils/api'
import {
  createDueGenerationPreview,
  dueGenerationPreviewInputSchema,
} from './index.get'

export default defineEventHandler(async (event) => {
  const input = validateInput(
    dueGenerationPreviewInputSchema,
    await readJsonBody(event),
  )

  return createDueGenerationPreview(event, input)
})
