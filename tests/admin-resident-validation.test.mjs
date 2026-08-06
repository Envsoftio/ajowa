import test from 'node:test'
import assert from 'node:assert/strict'
import {
  ensureResidentRelationshipsAreValid,
  handlePgResidentError,
  residentRelationshipSchema,
} from '../server/utils/master-data.ts'

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
    assert.ok(issues.includes('Lease start date is required for tenant relationships.'))
    assert.ok(issues.includes('Lease end date is required for tenant relationships.'))
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
    assert.ok(issues.includes('Lease end date must be on or after lease start date.'))
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
    () => ensureResidentRelationshipsAreValid({ relationships: invalidTenantRels }),
    (err) => err.statusCode === 400 && err.message.includes('Lease start date and lease end date are required for tenant relationships.'),
  )
})

test('handlePgResidentError converts P0001 trigger exceptions into AppError', () => {
  const triggerError = new Error('tenant relationships require lease_start_date and lease_end_date')
  triggerError.code = 'P0001'

  assert.throws(
    () => handlePgResidentError(triggerError),
    (err) =>
      err.statusCode === 400 &&
      err.message === 'tenant relationships require lease_start_date and lease_end_date',
  )
})

test('handlePgResidentError converts active tenant 23505 duplicate into AppError', () => {
  const duplicateError = new Error('duplicate key value violates unique constraint')
  duplicateError.code = '23505'
  duplicateError.constraint = 'flat_residents_one_active_tenant_household_idx'

  assert.throws(
    () => handlePgResidentError(duplicateError),
    (err) =>
      err.statusCode === 409 &&
      err.message.includes('This flat already has an active tenant.'),
  )
})

