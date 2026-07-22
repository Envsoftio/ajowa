import { z } from 'zod'
import { servicePriorities } from '~/shared/service-requests'

export const serviceLocationTypes = [
  'FLAT',
  'COMMON_AREA',
  'SOCIETY_ASSET',
] as const

export const serviceRequestSources = [
  'RESIDENT_REQUEST',
  'ADMIN_CREATED',
  'COMMON_AREA_REPORT',
  'STAFF_REPORTED',
] as const

export type ServiceRequestCreateSource = (typeof serviceRequestSources)[number]

export const serviceRequestFieldLimits = {
  category: 80,
  title: 160,
  description: 4000,
  locationDetail: 160,
  preferredVisitTime: 120,
} as const

export const serviceRequestCreateSchema = z
  .object({
    idempotencyKey: z.string().trim().min(8).max(160).nullable().optional(),
    requesterUserId: z.string().uuid().nullable().optional(),
    flatId: z.string().uuid('Choose a valid flat.').nullable().optional(),
    departmentId: z
      .string()
      .uuid('Choose a valid service department.')
      .nullable()
      .optional(),
    assigneeUserId: z
      .string()
      .uuid('Choose a valid assignee.')
      .nullable()
      .optional(),
    category: z
      .string({ required_error: 'Choose a category.' })
      .trim()
      .min(2, 'Choose a category.')
      .max(
        serviceRequestFieldLimits.category,
        `Category must be ${serviceRequestFieldLimits.category} characters or fewer.`,
      ),
    title: z
      .string({ required_error: 'Enter a title.' })
      .trim()
      .min(3, 'Enter a title with at least 3 characters.')
      .max(
        serviceRequestFieldLimits.title,
        `Title must be ${serviceRequestFieldLimits.title} characters or fewer.`,
      ),
    description: z
      .string({ required_error: 'Describe the problem.' })
      .trim()
      .min(10, 'Describe the problem using at least 10 characters.')
      .max(
        serviceRequestFieldLimits.description,
        `Description must be ${serviceRequestFieldLimits.description} characters or fewer.`,
      ),
    sourceType: z.enum(serviceRequestSources).default('RESIDENT_REQUEST'),
    locationType: z.enum(serviceLocationTypes, {
      required_error: 'Choose where the problem is located.',
      invalid_type_error: 'Choose where the problem is located.',
    }),
    areaName: z
      .string()
      .trim()
      .max(
        serviceRequestFieldLimits.locationDetail,
        `Common area must be ${serviceRequestFieldLimits.locationDetail} characters or fewer.`,
      )
      .nullable()
      .optional(),
    assetReference: z
      .string()
      .trim()
      .max(
        serviceRequestFieldLimits.locationDetail,
        `Asset reference must be ${serviceRequestFieldLimits.locationDetail} characters or fewer.`,
      )
      .nullable()
      .optional(),
    priority: z.enum(servicePriorities).default('MEDIUM'),
    preferredVisitTime: z
      .string()
      .trim()
      .max(
        serviceRequestFieldLimits.preferredVisitTime,
        `Preferred visit time must be ${serviceRequestFieldLimits.preferredVisitTime} characters or fewer.`,
      )
      .nullable()
      .optional(),
    emergencyConfirmed: z.boolean().default(false),
  })
  .superRefine((input, context) => {
    if (input.locationType === 'FLAT' && !input.flatId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['flatId'],
        message: 'Choose the flat where the problem is located.',
      })
    }

    if (input.locationType === 'COMMON_AREA' && !input.areaName) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['areaName'],
        message: 'Choose or enter the common area.',
      })
    }

    if (input.locationType === 'SOCIETY_ASSET' && !input.assetReference) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['assetReference'],
        message: 'Enter the asset name or reference.',
      })
    }

    if (input.priority === 'EMERGENCY' && !input.emergencyConfirmed) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['emergencyConfirmed'],
        message: 'Confirm that this request is an emergency.',
      })
    }

    if (input.assigneeUserId && !input.departmentId) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['departmentId'],
        message: 'Choose a service department before assigning staff.',
      })
    }
  })
