import type {
  ServiceRequestAttachment,
  ServiceCommentVisibility,
  ServiceLocationType,
  ServicePriority,
  ServiceRequestSource,
  ServiceRequestStatus,
} from '~/types/domain'

export type ServiceRequestCreatePayload = {
  requesterUserId?: string | null
  flatId?: string | null
  departmentId?: string | null
  assigneeUserId?: string | null
  category: string
  title: string
  description: string
  sourceType?: ServiceRequestSource
  locationType: ServiceLocationType
  areaName?: string | null
  assetReference?: string | null
  priority: ServicePriority
  preferredVisitTime?: string | null
  emergencyConfirmed?: boolean
}

const basePathForScope = (scope: 'admin' | 'resident' | 'service') => {
  if (scope === 'admin') {
    return '/api/admin/service-requests'
  }
  if (scope === 'service') {
    return '/api/service/tickets'
  }
  return '/api/my/service-requests'
}

export const useServiceRequests = (scope: 'admin' | 'resident' | 'service') => {
  const api = useApi()
  const basePath = basePathForScope(scope)

  const createTicket = (payload: ServiceRequestCreatePayload) =>
    api<{ ok: true; data: { id: string; requestNumber: string } }>(basePath, {
      method: 'POST',
      body: payload,
    })

  const assignTicket = (id: string, payload: { departmentId: string; assigneeUserId?: string | null; reason?: string }) =>
    api(`${basePath}/${id}/assign`, {
      method: 'POST',
      body: payload,
    })

  const addComment = (id: string, payload: { visibility: ServiceCommentVisibility; commentBody: string }) =>
    api(`${basePath}/${id}/comments`, {
      method: 'POST',
      body: payload,
    })

  const updateStatus = (id: string, payload: { status: ServiceRequestStatus; comment?: string | null; reason?: string | null }) =>
    api(`${basePath}/${id}/status`, {
      method: 'POST',
      body: payload,
    })

  const uploadAttachment = (id: string, file: File) => {
    const formData = new FormData()
    formData.append('file', file)

    return api<{ ok: true; data: ServiceRequestAttachment }>(`${basePath}/${id}/attachments`, {
      method: 'POST',
      body: formData,
    })
  }

  return {
    basePath,
    createTicket,
    assignTicket,
    addComment,
    updateStatus,
    uploadAttachment,
  }
}
