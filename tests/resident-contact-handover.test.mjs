import test from 'node:test'
import assert from 'node:assert/strict'
import { releasePreviousFlatContacts } from '../server/utils/resident-relationships.ts'

test('an active replacement contact atomically releases the previous flat contacts', async () => {
  const calls = []
  const client = {
    query: async (sql, values) => {
      calls.push({ sql, values })
      return { rows: [] }
    },
  }

  await releasePreviousFlatContacts(client, {
    id: 'e30dd7d4-688a-4b06-8ccf-cba54a89634e',
    flatId: '6bd76ee6-741f-4ab4-9cec-cb80d1946b41',
    isPrimaryContact: true,
    isBillingContact: true,
    isActive: true,
  })

  assert.equal(calls.length, 1)
  assert.match(calls[0].sql, /update flat_residents/)
  assert.match(calls[0].sql, /id <> \$2::uuid/)
  assert.deepEqual(calls[0].values, [
    '6bd76ee6-741f-4ab4-9cec-cb80d1946b41',
    'e30dd7d4-688a-4b06-8ccf-cba54a89634e',
    true,
    true,
  ])
})

test('a newly created contact can take over when it has no relationship id yet', async () => {
  const calls = []
  const client = {
    query: async (_sql, values) => {
      calls.push(values)
      return { rows: [] }
    },
  }

  await releasePreviousFlatContacts(client, {
    flatId: '6bd76ee6-741f-4ab4-9cec-cb80d1946b41',
    isPrimaryContact: true,
    isBillingContact: true,
    isActive: true,
  })

  assert.equal(calls.length, 1)
  assert.equal(calls[0][1], null)
})

test('inactive or ordinary relationships do not alter existing contacts', async () => {
  let queryCount = 0
  const client = {
    query: async () => {
      queryCount += 1
      return { rows: [] }
    },
  }

  await releasePreviousFlatContacts(client, {
    flatId: '6bd76ee6-741f-4ab4-9cec-cb80d1946b41',
    isPrimaryContact: true,
    isBillingContact: true,
    isActive: false,
  })
  await releasePreviousFlatContacts(client, {
    flatId: '6bd76ee6-741f-4ab4-9cec-cb80d1946b41',
    isPrimaryContact: false,
    isBillingContact: false,
    isActive: true,
  })

  assert.equal(queryCount, 0)
})
