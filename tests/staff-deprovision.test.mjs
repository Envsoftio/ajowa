import assert from 'node:assert/strict'
import test from 'node:test'
import { deprovisionStaffMember } from '../server/utils/staff-deprovision.ts'

const compact = (sql) => sql.replace(/\s+/g, ' ').trim().toLowerCase()

test('archives staff identity, revokes login access, and preserves attribution', async () => {
  const queries = []
  const client = {
    async query(sql, values = []) {
      const text = compact(sql)
      queries.push({ text, values })

      if (text.startsWith('select id, status::text as status')) {
        return {
          rows: [
            {
              id: '22222222-2222-4222-8222-222222222222',
              status: 'IN_PROGRESS',
            },
          ],
        }
      }

      return { rows: [] }
    },
  }

  const result = await deprovisionStaffMember(client, {
    userId: '11111111-1111-4111-8111-111111111111',
    societyId: '33333333-3333-4333-8333-333333333333',
    actorUserId: '44444444-4444-4444-8444-444444444444',
    authUserId: '55555555-5555-4555-8555-555555555555',
    email: 'former.staff@example.com',
  })

  assert.deepEqual(result, { openTicketsRequeued: 1 })

  const statements = queries.map((query) => query.text)
  const userArchive = statements.find((sql) => sql.startsWith('update users'))
  const authArchive = statements.find((sql) =>
    sql.startsWith('update auth_users'),
  )

  assert.ok(userArchive)
  assert.ok(authArchive)
  assert.doesNotMatch(userArchive, /auth_user_id\s*=\s*null/)
  assert.ok(statements.includes('delete from auth_sessions where user_id = $1'))
  assert.ok(statements.includes('delete from auth_accounts where user_id = $1'))
  assert.ok(
    statements.includes('delete from auth_verifications where value = $1'),
  )
  assert.ok(
    statements.some((sql) => sql.startsWith('update push_subscriptions')),
  )
  assert.ok(
    statements.some((sql) => sql.startsWith('update notification_jobs')),
  )
  assert.ok(
    statements.some((sql) => sql.startsWith('update shared_report_links')),
  )
  assert.equal(
    statements.some((sql) => sql.startsWith('delete from auth_users')),
    false,
  )
  assert.match(authArchive, /email = \$2/)
  assert.ok(
    queries.some(
      ({ text, values }) =>
        text.startsWith('update auth_users') &&
        values[1] ===
          'archived+55555555-5555-4555-8555-555555555555@deleted.ajowa.invalid',
    ),
  )
  assert.ok(
    statements.some(
      (sql) =>
        sql.startsWith('update service_requests') &&
        sql.includes("status = 'needs_reassignment'"),
    ),
  )
  assert.ok(
    statements.some((sql) =>
      sql.startsWith('insert into service_request_events'),
    ),
  )
})

test('archives staff without auth identity or open tickets', async () => {
  const queries = []
  const client = {
    async query(sql, values = []) {
      const text = compact(sql)
      queries.push({ text, values })

      if (text.startsWith('select id, status::text as status')) {
        return { rows: [] }
      }

      return { rows: [] }
    },
  }

  const result = await deprovisionStaffMember(client, {
    userId: '11111111-1111-4111-8111-111111111111',
    societyId: '33333333-3333-4333-8333-333333333333',
    actorUserId: '44444444-4444-4444-8444-444444444444',
    authUserId: null,
    email: null,
  })

  assert.deepEqual(result, { openTicketsRequeued: 0 })
  assert.equal(
    queries.some(({ text }) => text.startsWith('delete from auth_')),
    false,
  )
  assert.equal(
    queries.some(({ text }) => text.startsWith('update auth_users')),
    false,
  )
  assert.equal(
    queries.some(({ text }) => text.startsWith('update service_requests')),
    false,
  )
  assert.ok(queries.some(({ text }) => text.startsWith('update users')))
})
