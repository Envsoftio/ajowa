import { AppError } from '~/server/utils/errors'
export default defineEventHandler(async () => {
  throw new AppError({
    code: 'FORBIDDEN',
    statusCode: 403,
    message: 'Public sign-up is disabled. Ask your society administrator to create your AJOWA account.',
  })
})
