import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureResidentRelationshipsAreValid,
  handlePgResidentError,
  residentRelationshipSchema,
} from '../server/utils/master-data.ts'
import { AppError } from '../server/utils/errors.ts'
import { throwResidentSaveError } from '../server/utils/resident-api.ts'

const createEvent = () => ({
  context: {},
  method: 'POST',
  path: '/api/admin/residents',
  node: {
    req: { headers: {} },
    res: {
      headersSent: false,
      setHeader() {},
    },
  },
})

test('residentRelationshipSchema requires lease dates for TENANT relationships', () => {
  const invalidTenant = {
    flatId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    relationshipType: 'TENANT',
    isPrimaryContact: true,
    isBillingContact: true,
    canLogin: true,
    isActive: true,
  }

  const result = residentRelationshipSchema.safeParse(invalidTenant)
  assert.equal(result.success, false)
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message)
    assert.ok(
      issues.includes('Lease start date is required for tenant relationships.'),
    )
    assert.ok(
      issues.includes('Lease end date is required for tenant relationships.'),
    )
  }
})

test('residentRelationshipSchema rejects lease end date before start date for TENANT', () => {
  const invalidDatesTenant = {
    flatId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    relationshipType: 'TENANT',
    isPrimaryContact: true,
    isBillingContact: true,
    canLogin: true,
    isActive: true,
    leaseStartDate: '2026-08-01',
    leaseEndDate: '2026-07-01',
  }

  const result = residentRelationshipSchema.safeParse(invalidDatesTenant)
  assert.equal(result.success, false)
  if (!result.success) {
    const issues = result.error.issues.map((i) => i.message)
    assert.ok(
      issues.includes('Lease end date must be on or after lease start date.'),
    )
  }
})

test('residentRelationshipSchema accepts valid TENANT relationship with lease dates', () => {
  const validTenant = {
    flatId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    relationshipType: 'TENANT',
    isPrimaryContact: true,
    isBillingContact: true,
    canLogin: true,
    isActive: true,
    leaseStartDate: '2026-08-01',
    leaseEndDate: '2027-07-31',
  }

  const result = residentRelationshipSchema.safeParse(validTenant)
  assert.equal(result.success, true)
})

test('ensureResidentRelationshipsAreValid sanitizes non-tenant lease dates and validates tenant lease dates', () => {
  const relationships = [
    {
      flatId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      relationshipType: 'OWNER',
      isPrimaryContact: true,
      isBillingContact: true,
      canLogin: true,
      isActive: true,
      leaseStartDate: '2026-08-01',
      leaseEndDate: '2027-07-31',
    },
  ]

  ensureResidentRelationshipsAreValid({ relationships })
  assert.equal(relationships[0].leaseStartDate, null)
  assert.equal(relationships[0].leaseEndDate, null)

  const invalidTenantRels = [
    {
      flatId: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
      relationshipType: 'TENANT',
      isPrimaryContact: true,
      isBillingContact: true,
      canLogin: true,
      isActive: true,
      leaseStartDate: null,
      leaseEndDate: null,
    },
  ]

  assert.throws(
    () =>
      ensureResidentRelationshipsAreValid({ relationships: invalidTenantRels }),
    (err) =>
      err.statusCode === 400 &&
      err.message.includes(
        'Lease start date and lease end date are required for tenant relationships.',
      ),
  )
})

test('handlePgResidentError converts P0001 trigger exceptions into AppError', () => {
  const triggerError = new Error(
    'tenant relationships require lease_start_date and lease_end_date',
  )
  triggerError.code = 'P0001'

  assert.throws(
    () => handlePgResidentError(triggerError),
    (err) =>
      err.statusCode === 400 &&
      err.message ===
        'tenant relationships require lease_start_date and lease_end_date',
  )
})

test('handlePgResidentError converts active tenant 23505 duplicate into AppError', () => {
  const duplicateError = new Error(
    'duplicate key value violates unique constraint',
  )
  duplicateError.code = '23505'
  duplicateError.constraint = 'flat_residents_one_active_tenant_household_idx'

  assert.throws(
    () => handlePgResidentError(duplicateError),
    (err) =>
      err.statusCode === 409 &&
      err.message.includes('This flat already has an active tenant.'),
  )
})

test('handlePgResidentError preserves an actionable AppError', () => {
  const conflict = new AppError({
    code: 'CONFLICT',
    statusCode: 409,
    message: 'A resident with this email already exists in the society.',
  })

  assert.throws(
    () => handlePgResidentError(conflict),
    (err) => err === conflict,
  )
})

test('resident save errors expose a clear conflict message to the client', () => {
  const duplicatePrimaryContact = new Error(
    'duplicate key value violates unique constraint',
  )
  duplicatePrimaryContact.code = '23505'
  duplicatePrimaryContact.constraint = 'flat_residents_one_primary_contact_idx'

  assert.throws(
    () => throwResidentSaveError(createEvent(), duplicatePrimaryContact),
    (err) =>
      err.statusCode === 409 &&
      err.data?.message.includes(
        'This flat already has an active primary contact.',
      ),
  )
})

test('resident save errors explain when an email belongs to an existing account', () => {
  const duplicateAccount = new Error(
    'duplicate key value violates unique constraint',
  )
  duplicateAccount.code = '23505'
  duplicateAccount.constraint = 'users_auth_user_id_key'

  assert.throws(
    () => throwResidentSaveError(createEvent(), duplicateAccount),
    (err) =>
      err.statusCode === 409 &&
      err.data?.message ===
        'This email is already linked to an existing user account. Use a different email or update the existing user.',
  )
})

test('resident save errors do not expose unexpected database details', () => {
  const unexpectedDatabaseError = new Error(
    'password secret appeared in a database error',
  )
  unexpectedDatabaseError.code = 'XX000'

  assert.throws(
    () => throwResidentSaveError(createEvent(), unexpectedDatabaseError),
    (err) =>
      err.statusCode === 500 &&
      err.data?.message.startsWith(
        "We couldn't save the resident right now. Please try again. If the problem continues, contact support with reference ",
      ) &&
      !err.data?.message.includes('password secret'),
  )
})
