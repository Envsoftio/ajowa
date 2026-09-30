import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import test from 'node:test'
import {
  getStatisticsGranularity,
  getStatisticsRangeDays,
} from '../server/utils/service-request-statistics.ts'

const readSource = (path) => readFile(new URL(path, import.meta.url), 'utf8')

test('service statistics choose readable buckets for supported date ranges', () => {
  assert.equal(getStatisticsRangeDays('2026-08-01', '2026-08-01'), 1)
  assert.equal(getStatisticsRangeDays('2026-08-01', '2026-08-31'), 31)
  assert.equal(getStatisticsGranularity(31), 'DAY')
  assert.equal(getStatisticsGranularity(32), 'WEEK')
  assert.equal(getStatisticsGranularity(180), 'WEEK')
  assert.equal(getStatisticsGranularity(181), 'MONTH')
})

test('resident service statistics are enabled by default for new and existing societies', async () => {
  const policies = await readSource('../server/utils/master-data.ts')
  const societyPage = await readSource('../pages/admin/society.vue')

  assert.match(
    policies,
    /residentServiceStatisticsEnabled: z\.boolean\(\)\.default\(true\)/,
  )
  assert.match(
    policies,
    /residentServiceStatisticsEnabled: true[\s\S]*defaultSocietyPolicies/,
  )
  assert.match(
    policies,
    /normalized\.residentServiceStatisticsEnabled \?\?[\s\S]*defaultSocietyPolicies\.residentServiceStatisticsEnabled/,
  )
  assert.match(societyPage, /Enabled by default/)
})

test('resident statistics include all society tickets as aggregate-only data', async () => {
  const source = await readSource(
    '../server/utils/service-request-statistics.ts',
  )

  assert.match(source, /sr\.society_id = \$1/)
  assert.doesNotMatch(source, /sr\.visibility = 'RESIDENT_VISIBLE'/)
  assert.doesNotMatch(source, /accessibleFlatIds/)
  assert.doesNotMatch(source, /sr\.flat_id =/)
  assert.match(source, /residentServiceStatisticsEnabled/)
  assert.doesNotMatch(source, /requester\.full_name/)
  assert.doesNotMatch(source, /requester_mobile_number/)
  assert.doesNotMatch(source, /sr\.description/)
  assert.doesNotMatch(source, /service_request_comments/)
  assert.doesNotMatch(source, /service_request_attachments/)
})

test('period metrics use the timestamp belonging to each lifecycle event', async () => {
  const source = await readSource(
    '../server/utils/service-request-statistics.ts',
  )

  assert.match(source, /const createdInRange = `sr\.created_at/)
  assert.match(source, /const resolvedInRange = `sr\.resolved_at/)
  assert.match(source, /const closedInRange = `sr\.closed_at/)
  assert.match(source, /const reopenedInRange = `sr\.reopened_at/)
  assert.match(source, /resolutionRate:/)
  assert.match(source, /averageFirstResponseMinutes:/)
  assert.match(source, /averageResolutionHours:/)
})

test('resident dashboard exposes complete filters and anonymization notice', async () => {
  const page = await readSource('../pages/my/service-request-statistics.vue')

  for (const filter of [
    'startDate',
    'endDate',
    'status',
    'category',
    'departmentId',
    'priority',
    'locationType',
  ]) {
    assert.match(page, new RegExp(`filters\\.${filter}`))
  }

  assert.match(page, /Privacy protected/)
  assert.match(page, /Opened, resolved, and closed/)
  assert.match(page, /Category performance/)
  assert.match(page, /Department performance/)
})

test('flat owners can open statistics directly from their service request account', async () => {
  const requestsPage = await readSource(
    '../pages/my/service-requests/index.vue',
  )
  const residentDashboard = await readSource('../pages/my/dues.vue')
  const shell = await readSource('../shared/shell.ts')

  assert.match(requestsPage, /href="\/my\/service-request-statistics"/)
  assert.match(requestsPage, /Service request statistics/)
  assert.match(requestsPage, /all society tickets/)
  assert.match(residentDashboard, /as="router-link"\s+to="\/my\/service-request-statistics"/)
  assert.match(residentDashboard, /View statistics/)
  assert.match(residentDashboard, /:loading="openingStatistics"/)
  assert.match(shell, /to: '\/my\/service-request-statistics'/)
})

test('resident statistics use compact mobile layouts', async () => {
  const page = await readSource('../pages/my/service-request-statistics.vue')

  assert.match(page, /data-label="Opened"/)
  assert.match(page, /Swipe to explore[\s\S]*full timeline/)
  assert.match(page, /@media \(max-width: 640px\)/)
  assert.match(page, /grid-template-columns: repeat\(2, minmax\(0, 1fr\)\)/)
  assert.match(page, /content: attr\(data-label\)/)
  assert.match(page, /service-statistics__kpi-heading/)
  assert.match(page, /@media \(max-width: 380px\)/)
  assert.match(page, /@media \(display-mode: standalone\)/)
})
