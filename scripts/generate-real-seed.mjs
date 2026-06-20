import fs from 'node:fs'
import path from 'node:path'
import process from 'node:process'
import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const XLSX = require('xlsx')

const workbookPath = process.argv[2] || '/Users/vishnu/Desktop/Workbook1.xlsx'
const outputPath = process.argv[3] || path.resolve('supabase/seed.sql')
const camRate = 3.25
const passwordHash =
  '83fc1288198e6f8b3b40b8c0defb7548:10b7066831355797e1a6b7b9f799b311337b3ad375a142609838916f18745908e2dc14d9de287efa542747de7203b350cb8cc50c2f04562eb21a2eed1120cc0f'
const importUuidNamespace = '2da98afe-ee9b-4dd3-9f62-bcc9fc9def81'
const adminEmail = 'acmejubilee.rwa@gmail.com'
const reservedLoginEmails = new Set([adminEmail])

const workbook = XLSX.readFile(workbookPath)
const sheet = workbook.Sheets[workbook.SheetNames[0]]
const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: false, defval: '' })
const rawRows = XLSX.utils.sheet_to_json(sheet, { header: 1, raw: true, defval: '' })

const dataRows = rows
  .slice(1)
  .filter((row) => row.some((cell) => String(cell).trim()))

const sanitizeAscii = (value) =>
  String(value ?? '')
    .normalize('NFKD')
    .replace(/[^\x20-\x7E]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()

const normalizeDisplayName = (value) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map(sanitizeAscii)
    .filter(Boolean)
    .join(' / ')

const normalizeRawField = (value) =>
  String(value ?? '')
    .split(/\r?\n/)
    .map(sanitizeAscii)
    .filter(Boolean)
    .join('; ')

const workbookHeaders = rawRows[0].map((cell) => String(cell ?? '').trim())

const sourceCellValue = (value) => {
  if (value === null || value === undefined) {
    return ''
  }

  if (typeof value === 'string') {
    return value.trim()
  }

  return value
}

const slug = (value) =>
  sanitizeAscii(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '.')
    .replace(/^\.+|\.+$/g, '')

const uuidToBytes = (value) => Buffer.from(value.replace(/-/g, ''), 'hex')

const formatUuidBytes = (bytes) => {
  const hex = Buffer.from(bytes).toString('hex')
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`
}

const uuidV5 = (value) => {
  const hash = createHash('sha1')
    .update(uuidToBytes(importUuidNamespace))
    .update(value)
    .digest()
    .subarray(0, 16)

  hash[6] = (hash[6] & 0x0f) | 0x50
  hash[8] = (hash[8] & 0x3f) | 0x80

  return formatUuidBytes(hash)
}

const sql = (value) => {
  if (value === null || value === undefined || value === '') {
    return 'null'
  }

  return `'${String(value).replace(/'/g, "''")}'`
}

const sqlBool = (value) => (value ? 'true' : 'false')

const parseFlat = (value) => {
  const flatNumber = sanitizeAscii(value).toUpperCase()
  const match = flatNumber.match(/^T(\d+)-(\d+)$/)

  if (!match) {
    throw new Error(`Invalid flat number: ${value}`)
  }

  const towerNumber = Number(match[1])
  const unitNumber = Number(match[2])

  return {
    flatNumber,
    towerCode: `T${towerNumber}`,
    towerNumber,
    floorLabel: String(Math.floor(unitNumber / 100)),
  }
}

const normalizePhone = (value) => {
  const raw = sanitizeAscii(value)

  if (!raw) {
    return null
  }

  if (raw.startsWith('+')) {
    const digits = raw.slice(1).replace(/\D/g, '')
    return digits.length >= 8 ? `+${digits}` : null
  }

  const digits = raw.replace(/\D/g, '')
  if (digits.length === 10) {
    return `+91${digits}`
  }

  if (digits.length >= 8 && digits.length <= 20) {
    return digits
  }

  return null
}

const parsePhones = (value) =>
  String(value ?? '')
    .split(/[\r\n;,]+/)
    .map(normalizePhone)
    .filter(Boolean)

const emailPattern = /^[^@\s]+@[^@\s]+\.[^@\s]+$/
const parseEmails = (value) =>
  String(value ?? '')
    .toLowerCase()
    .split(/[\r\n;,]+/)
    .map((item) => item.trim())
    .filter((item) => item && !['na', 'n/a', '--', 'nil'].includes(item))
    .filter((item) => emailPattern.test(item))

const normalizeOccupancyStatus = (residentStatus, occupancyRaw) => {
  const occupancy = sanitizeAscii(occupancyRaw).toUpperCase()

  if (occupancy === 'VACANT' || occupancy.startsWith('VACANT;')) {
    return 'VACANT'
  }

  if (sanitizeAscii(residentStatus).toUpperCase() === 'TENANT') {
    return 'TENANTED'
  }

  return 'SELF_OCCUPIED'
}

const parseTenantNames = (residentStatus, occupancyRaw) => {
  if (sanitizeAscii(residentStatus).toUpperCase() !== 'TENANT') {
    return []
  }

  const occupancy = sanitizeAscii(occupancyRaw)
  if (!occupancy || occupancy.toUpperCase() === 'VACANT') {
    return []
  }

  return occupancy
    .replace(/\(C\)/gi, '')
    .replace(/\bSELF OCCUPIED\b/gi, '')
    .split(/[;\n]+/)
    .map(sanitizeAscii)
    .map((item) => item.replace(/\s+/g, ' ').trim())
    .filter(Boolean)
    .filter((item) => !['VACANT', 'NA', 'N/A', '--'].includes(item.toUpperCase()))
}

const preliminaryRows = dataRows.map((row, index) => {
  const flat = parseFlat(row[2])
  const ownerName = normalizeDisplayName(row[1])
  const ownerKey = ownerName.toLowerCase()
  const emails = parseEmails(row[4])

  return {
    sourceRow: index + 2,
    serialNumber: Number(row[0]) || index + 1,
    ownerName,
    ownerKey,
    candidateEmail: emails[0] ?? null,
    flat,
  }
})

const emailOwners = new Map()
for (const row of preliminaryRows) {
  if (!row.candidateEmail) continue
  const owners = emailOwners.get(row.candidateEmail) ?? new Set()
  owners.add(row.ownerKey)
  emailOwners.set(row.candidateEmail, owners)
}

const importRows = dataRows.map((row, index) => {
  const flat = parseFlat(row[2])
  const ownerName = normalizeDisplayName(row[1])
  const phones = parsePhones(row[3])
  const emails = parseEmails(row[4])
  const candidateEmail = emails[0] ?? null
  const canUseCandidateEmail =
    candidateEmail &&
    emailOwners.get(candidateEmail)?.size === 1 &&
    !reservedLoginEmails.has(candidateEmail)
  const ownerLoginEmail = canUseCandidateEmail ? candidateEmail : null
  const areaSqFt = Number(row[7])
  const ratePerSqFt = Number(row[8] || camRate)
  const residentStatus = sanitizeAscii(row[5]).toUpperCase()
  const occupancyRaw = normalizeRawField(row[6])
  const rawRow = rawRows[index + 1] ?? row
  const sourceData = Object.fromEntries(
    workbookHeaders.map((header, cellIndex) => [header, sourceCellValue(rawRow[cellIndex])]),
  )
  const ownerMobile = phones[0] ?? null
  const ownerIdentityKey = ownerLoginEmail
    ? `owner-email:${ownerLoginEmail}`
    : `owner-profile:${slug(ownerName) || `row.${index + 2}`}:${(ownerMobile ?? normalizeRawField(row[3])) || flat.flatNumber}`

  if (!areaSqFt || !ratePerSqFt) {
    throw new Error(`Missing area or rate for ${flat.flatNumber}`)
  }

  return {
    sourceRow: index + 2,
    serialNumber: Number(row[0]) || index + 1,
    ownerUserId: uuidV5(`ajowa:${ownerIdentityKey}`),
    ownerIdentityKey,
    ownerName,
    ownerMobile,
    rawContact: normalizeRawField(row[3]),
    rawEmail: normalizeRawField(row[4]),
    ownerLoginEmail,
    ownerCanLogin: Boolean(canUseCandidateEmail),
    ownerEmailSource: canUseCandidateEmail ? 'WORKBOOK' : 'NOT_PROVIDED_OR_DUPLICATE',
    residentStatus,
    occupancyRaw,
    sourceData,
    occupancyStatus: normalizeOccupancyStatus(residentStatus, row[6]),
    areaSqFt,
    ratePerSqFt,
    unitType: `${areaSqFt} SQFT`,
    ...flat,
  }
})

const tenantRows = []
for (const row of importRows) {
  const names = parseTenantNames(row.residentStatus, row.occupancyRaw)
  if (names.length > 0) {
    tenantRows.push({
      sourceRow: row.sourceRow,
      tenantUserId: uuidV5(`ajowa:tenant:${row.flatNumber}:${names.join('|').toLowerCase()}`),
      flatNumber: row.flatNumber,
      tenantSequence: 1,
      tenantName: names.join(' / '),
      tenantMobile: null,
      sourceOccupancy: row.occupancyRaw,
    })
  }
}

const unitValues = importRows
  .map((row) =>
        [
          row.sourceRow,
          row.serialNumber,
          sql(row.ownerUserId),
          sql(row.ownerIdentityKey),
          sql(row.ownerName),
          sql(row.ownerMobile),
          sql(row.rawContact),
          sql(row.rawEmail),
          sql(row.ownerLoginEmail),
          sqlBool(row.ownerCanLogin),
          sql(row.ownerEmailSource),
          sql(row.flatNumber),
          sql(row.towerCode),
          row.towerNumber,
          sql(row.floorLabel),
          sql(row.unitType),
          row.areaSqFt.toFixed(2),
          row.ratePerSqFt.toFixed(2),
          sql(row.residentStatus),
          sql(row.occupancyStatus),
          sql(row.occupancyRaw),
          sql(JSON.stringify(row.sourceData)),
        ].join(', '),
      )
  .map((row) => `    (${row})`)
  .join(',\n')

const tenantValues = tenantRows.length
  ? tenantRows
      .map((row) =>
        [
          row.sourceRow,
          sql(row.tenantUserId),
          sql(row.flatNumber),
          row.tenantSequence,
          sql(row.tenantName),
          sql(row.tenantMobile),
          sql(row.sourceOccupancy),
        ].join(', '),
      )
      .map((row) => `    (${row})`)
      .join(',\n')
  : ''

const serviceDepartments = [
  {
    code: 'SECURITY',
    name: 'Security & Gate',
    description: 'Gate operations, visitor entry, patrolling, access incidents, and resident safety support.',
  },
  {
    code: 'HOUSEKEEPING',
    name: 'Housekeeping',
    description: 'Cleaning of lobbies, corridors, common toilets, staircases, and shared resident areas.',
  },
  {
    code: 'PLUMBING',
    name: 'Plumbing',
    description: 'Leakages, bathroom and kitchen plumbing, blocked drains, valves, and water-line repairs.',
  },
  {
    code: 'ELECTRICAL',
    name: 'Electrical',
    description: 'Power issues, fixtures, DB panels, common-area lighting, and apartment electrical complaints.',
  },
  {
    code: 'LIFT_ELEVATOR',
    name: 'Lift & Elevator',
    description: 'Lift breakdowns, door issues, emergency alarms, preventive checks, and vendor coordination.',
  },
  {
    code: 'CIVIL_REPAIRS',
    name: 'Civil Repairs',
    description: 'Masonry, seepage, plaster, tiles, doors, railings, and minor structural repair coordination.',
  },
  {
    code: 'FIRE_SAFETY',
    name: 'Fire & Safety',
    description: 'Fire alarms, extinguishers, hydrants, evacuation readiness, and safety compliance checks.',
  },
  {
    code: 'WATER_STP',
    name: 'Water Supply & STP',
    description: 'Water supply, pumps, tanks, sewage treatment plant, pressure issues, and water quality concerns.',
  },
  {
    code: 'WASTE_MANAGEMENT',
    name: 'Waste Management',
    description: 'Door-to-door collection, garbage rooms, segregation, disposal vendors, and waste-area cleanliness.',
  },
  {
    code: 'LANDSCAPING',
    name: 'Landscaping & Horticulture',
    description: 'Garden upkeep, lawn care, plants, irrigation, pruning, and outdoor common-area beautification.',
  },
  {
    code: 'PEST_CONTROL',
    name: 'Pest Control',
    description: 'Scheduled pest treatment, mosquito control, termite checks, and complaint-based treatment.',
  },
  {
    code: 'PARKING_TRAFFIC',
    name: 'Parking & Traffic',
    description: 'Parking allocation support, vehicle movement, basement traffic, and unauthorized parking concerns.',
  },
  {
    code: 'AMENITIES',
    name: 'Clubhouse & Amenities',
    description: 'Clubhouse, gym, pool, play area, community hall, sports facilities, and booking-related support.',
  },
  {
    code: 'ADMIN_BILLING',
    name: 'Admin & Billing Helpdesk',
    description: 'Resident helpdesk, billing questions, documents, move-in support, and society-office coordination.',
  },
].map((department) => ({
  ...department,
  id: uuidV5(`ajowa:service-department:${department.code.toLowerCase()}`),
  allowsQueueVisibility: true,
}))

const serviceCategoryRoutes = [
  {
    categoryKey: 'SECURITY',
    categoryLabel: 'Security / gate support',
    locationType: 'COMMON_AREA',
    departmentCode: 'SECURITY',
    defaultPriority: 'HIGH',
  },
  {
    categoryKey: 'HOUSEKEEPING',
    categoryLabel: 'Housekeeping',
    locationType: null,
    departmentCode: 'HOUSEKEEPING',
    defaultPriority: 'MEDIUM',
  },
  {
    categoryKey: 'CLEANING',
    categoryLabel: 'Cleaning',
    locationType: null,
    departmentCode: 'HOUSEKEEPING',
    defaultPriority: 'MEDIUM',
  },
  {
    categoryKey: 'PLUMBING',
    categoryLabel: 'Plumbing',
    locationType: null,
    departmentCode: 'PLUMBING',
    defaultPriority: 'MEDIUM',
  },
  {
    categoryKey: 'ELECTRICAL',
    categoryLabel: 'Electrical',
    locationType: null,
    departmentCode: 'ELECTRICAL',
    defaultPriority: 'MEDIUM',
  },
  {
    categoryKey: 'LIFT',
    categoryLabel: 'Lift / elevator',
    locationType: 'COMMON_AREA',
    departmentCode: 'LIFT_ELEVATOR',
    defaultPriority: 'HIGH',
  },
  {
    categoryKey: 'CIVIL',
    categoryLabel: 'Civil repair',
    locationType: null,
    departmentCode: 'CIVIL_REPAIRS',
    defaultPriority: 'MEDIUM',
  },
  {
    categoryKey: 'OTHER',
    categoryLabel: 'General helpdesk',
    locationType: null,
    departmentCode: 'ADMIN_BILLING',
    defaultPriority: 'LOW',
  },
]

const serviceSlaRules = [
  { departmentCode: null, priority: 'LOW', acknowledgeWithinMinutes: 1440, resolveWithinMinutes: 10080 },
  { departmentCode: null, priority: 'MEDIUM', acknowledgeWithinMinutes: 240, resolveWithinMinutes: 2880 },
  { departmentCode: null, priority: 'HIGH', acknowledgeWithinMinutes: 60, resolveWithinMinutes: 720 },
  { departmentCode: null, priority: 'EMERGENCY', acknowledgeWithinMinutes: 15, resolveWithinMinutes: 120 },
  { departmentCode: 'SECURITY', priority: 'EMERGENCY', acknowledgeWithinMinutes: 5, resolveWithinMinutes: 60 },
  { departmentCode: 'FIRE_SAFETY', priority: 'EMERGENCY', acknowledgeWithinMinutes: 5, resolveWithinMinutes: 60 },
  { departmentCode: 'LIFT_ELEVATOR', priority: 'HIGH', acknowledgeWithinMinutes: 30, resolveWithinMinutes: 360 },
  { departmentCode: 'LIFT_ELEVATOR', priority: 'EMERGENCY', acknowledgeWithinMinutes: 10, resolveWithinMinutes: 90 },
  { departmentCode: 'WATER_STP', priority: 'HIGH', acknowledgeWithinMinutes: 30, resolveWithinMinutes: 480 },
]

const serviceDepartmentValues = serviceDepartments
  .map((department) =>
    [
      sql(department.id),
      sql(department.code),
      sql(department.name),
      sql(department.description),
      sqlBool(department.allowsQueueVisibility),
    ].join(', '),
  )
  .map((row) => `    (${row})`)
  .join(',\n')

const serviceRouteValues = serviceCategoryRoutes
  .map((route) =>
    [
      sql(route.categoryKey),
      sql(route.categoryLabel),
      sql(route.locationType),
      sql(route.departmentCode),
      sql(route.defaultPriority),
    ].join(', '),
  )
  .map((row) => `    (${row})`)
  .join(',\n')

const serviceSlaValues = serviceSlaRules
  .map((rule) =>
    [
      sql(rule.departmentCode),
      sql(rule.priority),
      rule.acknowledgeWithinMinutes,
      rule.resolveWithinMinutes,
    ].join(', '),
  )
  .map((row) => `    (${row})`)
  .join(',\n')

const seedSql = `do $$
declare
  v_password_hash constant text := '${passwordHash}';
  v_society_id uuid;
  v_admin_auth_id uuid;
  v_admin_user_id uuid;
begin
  create temporary table ajowa_unit_import (
    source_row integer not null,
    serial_number integer not null,
    owner_user_id uuid not null,
    owner_identity_key text not null,
    owner_name text not null,
    owner_mobile text,
    raw_contact text,
    raw_email text,
    owner_login_email extensions.citext,
    owner_can_login boolean not null,
    owner_email_source text not null,
    flat_number text not null,
    tower_code text not null,
    tower_number integer not null,
    floor_label text not null,
    unit_type text not null,
    area_sq_ft numeric(10,2) not null,
    rate_per_sq_ft numeric(10,2) not null,
    resident_status text not null,
    occupancy_status occupancy_status not null,
    occupancy_raw text,
    source_data jsonb not null
  ) on commit drop;

  insert into ajowa_unit_import (
    source_row,
    serial_number,
    owner_user_id,
    owner_identity_key,
    owner_name,
    owner_mobile,
    raw_contact,
    raw_email,
    owner_login_email,
    owner_can_login,
    owner_email_source,
    flat_number,
    tower_code,
    tower_number,
    floor_label,
    unit_type,
    area_sq_ft,
    rate_per_sq_ft,
    resident_status,
    occupancy_status,
    occupancy_raw,
    source_data
  )
  values
${unitValues};

  create temporary table ajowa_tenant_import (
    source_row integer not null,
    tenant_user_id uuid not null,
    flat_number text not null,
    tenant_sequence integer not null,
    tenant_name text not null,
    tenant_mobile text,
    source_occupancy text
  ) on commit drop;

${tenantValues ? `  insert into ajowa_tenant_import (
    source_row,
    tenant_user_id,
    flat_number,
    tenant_sequence,
    tenant_name,
    tenant_mobile,
    source_occupancy
  )
  values
${tenantValues};
` : ''}
  insert into society_profile (
    code,
    name,
    registration_number,
    address_line_1,
    city,
    state,
    pincode,
    contact_email,
    contact_phone,
    timezone,
    settings
  )
  values (
    'AJOWA',
    'AJOWA Society',
    'AJOWA-REG-001',
    'AJOWA Main Office',
    'Mohali',
    'Punjab',
    '160055',
    'acmejubilee.rwa@gmail.com',
    '+919999999999',
    'Asia/Kolkata',
    jsonb_build_object(
      'signup', jsonb_build_object('controlled', true),
      'tenantPaymentPerFlat', true,
      'familyAccess', true,
      'advanceCredit', true,
      'financeApprovalRequired', true,
      'attachmentsRequired', true,
      'highValueConfirmation', true,
      'ticketClosureRequiresReview', true,
      'managerBroadcastScope', 'CONFIGURABLE',
      'billingTenure', 'MONTHLY',
      'excessPaymentHandling', 'KEEP_AS_ADVANCE',
      'graceDays', 0,
      'lateFeePerDay', 50
    )
  )
  on conflict (code) do update
    set name = excluded.name,
        registration_number = excluded.registration_number,
        address_line_1 = excluded.address_line_1,
        city = excluded.city,
        state = excluded.state,
        pincode = excluded.pincode,
        contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone,
        timezone = excluded.timezone,
        settings = excluded.settings,
        updated_at = now()
  returning id into v_society_id;

  create temporary table ajowa_removed_local_auth_users on commit drop as
  select auth_user_id
  from users
  where society_id = v_society_id
    and auth_user_id is not null
    and (
      coalesce(email::text, '') ~ '^(owner|tenant)\\..*@ajowa\\.local$'
      or email::text in ('owner1@ajowa.local', 'tenant@ajowa.local', 'manager@ajowa.local')
    );

  delete from flat_residents fr
  using users u
  where fr.user_id = u.id
    and u.society_id = v_society_id
    and (
      coalesce(u.email::text, '') ~ '^(owner|tenant)\\..*@ajowa\\.local$'
      or u.email::text in ('owner1@ajowa.local', 'tenant@ajowa.local', 'manager@ajowa.local')
    );

  delete from users
  where society_id = v_society_id
    and (
      coalesce(email::text, '') ~ '^(owner|tenant)\\..*@ajowa\\.local$'
      or email::text in ('owner1@ajowa.local', 'tenant@ajowa.local', 'manager@ajowa.local')
    );

  delete from auth_accounts aa
  using ajowa_removed_local_auth_users du
  where aa.user_id = du.auth_user_id;

  delete from auth_users au
  using ajowa_removed_local_auth_users du
  where au.id = du.auth_user_id;

  insert into auth_users (name, email, email_verified, created_at, updated_at)
  values ('ACME Jubilee RWA Admin', 'acmejubilee.rwa@gmail.com', true, now(), now())
  on conflict (email) do update
    set name = excluded.name,
        email_verified = true,
        updated_at = now()
  returning id into v_admin_auth_id;

  insert into auth_accounts (account_id, provider_id, user_id, password, created_at, updated_at)
  values (v_admin_auth_id::text, 'credential', v_admin_auth_id, v_password_hash, now(), now())
  on conflict (provider_id, account_id) do update
    set password = excluded.password,
        updated_at = now();

  insert into users (
    society_id,
    auth_user_id,
    role,
    full_name,
    email,
    mobile_number,
    whatsapp_number,
    can_login,
    must_change_password,
    email_verified,
    is_active,
    kyc_status,
    police_verification_status,
    preferred_notification_channels
  )
  values (v_society_id, v_admin_auth_id, 'ADMIN', 'ACME Jubilee RWA Admin', 'acmejubilee.rwa@gmail.com', '+919999999991', '+919999999991', true, false, true, true, 'VERIFIED', 'NOT_REQUIRED', 'ALL_CHANNELS')
  on conflict (society_id, email) do update
    set auth_user_id = excluded.auth_user_id,
        role = excluded.role,
        full_name = excluded.full_name,
        mobile_number = excluded.mobile_number,
        whatsapp_number = excluded.whatsapp_number,
        can_login = excluded.can_login,
        must_change_password = excluded.must_change_password,
        email_verified = excluded.email_verified,
        is_active = excluded.is_active,
        kyc_status = excluded.kyc_status,
        police_verification_status = excluded.police_verification_status,
        preferred_notification_channels = excluded.preferred_notification_channels,
        updated_at = now();

  select id into v_admin_user_id
  from users
  where society_id = v_society_id and email = 'acmejubilee.rwa@gmail.com';

  create temporary table ajowa_service_department_seed (
    id uuid not null,
    code text not null,
    name text not null,
    description text not null,
    allows_queue_visibility boolean not null
  ) on commit drop;

  insert into ajowa_service_department_seed (
    id,
    code,
    name,
    description,
    allows_queue_visibility
  )
  values
${serviceDepartmentValues};

  insert into service_departments (
    id,
    society_id,
    code,
    name,
    description,
    is_active,
    allows_queue_visibility
  )
  select
    id,
    v_society_id,
    code,
    name,
    description,
    true,
    allows_queue_visibility
  from ajowa_service_department_seed
  on conflict (society_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        is_active = true,
        allows_queue_visibility = excluded.allows_queue_visibility,
        updated_at = now();

  create temporary table ajowa_service_route_seed (
    category_key text not null,
    category_label text not null,
    location_type text,
    department_code text not null,
    default_priority text not null
  ) on commit drop;

  insert into ajowa_service_route_seed (
    category_key,
    category_label,
    location_type,
    department_code,
    default_priority
  )
  values
${serviceRouteValues};

  delete from service_category_routes
  where society_id = v_society_id;

  insert into service_category_routes (
    society_id,
    category_key,
    category_label,
    location_type,
    department_id,
    default_priority,
    is_active
  )
  select
    v_society_id,
    route.category_key,
    route.category_label,
    route.location_type::service_location_type,
    department.id,
    route.default_priority::service_priority,
    true
  from ajowa_service_route_seed route
  inner join service_departments department
    on department.society_id = v_society_id
    and department.code = route.department_code;

  create temporary table ajowa_service_sla_seed (
    department_code text,
    priority text not null,
    acknowledge_within_minutes integer not null,
    resolve_within_minutes integer not null
  ) on commit drop;

  insert into ajowa_service_sla_seed (
    department_code,
    priority,
    acknowledge_within_minutes,
    resolve_within_minutes
  )
  values
${serviceSlaValues};

  delete from service_sla_rules
  where society_id = v_society_id;

  insert into service_sla_rules (
    society_id,
    department_id,
    priority,
    acknowledge_within_minutes,
    resolve_within_minutes,
    is_active
  )
  select
    v_society_id,
    department.id,
    sla.priority::service_priority,
    sla.acknowledge_within_minutes,
    sla.resolve_within_minutes,
    true
  from ajowa_service_sla_seed sla
  left join service_departments department
    on department.society_id = v_society_id
    and department.code = sla.department_code;

  insert into blocks (society_id, code, name, sort_order)
  select distinct
    v_society_id,
    tower_code,
    'Tower ' || tower_number,
    tower_number
  from ajowa_unit_import
  on conflict (society_id, code) do update
    set name = excluded.name,
        sort_order = excluded.sort_order,
        is_active = true,
        updated_at = now();

  insert into flats (
    society_id,
    block_id,
    flat_number,
    floor_label,
    unit_type,
    area_sq_ft,
    occupancy_status,
    is_active,
    import_metadata
  )
  select
    v_society_id,
    b.id,
    i.flat_number,
    i.floor_label,
    i.unit_type,
    i.area_sq_ft,
    i.occupancy_status,
    true,
    jsonb_build_object(
      'sourceFile', 'Workbook1.xlsx',
      'sourceRow', i.source_row,
      'serialNumber', i.serial_number,
      'sourceData', i.source_data,
      'normalized', jsonb_build_object(
        'towerCode', i.tower_code,
        'towerNumber', i.tower_number,
        'flatNumber', i.flat_number,
        'floorLabel', i.floor_label,
        'unitType', i.unit_type,
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft,
        'residentStatus', i.resident_status,
        'occupancyStatus', i.occupancy_status,
        'occupancyRaw', i.occupancy_raw
      )
    )
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  on conflict (block_id, flat_number) do update
    set floor_label = excluded.floor_label,
        unit_type = excluded.unit_type,
        area_sq_ft = excluded.area_sq_ft,
        occupancy_status = excluded.occupancy_status,
        import_metadata = excluded.import_metadata,
        is_active = true,
        updated_at = now();

  with owner_accounts as (
    select distinct on (owner_login_email)
      owner_name,
      owner_login_email,
      owner_can_login
    from ajowa_unit_import
    where owner_login_email is not null
    order by owner_login_email, source_row
  )
  insert into auth_users (name, email, email_verified, created_at, updated_at)
  select owner_name, owner_login_email, false, now(), now()
  from owner_accounts
  on conflict (email) do update
    set name = excluded.name,
        updated_at = now();

  with owner_accounts as (
    select distinct owner_login_email
    from ajowa_unit_import
    where owner_login_email is not null
  )
  insert into auth_accounts (account_id, provider_id, user_id, password, created_at, updated_at)
  select au.id::text, 'credential', au.id, v_password_hash, now(), now()
  from owner_accounts oa
  inner join auth_users au on au.email = oa.owner_login_email
  on conflict (provider_id, account_id) do update
    set password = excluded.password,
        updated_at = now();

  with owner_accounts as (
    select distinct on (owner_identity_key)
      owner_user_id,
      owner_identity_key,
      owner_name,
      owner_mobile,
      owner_login_email,
      owner_can_login
    from ajowa_unit_import
    where owner_login_email is not null
    order by owner_identity_key, source_row
  )
  insert into users (
    society_id,
    auth_user_id,
    role,
    full_name,
    email,
    mobile_number,
    whatsapp_number,
    can_login,
    must_change_password,
    email_verified,
    is_active,
    kyc_status,
    police_verification_status,
    preferred_notification_channels
  )
  select
    v_society_id,
    au.id,
    'RESIDENT',
    oa.owner_name,
    oa.owner_login_email,
    oa.owner_mobile,
    oa.owner_mobile,
    oa.owner_can_login,
    oa.owner_can_login,
    false,
    true,
    'PENDING',
    'PENDING',
    'ALL_CHANNELS'
  from owner_accounts oa
  inner join auth_users au on au.email = oa.owner_login_email
  on conflict (society_id, email) do update
    set auth_user_id = excluded.auth_user_id,
        role = excluded.role,
        full_name = excluded.full_name,
        mobile_number = excluded.mobile_number,
        whatsapp_number = excluded.whatsapp_number,
        can_login = excluded.can_login,
        must_change_password = excluded.must_change_password,
        email_verified = excluded.email_verified,
        is_active = excluded.is_active,
        kyc_status = excluded.kyc_status,
        police_verification_status = excluded.police_verification_status,
        preferred_notification_channels = excluded.preferred_notification_channels,
        updated_at = now();

  with owner_accounts as (
    select distinct on (owner_identity_key)
      owner_user_id,
      owner_identity_key,
      owner_name,
      owner_mobile
    from ajowa_unit_import
    where owner_login_email is null
    order by owner_identity_key, source_row
  )
  insert into users (
    id,
    society_id,
    auth_user_id,
    role,
    full_name,
    email,
    mobile_number,
    whatsapp_number,
    can_login,
    must_change_password,
    email_verified,
    is_active,
    kyc_status,
    police_verification_status,
    preferred_notification_channels
  )
  select
    oa.owner_user_id,
    v_society_id,
    null,
    'RESIDENT',
    oa.owner_name,
    null,
    oa.owner_mobile,
    oa.owner_mobile,
    false,
    false,
    false,
    true,
    'PENDING',
    'PENDING',
    'ALL_CHANNELS'
  from owner_accounts oa
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        mobile_number = excluded.mobile_number,
        whatsapp_number = excluded.whatsapp_number,
        can_login = excluded.can_login,
        must_change_password = excluded.must_change_password,
        email_verified = excluded.email_verified,
        is_active = excluded.is_active,
        kyc_status = excluded.kyc_status,
        police_verification_status = excluded.police_verification_status,
        preferred_notification_channels = excluded.preferred_notification_channels,
        updated_at = now();

  with tenant_accounts as (
    select distinct on (tenant_user_id)
      tenant_user_id,
      tenant_name,
      tenant_mobile
    from ajowa_tenant_import
    order by tenant_user_id, source_row
  )
  insert into users (
    id,
    society_id,
    auth_user_id,
    role,
    full_name,
    email,
    mobile_number,
    whatsapp_number,
    can_login,
    must_change_password,
    email_verified,
    is_active,
    kyc_status,
    police_verification_status,
    preferred_notification_channels
  )
  select
    ta.tenant_user_id,
    v_society_id,
    null,
    'RESIDENT',
    ta.tenant_name,
    null,
    ta.tenant_mobile,
    ta.tenant_mobile,
    false,
    false,
    false,
    true,
    'PENDING',
    'PENDING',
    'ALL_CHANNELS'
  from tenant_accounts ta
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        mobile_number = excluded.mobile_number,
        whatsapp_number = excluded.whatsapp_number,
        can_login = excluded.can_login,
        must_change_password = excluded.must_change_password,
        email_verified = excluded.email_verified,
        is_active = excluded.is_active,
        kyc_status = excluded.kyc_status,
        police_verification_status = excluded.police_verification_status,
        preferred_notification_channels = excluded.preferred_notification_channels,
        updated_at = now();

  insert into flat_residents (
    flat_id,
    user_id,
    relationship_type,
    is_primary_contact,
    is_billing_contact,
    can_login,
    is_active,
    ownership_start_date,
    occupancy_status,
    access_scope,
    relationship_note,
    import_metadata
  )
  select
    f.id,
    u.id,
    'OWNER',
    i.occupancy_status <> 'TENANTED',
    true,
    i.owner_can_login,
    true,
    '2026-06-01',
    i.occupancy_status,
    'OWNERSHIP',
    concat(
      'Imported from Workbook1.xlsx row ', i.source_row,
      '; S.No: ', i.serial_number,
      '; resident status: ', i.resident_status,
      '; email source: ', i.owner_email_source,
      '; flat: ', i.flat_number,
      '; area: ', i.area_sq_ft,
      '; rate: ', i.rate_per_sq_ft,
      '; source contact: ', coalesce(i.raw_contact, ''),
      '; source email: ', coalesce(i.raw_email, ''),
      '; occupancy: ', coalesce(i.occupancy_raw, '')
    ),
    jsonb_build_object(
      'sourceFile', 'Workbook1.xlsx',
      'sourceRow', i.source_row,
      'serialNumber', i.serial_number,
      'relationshipSource', 'OWNER',
      'sourceData', i.source_data,
      'normalized', jsonb_build_object(
        'ownerIdentityKey', i.owner_identity_key,
        'ownerName', i.owner_name,
        'ownerMobile', i.owner_mobile,
        'ownerLoginEmail', i.owner_login_email,
        'ownerCanLogin', i.owner_can_login,
        'ownerEmailSource', i.owner_email_source,
        'flatNumber', i.flat_number,
        'residentStatus', i.resident_status,
        'occupancyStatus', i.occupancy_status,
        'occupancyRaw', i.occupancy_raw,
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft
      )
    )
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = i.flat_number
  inner join users u on u.society_id = v_society_id
    and (
      (i.owner_login_email is not null and u.email = i.owner_login_email)
      or (i.owner_login_email is null and u.id = i.owner_user_id)
    )
  where not exists (
    select 1
    from flat_residents existing
    where existing.flat_id = f.id
      and existing.user_id = u.id
      and existing.relationship_type = 'OWNER'
  );

  update flat_residents fr
  set is_primary_contact = i.occupancy_status <> 'TENANTED',
      is_billing_contact = true,
      can_login = i.owner_can_login,
      is_active = true,
      ownership_start_date = coalesce(fr.ownership_start_date, '2026-06-01'),
      occupancy_status = i.occupancy_status,
      access_scope = 'OWNERSHIP',
      relationship_note = concat(
        'Imported from Workbook1.xlsx row ', i.source_row,
        '; S.No: ', i.serial_number,
        '; resident status: ', i.resident_status,
        '; email source: ', i.owner_email_source,
        '; flat: ', i.flat_number,
        '; area: ', i.area_sq_ft,
        '; rate: ', i.rate_per_sq_ft,
        '; source contact: ', coalesce(i.raw_contact, ''),
        '; source email: ', coalesce(i.raw_email, ''),
        '; occupancy: ', coalesce(i.occupancy_raw, '')
      ),
      import_metadata = jsonb_build_object(
        'sourceFile', 'Workbook1.xlsx',
        'sourceRow', i.source_row,
        'serialNumber', i.serial_number,
        'relationshipSource', 'OWNER',
        'sourceData', i.source_data,
        'normalized', jsonb_build_object(
          'ownerIdentityKey', i.owner_identity_key,
          'ownerName', i.owner_name,
          'ownerMobile', i.owner_mobile,
          'ownerLoginEmail', i.owner_login_email,
          'ownerCanLogin', i.owner_can_login,
          'ownerEmailSource', i.owner_email_source,
          'flatNumber', i.flat_number,
          'residentStatus', i.resident_status,
          'occupancyStatus', i.occupancy_status,
          'occupancyRaw', i.occupancy_raw,
          'areaSqFt', i.area_sq_ft,
          'ratePerSqFt', i.rate_per_sq_ft
        )
      ),
      updated_at = now()
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = i.flat_number
  inner join users u on u.society_id = v_society_id
    and (
      (i.owner_login_email is not null and u.email = i.owner_login_email)
      or (i.owner_login_email is null and u.id = i.owner_user_id)
    )
  where fr.flat_id = f.id
    and fr.user_id = u.id
    and fr.relationship_type = 'OWNER';

  insert into flat_residents (
    flat_id,
    user_id,
    relationship_type,
    is_primary_contact,
    is_billing_contact,
    can_login,
    is_active,
    lease_start_date,
    lease_end_date,
    occupancy_status,
    access_scope,
    relationship_note,
    import_metadata
  )
  select
    f.id,
    u.id,
    'TENANT',
    t.tenant_sequence = 1,
    false,
    false,
    true,
    '2026-06-01',
    '2027-05-31',
    'TENANTED',
    'TENANCY',
    concat(
      'Tenant imported from Workbook1.xlsx row ', t.source_row,
      '; S.No: ', i.serial_number,
      '; flat: ', i.flat_number,
      '; area: ', i.area_sq_ft,
      '; rate: ', i.rate_per_sq_ft,
      '; source occupancy: ', coalesce(t.source_occupancy, '')
    ),
    jsonb_build_object(
      'sourceFile', 'Workbook1.xlsx',
      'sourceRow', i.source_row,
      'serialNumber', i.serial_number,
      'relationshipSource', 'TENANT',
      'sourceData', i.source_data,
      'normalized', jsonb_build_object(
        'tenantName', t.tenant_name,
        'tenantMobile', t.tenant_mobile,
        'flatNumber', i.flat_number,
        'residentStatus', i.resident_status,
        'occupancyStatus', 'TENANTED',
        'occupancyRaw', i.occupancy_raw,
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft
      )
    )
  from ajowa_tenant_import t
  inner join ajowa_unit_import i on i.flat_number = t.flat_number
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = t.flat_number
  inner join users u on u.society_id = v_society_id and u.id = t.tenant_user_id
  where not exists (
    select 1
    from flat_residents existing
    where existing.flat_id = f.id
      and existing.user_id = u.id
      and existing.relationship_type = 'TENANT'
  );

  update flat_residents fr
  set is_primary_contact = t.tenant_sequence = 1,
      is_billing_contact = false,
      can_login = false,
      is_active = true,
      lease_start_date = coalesce(fr.lease_start_date, '2026-06-01'),
      lease_end_date = coalesce(fr.lease_end_date, '2027-05-31'),
      occupancy_status = 'TENANTED',
      access_scope = 'TENANCY',
      relationship_note = concat(
        'Tenant imported from Workbook1.xlsx row ', t.source_row,
        '; S.No: ', i.serial_number,
        '; flat: ', i.flat_number,
        '; area: ', i.area_sq_ft,
        '; rate: ', i.rate_per_sq_ft,
        '; source occupancy: ', coalesce(t.source_occupancy, '')
      ),
      import_metadata = jsonb_build_object(
        'sourceFile', 'Workbook1.xlsx',
        'sourceRow', i.source_row,
        'serialNumber', i.serial_number,
        'relationshipSource', 'TENANT',
        'sourceData', i.source_data,
        'normalized', jsonb_build_object(
          'tenantName', t.tenant_name,
          'tenantMobile', t.tenant_mobile,
          'flatNumber', i.flat_number,
          'residentStatus', i.resident_status,
          'occupancyStatus', 'TENANTED',
          'occupancyRaw', i.occupancy_raw,
          'areaSqFt', i.area_sq_ft,
          'ratePerSqFt', i.rate_per_sq_ft
        )
      ),
      updated_at = now()
  from ajowa_tenant_import t
  inner join ajowa_unit_import i on i.flat_number = t.flat_number
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = t.flat_number
  inner join users u on u.society_id = v_society_id and u.id = t.tenant_user_id
  where fr.flat_id = f.id
    and fr.user_id = u.id
    and fr.relationship_type = 'TENANT';

  delete from maintenance_charges
  where society_id = v_society_id
    and is_active = true;

  insert into maintenance_charges (
    society_id,
    scope,
    charge_name,
    amount,
    calculation_method,
    rate_per_sq_ft,
    charge_breakdown,
    is_active
  )
  values (
    v_society_id,
    'SOCIETY_DEFAULT',
    'CAM Charges',
    ${camRate.toFixed(2)},
    'AREA_RATE',
    ${camRate.toFixed(2)},
    jsonb_build_array(
      jsonb_build_object(
        'label', 'CAM Charges',
        'amount', ${camRate.toFixed(2)},
        'calculationMethod', 'AREA_RATE',
        'ratePerSqFt', ${camRate.toFixed(2)}
      )
    ),
    true
  );

  insert into billing_periods (
    society_id,
    label,
    frequency,
    start_date,
    end_date,
    due_date,
    is_locked
  )
  values (
    v_society_id,
    'June 2026',
    'MONTHLY',
    '2026-06-01',
    '2026-06-30',
    '2026-06-10',
    false
  )
  on conflict (society_id, start_date, end_date) do update
    set label = excluded.label,
        frequency = excluded.frequency,
        due_date = excluded.due_date,
        is_locked = excluded.is_locked,
        updated_at = now();

  delete from maintenance_dues
  where society_id = v_society_id
    and charge_breakdown @> '[{"sourceFile":"Workbook1.xlsx"}]'::jsonb;

  insert into document_sequences (document_type, sequence_year, last_value)
  values
    ('RECEIPT', 2026, 0),
    ('JOURNAL_VOUCHER', 2026, 0),
    ('SERVICE_REQUEST', 2026, 0)
  on conflict (document_type, sequence_year) do update
    set last_value = greatest(document_sequences.last_value, excluded.last_value),
        updated_at = now();
end;
$$;
`

fs.writeFileSync(outputPath, seedSql)

const areaCounts = importRows.reduce((acc, row) => {
  acc[row.areaSqFt] = (acc[row.areaSqFt] ?? 0) + 1
  return acc
}, {})
const realOwnerLoginEmails = importRows.filter((row) => row.ownerLoginEmail).length
const ownersWithoutLoginEmail = importRows.length - realOwnerLoginEmails
const monthlyCamTotal = importRows.reduce((sum, row) => sum + row.areaSqFt * row.ratePerSqFt, 0)

console.log(`Generated ${outputPath}`)
console.log(`Imported flats: ${importRows.length}`)
console.log(`Imported tenant households: ${tenantRows.length}`)
console.log(`Owner rows with real login email: ${realOwnerLoginEmails}`)
console.log(`Owner rows without login email: ${ownersWithoutLoginEmail}`)
console.log(`Area buckets: ${JSON.stringify(areaCounts)}`)
console.log(`Monthly CAM total: ${monthlyCamTotal.toFixed(2)}`)
