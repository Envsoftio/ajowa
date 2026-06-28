import { randomBytes, createHash } from 'node:crypto'
import type { PoolClient } from 'pg'
import { betterAuth } from 'better-auth'
import { createEmailVerificationToken } from 'better-auth/api'
import { hashPassword } from 'better-auth/crypto'
import { fromNodeHeaders } from 'better-auth/node'
import type { H3Event } from 'h3'
import { AppError } from './errors'
import { getDatabasePool, queryRows } from './database'
import { sendTemplatedEmail, buildAppUrl, normalizeAppActionUrl } from './email'
import { getValidatedRuntimeConfig, type ValidatedRuntimeConfig } from './env'
import {
  getRoleLandingRoute,
  PASSWORD_POLICY,
  requiresTemporaryPasswordChangeForRole,
} from '~/shared/auth'
import {
  normalizeRolePermissions,
  type StaffPermission,
} from '~/shared/permissions'
import type {
  AccessScope,
  AppRole,
  AuthDepartmentAssignment,
  AuthFlatAccess,
  AuthMe,
  InvitePreview,
  InviteStatus,
  RelationshipType,
} from '~/types/auth'

type AuthSessionResult = Awaited<
  ReturnType<ReturnType<typeof betterAuth>['api']['getSession']>
>

const AUTH_CONTEXT_KEY = 'ajowa:auth-me'

type AppUserRow = {
  id: string
  society_id: string
  auth_user_id: string
  role: AppRole
  full_name: string
  email: string
  mobile_number: string
  whatsapp_number: string | null
  can_login: boolean
  must_change_password: boolean
  email_verified: boolean
  is_active: boolean
  staff_permissions: string[]
}

type FlatAccessRow = {
  id: string
  flat_id: string
  block_name: string
  flat_number: string
  relationship_type: RelationshipType
  access_scope: AccessScope | null
  is_primary_contact: boolean
  is_billing_contact: boolean
  lease_end_date: string | null
  occupancy_status: string | null
}

type DepartmentAssignmentRow = {
  id: string
  department_id: string
  department_code: string
  department_name: string
  is_primary: boolean
}

type InviteRecordRow = {
  id: string
  email: string
  role: AppRole
  full_name: string | null
  mobile_number: string | null
  relationship_type: RelationshipType | null
  access_scope: AccessScope | null
  flat_labels: string[] | null
  department_names: string[] | null
  expires_at: string
  accepted_at: string | null
  revoked_at: string | null
}

const RESIDENT_RELATIONSHIP_PRIORITY: RelationshipType[] = [
  'OWNER',
  'TENANT',
  'FAMILY_MEMBER',
]
const STAFF_EMAIL_VERIFICATION_EXEMPT_ROLES: AppRole[] = [
  'MANAGER',
  'SERVICE_STAFF',
  'GUARD',
]
const INVITE_EXPIRY_MS_PER_DAY = 24 * 60 * 60 * 1000

export const DEFAULT_INVITE_EXPIRY_DAYS = 14
export const MAX_INVITE_EXPIRY_DAYS = 30

const nowDate = () => new Date().toISOString().slice(0, 10)

export const isEmailVerificationRequiredForRole = (role: AppRole) =>
  !STAFF_EMAIL_VERIFICATION_EXEMPT_ROLES.includes(role)

const normalizeOrigin = (value: string | null | undefined) => {
  if (!value) {
    return null
  }

  try {
    return new URL(value).origin
  } catch {
    return null
  }
}

const firstHeaderValue = (value: string | null | undefined) =>
  value?.split(',')[0]?.trim() || null

const buildOriginFromHost = (protocol: string | null, host: string | null) => {
  if (!host) {
    return null
  }

  return normalizeOrigin(`${protocol || 'https'}://${host}`)
}

const getSameHostRequestOrigin = (request?: Request) => {
  if (!request) {
    return null
  }

  const requestOrigin = normalizeOrigin(request.headers.get('origin'))
  const requestUrl = new URL(request.url)
  const expectedOrigin = buildOriginFromHost(
    firstHeaderValue(request.headers.get('x-forwarded-proto')) ??
      requestUrl.protocol.replace(':', ''),
    firstHeaderValue(request.headers.get('x-forwarded-host')) ??
      firstHeaderValue(request.headers.get('host')) ??
      requestUrl.host,
  )

  if (!requestOrigin || !expectedOrigin) {
    return expectedOrigin
  }

  return requestOrigin === expectedOrigin ? requestOrigin : null
}

const uniqueOrigins = (origins: Array<string | null | undefined>) =>
  Array.from(
    new Set(origins.filter((origin): origin is string => Boolean(origin))),
  )

const buildTrustedOrigins = (runtimeConfig: ValidatedRuntimeConfig) => {
  const configuredOrigins = uniqueOrigins([
    normalizeOrigin(runtimeConfig.appUrl),
    normalizeOrigin(runtimeConfig.public.appUrl),
    normalizeOrigin(runtimeConfig.betterAuthUrl),
    normalizeOrigin(process.env.URL),
    normalizeOrigin(process.env.DEPLOY_URL),
    normalizeOrigin(process.env.DEPLOY_PRIME_URL),
    'https://ajowa.netlify.app',
    'https://ajowa.in',
  ])

  return (request?: Request) =>
    uniqueOrigins([...configuredOrigins, getSameHostRequestOrigin(request)])
}

const getDefaultSocietyId = async () => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const result = await queryRows<{ id: string }>(
    `
      select id
      from society_profile
      where code = $1
      limit 1
    `,
    [runtimeConfig.societyCode],
  )

  const societyId = result.rows[0]?.id

  if (!societyId) {
    throw new AppError({
      code: 'INTERNAL_ERROR',
      statusCode: 500,
      message: 'The society profile is not configured.',
    })
  }

  return societyId
}

const getInviteStatus = (invite: InviteRecordRow): InviteStatus => {
  if (invite.revoked_at) {
    return 'REVOKED'
  }

  if (invite.accepted_at) {
    return 'ACCEPTED'
  }

  if (new Date(invite.expires_at).getTime() <= Date.now()) {
    return 'EXPIRED'
  }

  return 'PENDING'
}

const toAuthFlatAccess = (row: FlatAccessRow): AuthFlatAccess => ({
  id: row.id,
  flatId: row.flat_id,
  blockName: row.block_name,
  flatNumber: row.flat_number,
  relationshipType: row.relationship_type,
  accessScope: row.access_scope,
  isPrimaryContact: row.is_primary_contact,
  isBillingContact: row.is_billing_contact,
  leaseEndDate: row.lease_end_date,
  occupancyStatus: row.occupancy_status,
})

const toDepartmentAssignment = (
  row: DepartmentAssignmentRow,
): AuthDepartmentAssignment => ({
  id: row.id,
  departmentId: row.department_id,
  departmentCode: row.department_code,
  departmentName: row.department_name,
  isPrimary: row.is_primary,
})

const hasCurrentLease = (flatAccess: AuthFlatAccess) =>
  flatAccess.relationshipType !== 'TENANT' ||
  flatAccess.leaseEndDate == null ||
  flatAccess.leaseEndDate >= nowDate()

const canResidentUseApp = (flatAccess: AuthFlatAccess[]) =>
  flatAccess.some(
    (item) =>
      RESIDENT_RELATIONSHIP_PRIORITY.includes(item.relationshipType) &&
      hasCurrentLease(item),
  )

const loadAppUserByAuthUserId = async (authUserId: string) => {
  const [userResult, flatAccessResult, departmentResult] = await Promise.all([
    queryRows<AppUserRow>(
      `
        select
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
          staff_permissions
        from users
        where auth_user_id = $1
          and deleted_at is null
        limit 1
      `,
      [authUserId],
    ),
    queryRows<FlatAccessRow>(
      `
        select
          fr.id,
          fr.flat_id,
          b.name as block_name,
          f.flat_number,
          fr.relationship_type,
          fr.access_scope,
          fr.is_primary_contact,
          fr.is_billing_contact,
          fr.lease_end_date::text,
          fr.occupancy_status::text
        from flat_residents fr
        inner join flats f on f.id = fr.flat_id
        inner join blocks b on b.id = f.block_id
        inner join users u on u.id = fr.user_id
        where u.auth_user_id = $1
          and fr.is_active = true
        order by b.name asc, f.flat_number asc
      `,
      [authUserId],
    ),
    queryRows<DepartmentAssignmentRow>(
      `
        select
          ssa.id,
          ssa.department_id,
          sd.code as department_code,
          sd.name as department_name,
          ssa.is_primary
        from service_staff_assignments ssa
        inner join service_departments sd on sd.id = ssa.department_id
        inner join users u on u.id = ssa.user_id
        where u.auth_user_id = $1
          and ssa.is_active = true
        order by sd.name asc
      `,
      [authUserId],
    ),
  ])

  const user = userResult.rows[0]

  if (!user) {
    return null
  }

  return {
    user,
    flatAccess: flatAccessResult.rows.map(toAuthFlatAccess),
    departmentAssignments: departmentResult.rows.map(toDepartmentAssignment),
  }
}

const buildAuthMe = (
  session: NonNullable<AuthSessionResult>,
  appState: NonNullable<Awaited<ReturnType<typeof loadAppUserByAuthUserId>>>,
): AuthMe => {
  const landingRoute = getRoleLandingRoute(appState.user.role)
  const hasResidentAccess = canResidentUseApp(appState.flatAccess)
  const hasDepartmentAccess = appState.departmentAssignments.length > 0
  const requiresPasswordChange =
    appState.user.must_change_password &&
    requiresTemporaryPasswordChangeForRole(appState.user.role)
  const requiresEmailVerification =
    isEmailVerificationRequiredForRole(appState.user.role) &&
    !appState.user.email_verified
  const hasRoleAccess =
    appState.user.role === 'RESIDENT'
      ? hasResidentAccess
      : appState.user.role === 'SERVICE_STAFF'
        ? hasDepartmentAccess
        : true
  const permissions = normalizeStaffPermissions(
    appState.user.role,
    appState.user.staff_permissions,
  )

  return {
    session: {
      id: session.session.id,
      expiresAt: session.session.expiresAt.toISOString(),
    },
    authUser: {
      id: session.user.id,
      email: session.user.email,
      name: session.user.name,
      image: session.user.image ?? null,
      emailVerified: session.user.emailVerified,
    },
    user: {
      id: appState.user.id,
      societyId: appState.user.society_id,
      role: appState.user.role,
      fullName: appState.user.full_name,
      email: appState.user.email,
      mobileNumber: appState.user.mobile_number,
      whatsappNumber: appState.user.whatsapp_number,
      canLogin: appState.user.can_login,
      mustChangePassword: requiresPasswordChange,
      emailVerified: appState.user.email_verified,
      isActive: appState.user.is_active,
      permissions,
    },
    flatAccess: appState.flatAccess,
    departmentAssignments: appState.departmentAssignments,
    landingRoute,
    access: {
      requiresPasswordChange,
      requiresEmailVerification,
      hasResidentAccess,
      hasDepartmentAccess,
      hasAppAccess:
        appState.user.can_login &&
        appState.user.is_active &&
        hasRoleAccess &&
        !requiresPasswordChange &&
        !requiresEmailVerification,
    },
  }
}

const normalizeStaffPermissions = (
  role: AppRole,
  permissions: string[] | null | undefined,
): StaffPermission[] => {
  return normalizeRolePermissions(role, permissions)
}

const upsertAppUser = async ({
  authUserId,
  email,
  fullName,
  mobileNumber,
  whatsappNumber,
  role = 'RESIDENT',
  canLogin = true,
  mustChangePassword = false,
  emailVerified = false,
  isActive = true,
  permissions,
}: {
  authUserId: string
  email: string
  fullName: string
  mobileNumber: string
  whatsappNumber?: string | null
  role?: AppRole
  canLogin?: boolean
  mustChangePassword?: boolean
  emailVerified?: boolean
  isActive?: boolean
  permissions?: StaffPermission[]
}) => {
  const societyId = await getDefaultSocietyId()
  const effectiveMustChangePassword =
    mustChangePassword && requiresTemporaryPasswordChangeForRole(role)
  const effectiveEmailVerified =
    emailVerified || !isEmailVerificationRequiredForRole(role)

  await queryRows(
    `
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
        staff_permissions
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
      on conflict (auth_user_id) do update
        set role = excluded.role,
            full_name = excluded.full_name,
            email = excluded.email,
            mobile_number = excluded.mobile_number,
            whatsapp_number = excluded.whatsapp_number,
            can_login = excluded.can_login,
            must_change_password = excluded.must_change_password,
            email_verified = excluded.email_verified,
            is_active = excluded.is_active,
            staff_permissions = excluded.staff_permissions,
            updated_at = now()
    `,
    [
      societyId,
      authUserId,
      role,
      fullName,
      email,
      mobileNumber,
      whatsappNumber ?? null,
      canLogin,
      effectiveMustChangePassword,
      effectiveEmailVerified,
      isActive,
      normalizeStaffPermissions(role, permissions),
    ],
  )
}

const syncAuthIdentityToAppUser = async (authUser: {
  id: string
  email: string
  name: string
  emailVerified: boolean
}) => {
  const existing = await loadAppUserByAuthUserId(authUser.id)

  await upsertAppUser({
    authUserId: authUser.id,
    email: authUser.email,
    fullName: authUser.name,
    mobileNumber: existing?.user.mobile_number ?? 'PENDING',
    whatsappNumber: existing?.user.whatsapp_number ?? null,
    role: existing?.user.role ?? 'RESIDENT',
    canLogin: existing?.user.can_login ?? true,
    mustChangePassword: existing?.user.must_change_password ?? false,
    emailVerified: authUser.emailVerified,
    isActive: existing?.user.is_active ?? true,
    permissions: normalizeStaffPermissions(
      existing?.user.role ?? 'RESIDENT',
      existing?.user.staff_permissions,
    ),
  })
}

const createAuth = () => {
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())

  return betterAuth({
    appName: 'AJOWA',
    baseURL: runtimeConfig.betterAuthUrl,
    basePath: '/api/auth',
    secret: runtimeConfig.betterAuthSecret,
    trustedOrigins: buildTrustedOrigins(runtimeConfig),
    database: getDatabasePool(),
    user: {
      modelName: 'auth_users',
      fields: {
        emailVerified: 'email_verified',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    session: {
      expiresIn: 60 * 60 * 24 * 30, // 30 days
      updateAge: 60 * 60 * 24, // 1 day
      modelName: 'auth_sessions',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
        ipAddress: 'ip_address',
        userAgent: 'user_agent',
        userId: 'user_id',
      },
    },
    account: {
      modelName: 'auth_accounts',
      fields: {
        accountId: 'account_id',
        providerId: 'provider_id',
        userId: 'user_id',
        accessToken: 'access_token',
        refreshToken: 'refresh_token',
        idToken: 'id_token',
        accessTokenExpiresAt: 'access_token_expires_at',
        refreshTokenExpiresAt: 'refresh_token_expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    verification: {
      modelName: 'auth_verifications',
      fields: {
        expiresAt: 'expires_at',
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    },
    emailAndPassword: {
      enabled: true,
      minPasswordLength: PASSWORD_POLICY.minLength,
      maxPasswordLength: 128,
      sendResetPassword: async ({ user, url }) => {
        const appState = await loadAppUserByAuthUserId(user.id)
        const actionUrl = normalizeAppActionUrl(url)
        await sendTemplatedEmail({
          to: user.email,
          subject: 'Reset your AJOWA password',
          template: 'reset-password',
          context: {
            title: 'Reset your password',
            name: user.name,
            actionUrl,
            expiresLabel: 'in 1 hour',
          },
          ...(appState ? { societyId: appState.user.society_id } : {}),
        })
      },
      onPasswordReset: async ({ user }) => {
        const appState = await loadAppUserByAuthUserId(user.id)

        if (!appState) {
          return
        }

        await upsertAppUser({
          authUserId: user.id,
          email: appState.user.email,
          fullName: appState.user.full_name,
          mobileNumber: appState.user.mobile_number,
          whatsappNumber: appState.user.whatsapp_number,
          role: appState.user.role,
          canLogin: appState.user.can_login,
          mustChangePassword: false,
          emailVerified: appState.user.email_verified,
          isActive: appState.user.is_active,
          permissions: normalizeStaffPermissions(
            appState.user.role,
            appState.user.staff_permissions,
          ),
        })
      },
    },
    emailVerification: {
      sendOnSignUp: true,
      sendOnSignIn: true,
      autoSignInAfterVerification: false,
      sendVerificationEmail: async ({ user, url }) => {
        const appState = await loadAppUserByAuthUserId(user.id)
        const actionUrl = normalizeAppActionUrl(url)
        await sendTemplatedEmail({
          to: user.email,
          subject: 'Verify your AJOWA email',
          template: 'verify-email',
          context: {
            title: 'Verify your email',
            name: user.name,
            actionUrl,
            expiresLabel: 'in 1 hour',
          },
          ...(appState ? { societyId: appState.user.society_id } : {}),
        })
      },
      afterEmailVerification: async (user) => {
        await syncAuthIdentityToAppUser({
          id: user.id,
          email: user.email,
          name: user.name,
          emailVerified: true,
        })
      },
    },
    advanced: {
      database: {
        generateId: 'uuid',
      },
      useSecureCookies: process.env.NODE_ENV === 'production',
      defaultCookieAttributes: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
      },
    },
    databaseHooks: {
      user: {
        create: {
          after: async (user) => {
            await syncAuthIdentityToAppUser({
              id: user.id,
              email: user.email,
              name: user.name,
              emailVerified: user.emailVerified,
            })
          },
        },
        update: {
          after: async (user) => {
            await syncAuthIdentityToAppUser({
              id: user.id,
              email: user.email,
              name: user.name,
              emailVerified: user.emailVerified,
            })
          },
        },
      },
    },
  })
}

let authInstance: ReturnType<typeof createAuth> | null = null

export const getAuth = () => {
  if (authInstance) {
    return authInstance
  }

  const nextAuth = createAuth()
  authInstance = nextAuth
  return nextAuth
}

export const getAuthSession = async (event: H3Event) => {
  return getAuth().api.getSession({
    headers: fromNodeHeaders(event.node?.req.headers ?? {}),
  })
}

export const getOptionalAuth = async (
  event: H3Event,
): Promise<AuthMe | null> => {
  const context = event.context as Record<string, unknown>
  if (AUTH_CONTEXT_KEY in context) {
    return (context[AUTH_CONTEXT_KEY] as AuthMe | null) ?? null
  }

  const session = await getAuthSession(event)

  if (!session) {
    context[AUTH_CONTEXT_KEY] = null
    return null
  }

  const appState = await loadAppUserByAuthUserId(session.user.id)

  if (!appState) {
    context[AUTH_CONTEXT_KEY] = null
    return null
  }

  const authMe = buildAuthMe(session, appState)
  context[AUTH_CONTEXT_KEY] = authMe
  return authMe
}

export const requireAuth = async (event: H3Event) => {
  const authMe = await getOptionalAuth(event)

  if (!authMe) {
    throw new AppError({
      code: 'AUTH_REQUIRED',
      statusCode: 401,
      message: 'You need to sign in to continue.',
    })
  }

  return authMe
}

export const requireRole = async (event: H3Event, roles: AppRole[]) => {
  const authMe = await requireAuth(event)

  if (!roles.includes(authMe.user.role)) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You do not have permission to access this resource.',
    })
  }

  return authMe
}

export const requirePermission = async (
  event: H3Event,
  permission: StaffPermission,
) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])

  if (!authMe.user.permissions.includes(permission)) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You do not have permission to access this resource.',
    })
  }

  return authMe
}

export const requireActiveUser = async (event: H3Event) => {
  const authMe = await requireAuth(event)

  if (!authMe.user.isActive || !authMe.user.canLogin) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Your account is currently inactive.',
    })
  }

  if (authMe.access.requiresPasswordChange) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'You must change your password before continuing.',
    })
  }

  if (authMe.access.requiresEmailVerification) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Verify your email address before continuing.',
    })
  }

  if (!authMe.access.hasAppAccess) {
    throw new AppError({
      code: 'FORBIDDEN',
      statusCode: 403,
      message: 'Your role does not currently have active AJOWA access.',
    })
  }

  return authMe
}

export const getOwnedFlatIds = (authMe: AuthMe) =>
  authMe.flatAccess
    .filter((item) => item.relationshipType === 'OWNER')
    .map((item) => item.flatId)

export const getActiveLeasedFlatIds = (authMe: AuthMe) =>
  authMe.flatAccess
    .filter(
      (item) => item.relationshipType === 'TENANT' && hasCurrentLease(item),
    )
    .map((item) => item.flatId)

export const getHouseholdFlatIds = (authMe: AuthMe) =>
  authMe.flatAccess
    .filter(
      (item) =>
        item.relationshipType === 'FAMILY_MEMBER' && hasCurrentLease(item),
    )
    .map((item) => item.flatId)

export const getAssignedDepartmentIds = (authMe: AuthMe) =>
  authMe.departmentAssignments.map((item) => item.departmentId)

export const canAccessTicketAssignment = (
  authMe: AuthMe,
  assigneeUserId?: string | null,
) =>
  authMe.user.role === 'ADMIN' ||
  authMe.user.role === 'MANAGER' ||
  (authMe.user.role === 'SERVICE_STAFF' && assigneeUserId === authMe.user.id)

export const canAccessDepartmentTicket = (
  authMe: AuthMe,
  departmentId?: string | null,
) =>
  authMe.user.role === 'ADMIN' ||
  authMe.user.role === 'MANAGER' ||
  (departmentId != null &&
    getAssignedDepartmentIds(authMe).includes(departmentId))

export const sendVerificationEmailToUser = async (user: {
  id: string
  email: string
  name: string
  societyId?: string | null
  client?: PoolClient | null
}) => {
  const appState = user.societyId
    ? null
    : await loadAppUserByAuthUserId(user.id)
  const societyId = user.societyId ?? appState?.user.society_id
  const runtimeConfig = getValidatedRuntimeConfig(useRuntimeConfig())
  const token = await createEmailVerificationToken(
    runtimeConfig.betterAuthSecret,
    user.email,
    undefined,
    3600,
  )
  const actionUrl = buildAppUrl('/verify-email', { token })

  return sendTemplatedEmail({
    to: user.email,
    subject: 'Verify your AJOWA email',
    template: 'verify-email',
    context: {
      title: 'Verify your email',
      name: user.name,
      actionUrl,
      expiresLabel: 'in 1 hour',
    },
    ...(societyId ? { societyId } : {}),
    ...(user.client ? { client: user.client } : {}),
  })
}

export const createCredentialUser = async ({
  client,
  email,
  fullName,
  password,
  mobileNumber,
  whatsappNumber,
  role = 'RESIDENT',
  canLogin = true,
  mustChangePassword = false,
  emailVerified = false,
}: {
  client?: PoolClient
  email: string
  fullName: string
  password: string
  mobileNumber: string
  whatsappNumber?: string | null
  role?: AppRole
  canLogin?: boolean
  mustChangePassword?: boolean
  emailVerified?: boolean
}) => {
  const pool = getDatabasePool()
  const transactionClient = client ?? (await pool.connect())
  const ownsTransaction = !client
  const effectiveMustChangePassword =
    mustChangePassword && requiresTemporaryPasswordChangeForRole(role)
  const effectiveEmailVerified =
    emailVerified || !isEmailVerificationRequiredForRole(role)

  try {
    if (ownsTransaction) {
      await transactionClient.query('begin')
    }

    const existing = await transactionClient.query<{ id: string }>(
      `
        select id
        from auth_users
        where email = $1
        limit 1
      `,
      [email],
    )

    if (existing.rows[0]) {
      throw new AppError({
        code: 'CONFLICT',
        statusCode: 409,
        message: 'An account already exists for this email.',
      })
    }

    const authUser = await transactionClient.query<{
      id: string
      email: string
      name: string
    }>(
      `
        insert into auth_users (name, email, email_verified)
        values ($1, $2, $3)
        returning id, email, name
      `,
      [fullName, email, effectiveEmailVerified],
    )

    const authUserId = authUser.rows[0]?.id

    if (!authUserId) {
      throw new Error('Failed to create auth user')
    }

    const hashedPassword = await hashPassword(password)

    await transactionClient.query(
      `
        insert into auth_accounts (account_id, provider_id, user_id, password)
        values ($1::text, 'credential', $1::uuid, $2)
      `,
      [authUserId, hashedPassword],
    )

    const societyId = await getDefaultSocietyId()

    await transactionClient.query(
      `
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
          is_active
        )
        values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, true)
      `,
      [
        societyId,
        authUserId,
        role,
        fullName,
        email,
        mobileNumber,
        whatsappNumber ?? null,
        canLogin,
        effectiveMustChangePassword,
        effectiveEmailVerified,
      ],
    )

    if (ownsTransaction) {
      await transactionClient.query('commit')
    }

    return {
      authUserId,
      email,
      fullName,
    }
  } catch (error) {
    if (ownsTransaction) {
      await transactionClient.query('rollback')
    }
    throw error
  } finally {
    if (ownsTransaction) {
      transactionClient.release()
    }
  }
}

export const createInviteToken = () => {
  const token = randomBytes(32).toString('hex')
  return {
    token,
    tokenHash: createHash('sha256').update(token).digest('hex'),
  }
}

export const createInviteExpiresAt = (
  expiresInDays = DEFAULT_INVITE_EXPIRY_DAYS,
) => new Date(Date.now() + expiresInDays * INVITE_EXPIRY_MS_PER_DAY)

export const hashInviteToken = (token: string) =>
  createHash('sha256').update(token).digest('hex')

export const assignInviteRelationships = async ({
  client,
  authUserId,
  role,
  flatIds,
  relationshipType,
  accessScope,
  departmentIds,
}: {
  client: PoolClient
  authUserId: string
  role: AppRole
  flatIds: string[]
  relationshipType: RelationshipType | null
  accessScope: AccessScope | null
  departmentIds: string[]
}) => {
  const userResult = await client.query<{ id: string }>(
    `
      select id
      from users
      where auth_user_id = $1
      limit 1
    `,
    [authUserId],
  )

  const userId = userResult.rows[0]?.id

  if (!userId) {
    throw new Error('Unable to resolve app user for invite assignment.')
  }

  if (role === 'RESIDENT' && relationshipType) {
    for (const flatId of flatIds) {
      const existingRelationship = await client.query<{
        id: string
        relationship_type: RelationshipType
        lease_start_date: string | null
        lease_end_date: string | null
      }>(
        `
          select id,
                 relationship_type,
                 lease_start_date::text,
                 lease_end_date::text
          from flat_residents
          where flat_id = $1
            and user_id = $2
          limit 1
        `,
        [flatId, userId],
      )

      const relationship = existingRelationship.rows[0]

      if (relationship?.id) {
        if (
          relationship.relationship_type === 'TENANT' &&
          (!relationship.lease_start_date || !relationship.lease_end_date)
        ) {
          throw new AppError({
            code: 'VALIDATION_ERROR',
            statusCode: 400,
            message:
              'Tenant invites need lease start and end dates. Ask an admin to add the lease details on the resident profile, then resend the invite.',
          })
        }

        await client.query(
          `
            update flat_residents
            set can_login = true,
                is_active = true,
                access_scope = coalesce(access_scope, $2::access_scope),
                updated_at = now()
            where id = $1
          `,
          [relationship.id, accessScope],
        )
        continue
      }

      if (relationshipType === 'TENANT') {
        throw new AppError({
          code: 'VALIDATION_ERROR',
          statusCode: 400,
          message:
            'Tenant invites need lease start and end dates. Ask an admin to add the lease details on the resident profile, then resend the invite.',
        })
      }

      await client.query(
        `
          insert into flat_residents (
            flat_id,
            user_id,
            relationship_type,
            can_login,
            is_active,
            access_scope
          )
          values ($1, $2, $3, true, true, $4)
        `,
        [flatId, userId, relationshipType, accessScope],
      )
    }
  }

  if (role === 'SERVICE_STAFF') {
    for (const departmentId of departmentIds) {
      await client.query(
        `
          insert into service_staff_assignments (department_id, user_id, is_active, is_primary)
          values ($1, $2, true, false)
          on conflict (department_id, user_id) do update
            set is_active = true,
                ended_at = null,
                updated_at = now()
        `,
        [departmentId, userId],
      )
    }
  }
}

export const getInvitePreview = async (
  token: string,
): Promise<InvitePreview | null> => {
  const tokenHash = hashInviteToken(token)
  const result = await queryRows<InviteRecordRow>(
    `
      select
        ai.id,
        ai.email,
        ai.role,
        ai.full_name,
        ai.mobile_number,
        ai.relationship_type,
        ai.access_scope,
        ai.flat_labels,
        ai.department_names,
        ai.expires_at::text,
        ai.accepted_at::text,
        ai.revoked_at::text
      from auth_invites ai
      where ai.token_hash = $1
      limit 1
    `,
    [tokenHash],
  )

  const invite = result.rows[0]

  if (!invite) {
    return null
  }

  return {
    email: invite.email,
    role: invite.role,
    fullName: invite.full_name,
    mobileNumber: invite.mobile_number,
    relationshipType: invite.relationship_type,
    accessScope: invite.access_scope,
    flatLabels: invite.flat_labels ?? [],
    departmentNames: invite.department_names ?? [],
    expiresAt: invite.expires_at,
    status: getInviteStatus(invite),
  }
}
