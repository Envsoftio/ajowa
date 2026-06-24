import { createApiSuccess } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const result = await queryRows<{
    id: string
    event_key: string
    channel: string
    version: number
    template_name: string
    subject_template: string | null
    body_template: string
    plain_text_template: string | null
    variables_schema: unknown
    is_active: boolean
    is_default: boolean
    status: string
    whatsapp_template_name: string | null
    sample_data: unknown
  }>(
    `
      select
        id,
        event_key,
        channel::text,
        version,
        template_name,
        subject_template,
        body_template,
        plain_text_template,
        variables_schema,
        is_active,
        is_default,
        status::text,
        whatsapp_template_name,
        sample_data
      from notification_templates
      where society_id = $1
      order by event_key, channel, version desc
    `,
    [authMe.user.societyId],
  )

  return createApiSuccess(event, {
    items: result.rows.map((row) => ({
      id: row.id,
      eventKey: row.event_key,
      channel: row.channel,
      version: row.version,
      templateName: row.template_name,
      subjectTemplate: row.subject_template,
      bodyTemplate: row.body_template,
      plainTextTemplate: row.plain_text_template,
      variablesSchema: row.variables_schema,
      isActive: row.is_active,
      isDefault: row.is_default,
      status: row.status,
      whatsappTemplateName: row.whatsapp_template_name,
      sampleData: row.sample_data,
    })),
    variables: [
      'title',
      'body',
      'flatLabel',
      'billingPeriodLabel',
      'dueDate',
      'balanceAmount',
      'amount',
      'receiptNumber',
      'requestNumber',
      'ticketNumber',
      'ticketTitle',
      'status',
      'noticeTitle',
      'deepLinkUrl',
    ],
  })
})
