export type AppRole = 'ADMIN' | 'MANAGER' | 'SERVICE_STAFF' | 'RESIDENT' | 'GUARD'

export type RelationshipType = 'OWNER' | 'TENANT' | 'FAMILY_MEMBER'

export type AccessScope = 'OWNERSHIP' | 'TENANCY' | 'HOUSEHOLD'

export type InviteStatus = 'PENDING' | 'ACCEPTED' | 'EXPIRED' | 'REVOKED'

export type AuthFlatAccess = {
  id: string
  flatId: string
  blockName: string
  flatNumber: string
  relationshipType: RelationshipType
  accessScope: AccessScope | null
  isPrimaryContact: boolean
  isBillingContact: boolean
  leaseEndDate: string | null
  occupancyStatus: string | null
}

export type AuthDepartmentAssignment = {
  id: string
  departmentId: string
  departmentCode: string
  departmentName: string
  isPrimary: boolean
}

export type AuthSessionSummary = {
  id: string
  expiresAt: string
}

export type AuthIdentitySummary = {
  id: string
  email: string
  name: string
  image: string | null
  emailVerified: boolean
}

export type AppUserSummary = {
  id: string
  societyId: string
  role: AppRole
  fullName: string
  email: string
  mobileNumber: string
  whatsappNumber: string | null
  canLogin: boolean
  mustChangePassword: boolean
  emailVerified: boolean
  isActive: boolean
}

export type AuthAccessSummary = {
  requiresPasswordChange: boolean
  requiresEmailVerification: boolean
  hasResidentAccess: boolean
  hasDepartmentAccess: boolean
  hasAppAccess: boolean
}

export type AuthMe = {
  session: AuthSessionSummary
  authUser: AuthIdentitySummary
  user: AppUserSummary
  flatAccess: AuthFlatAccess[]
  departmentAssignments: AuthDepartmentAssignment[]
  landingRoute: string
  access: AuthAccessSummary
}

export type InvitePreview = {
  email: string
  role: AppRole
  fullName: string | null
  mobileNumber: string | null
  relationshipType: RelationshipType | null
  accessScope: AccessScope | null
  flatLabels: string[]
  departmentNames: string[]
  expiresAt: string
  status: InviteStatus
}
