import assert from 'node:assert/strict'
import test from 'node:test'
import { getApiErrorMessage } from '../composables/useApi.ts'
import { AppError, toApiError } from '../server/utils/errors.ts'

test('shows the existing payment reference conflict instead of a generic request failure', () => {
  const error = toApiError(new AppError({
    code: 'CONFLICT',
    statusCode: 409,
    message: 'This UTR/reference is already linked to a payment.',
  }))

  assert.equal(error.statusCode, 409)
  assert.equal(
    getApiErrorMessage({ data: { data: error.data } }),
    'This UTR/reference is already linked to a payment.',
  )
})
