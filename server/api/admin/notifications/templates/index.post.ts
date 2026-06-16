import Handlebars from 'handlebars'
import { z } from 'zod'
import { createApiSuccess, readJsonBody, validateInput } from '~/server/utils/api'
import { requireRole } from '~/server/utils/auth'
import { queryRows } from '~/server/utils/database'

const schema = z.object({
  eventKey: z.string().min(2).max(120),
  channel: z.enum(['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP']),
  templateName: z.string().min(2).max(120),
  subjectTemplate: z.string().max(240).nullable().optional(),
  bodyTemplate: z.string().min(1).max(5000),
  plainTextTemplate: z.string().max(5000).nullable().optional(),
  variablesSchema: z.array(z.string()).default([]),
  whatsappTemplateName: z.string().max(120).nullable().optional(),
  sampleData: z.record(z.unknown()).default({}),
  activate: z.boolean().default(true),
})

export default defineEventHandler(async (event) => {
  const authMe = await requireRole(event, ['ADMIN', 'MANAGER'])
  const body = validateInput(schema, await readJsonBody(event))
  const latest = await queryRows<{ version: number }>(
    `
      select coalesce(max(version), 0) + 1 as version
      from notification_templates
      where event_key = $1 and channel = $2
    `,
    [body.eventKey, body.channel],
  )
  const version = latest.rows[0]?.version ?? 1

  const result = await queryRows<{ id: string }>(
    `
      insert into notification_templates (
        society_id,
        event_key,
        channel,
        version,
        template_name,
        subject_template,
        body_template,
        plain_text_template,
        variables_schema,
        is_active,
        is_default,
        status,
        whatsapp_template_name,
        sample_data
      )
      values ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10, $10, $11, $12, $13::jsonb)
      returning id
    `,
    [
      authMe.user.societyId,
      body.eventKey,
      body.channel,
      version,
      body.templateName,
      body.subjectTemplate ?? null,
      body.bodyTemplate,
      body.plainTextTemplate ?? null,
      JSON.stringify(body.variablesSchema),
      body.activate,
      body.activate ? 'ACTIVE' : 'DRAFT',
      body.whatsappTemplateName ?? null,
      JSON.stringify(body.sampleData),
    ],
  )

  const subjectPreview = body.subjectTemplate
    ? Handlebars.compile(body.subjectTemplate)(body.sampleData)
    : null
  const bodyPreview = Handlebars.compile(body.bodyTemplate)(body.sampleData)

  return createApiSuccess(event, {
    id: result.rows[0]?.id,
    version,
    preview: {
      subject: subjectPreview,
      body: bodyPreview,
    },
  })
})
