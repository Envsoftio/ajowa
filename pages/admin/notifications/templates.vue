<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Notification Templates',
})

type TemplateRow = {
  id: string
  eventKey: string
  channel: string
  version: number
  templateName: string
  subjectTemplate: string | null
  bodyTemplate: string
  status: string
  whatsappTemplateName: string | null
}

const api = useApi()
const toast = useToast()
const form = reactive({
  eventKey: 'notice.published',
  channel: 'EMAIL',
  templateName: 'Notice email',
  subjectTemplate: '{{title}}',
  bodyTemplate: '{{body}}',
  plainTextTemplate: '{{title}}\\n\\n{{body}}',
  variablesSchema: ['title', 'body', 'deepLinkUrl'],
  whatsappTemplateName: '',
  sampleData: '{ "title": "Water supply notice", "body": "Water will be unavailable from 10 AM." }',
})

const { data, refresh } = await useAsyncData('admin-notification-templates', () =>
  api<{ ok: true; data: { items: TemplateRow[]; variables: string[] } }>('/api/admin/notifications/templates'),
)
const rows = computed(() => data.value?.data.items ?? [])
const variables = computed(() => data.value?.data.variables ?? [])

const save = async () => {
  const sampleData = JSON.parse(form.sampleData || '{}')
  const response = await api<{ ok: true; data: { version: number } }>('/api/admin/notifications/templates', {
    method: 'POST',
    body: { ...form, whatsappTemplateName: form.whatsappTemplateName || null, sampleData },
  })
  toast.add({ severity: 'success', summary: `Template v${response.data.version} saved`, life: 3000 })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Notification templates</h1>
          <p>Versioned channel templates with sample-data preview.</p>
        </div>
      </header>

      <Message severity="info">Variables: {{ variables.join(', ') }}</Message>

      <form class="admin-form-layout" @submit.prevent="save">
        <div class="surface-grid">
          <InputText v-model="form.eventKey" />
          <Select v-model="form.channel" :options="['PUSH', 'EMAIL', 'WHATSAPP', 'IN_APP']" />
          <InputText v-model="form.templateName" />
        </div>
        <InputText v-model="form.subjectTemplate" placeholder="Subject template" />
        <Textarea v-model="form.bodyTemplate" rows="5" />
        <Textarea v-model="form.sampleData" rows="4" />
        <Button label="Save template" icon="pi pi-save" type="submit" />
      </form>

      <DataTable :value="rows" responsive-layout="scroll" class="list-page__table">
        <Column field="eventKey" header="Event" />
        <Column field="channel" header="Channel" />
        <Column field="version" header="Version" />
        <Column field="templateName" header="Template" />
        <Column field="status" header="Status"><template #body="{ data: row }"><AppStatusBadge :status="row.status" /></template></Column>
      </DataTable>
    </section>
  </div>
</template>
