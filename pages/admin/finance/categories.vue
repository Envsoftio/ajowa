<script setup lang="ts">
import type {
  AccountHead,
  FinanceCategory,
  FinanceTransactionType,
} from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Categories',
})

type CategoriesResponse = { ok: true; data: { items: FinanceCategory[] } }
type AccountsResponse = { ok: true; data: { items: AccountHead[] } }

const api = useApi()
const toast = useToast()
const confirmAction = useAppConfirm()

const search = ref('')
const typeFilter = ref('')
const activeFilter = ref('')
const dialog = ref(false)
const saving = ref(false)
const selected = ref<FinanceCategory | null>(null)

const form = reactive<{
  code: string
  name: string
  transactionType: FinanceTransactionType
  categoryGroup: string
  accountHeadId: string
  requiresAttachment: boolean
  isActive: boolean
}>({
  code: '',
  name: '',
  transactionType: 'EXPENSE',
  categoryGroup: '',
  accountHeadId: '',
  requiresAttachment: false,
  isActive: true,
})

const loadCategories = () =>
  api<CategoriesResponse>('/api/admin/finance/categories', {
    query: {
      search: search.value,
      transactionType: typeFilter.value,
      isActive: activeFilter.value,
    },
  })

const loadAccounts = () =>
  api<AccountsResponse>('/api/admin/finance/accounts', {
    query: { isActive: 'true' },
  })

const {
  data: categoriesData,
  pending,
  refresh,
} = await useAsyncData('admin-finance-categories', loadCategories, {
  watch: [search, typeFilter, activeFilter],
})
const { data: accountsData } = await useAsyncData(
  'admin-finance-category-accounts',
  loadAccounts,
)

const categories = computed(() => categoriesData.value?.data.items ?? [])
const accounts = computed(() => accountsData.value?.data.items ?? [])
const accountOptions = computed(() =>
  accounts.value
    .filter(
      (account) =>
        account.headType === form.transactionType &&
        account.isActive &&
        account.allowsManualEntries,
    )
    .map((account) => ({
      label: `${account.code} - ${account.name}`,
      value: account.id,
    })),
)

const summary = computed(() => ({
  income: categories.value.filter((item) => item.transactionType === 'INCOME')
    .length,
  expense: categories.value.filter((item) => item.transactionType === 'EXPENSE')
    .length,
  active: categories.value.filter((item) => item.isActive).length,
}))

watch(
  () => form.transactionType,
  () => {
    if (
      !accountOptions.value.some(
        (option) => option.value === form.accountHeadId,
      )
    ) {
      form.accountHeadId = accountOptions.value[0]?.value ?? ''
    }
  },
)

const resetForm = () => {
  selected.value = null
  form.code = ''
  form.name = ''
  form.transactionType = 'EXPENSE'
  form.categoryGroup = ''
  form.accountHeadId = accountOptions.value[0]?.value ?? ''
  form.requiresAttachment = false
  form.isActive = true
}

const openCreate = () => {
  resetForm()
  dialog.value = true
}

const editCategory = (category: FinanceCategory) => {
  selected.value = category
  form.code = category.code
  form.name = category.name
  form.transactionType = category.transactionType
  form.categoryGroup = category.categoryGroup
  form.accountHeadId = category.accountHeadId ?? ''
  form.requiresAttachment = category.requiresAttachment
  form.isActive = category.isActive
  dialog.value = true
}

const submitCategory = async () => {
  saving.value = true
  try {
    const payload = selected.value?.isSystem
      ? {
          name: form.name,
          categoryGroup: form.categoryGroup,
          accountHeadId: form.accountHeadId,
          requiresAttachment: form.requiresAttachment,
          isActive: form.isActive,
        }
      : { ...form }

    if (selected.value) {
      await api(`/api/admin/finance/categories/${selected.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/finance/categories', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: 'Finance category saved.',
      life: 10000,
    })
    dialog.value = false
    resetForm()
    await refresh()
  } finally {
    saving.value = false
  }
}

const deleteCategory = async (category: FinanceCategory) => {
  const confirmed = await confirmAction({
    header: 'Delete category?',
    message: `Delete ${category.name}? Used categories should be marked inactive instead.`,
    acceptLabel: 'Delete',
  })

  if (!confirmed) {
    return
  }

  await api(`/api/admin/finance/categories/${category.id}`, {
    method: 'DELETE',
  })
  toast.add({
    severity: 'success',
    summary: 'Deleted',
    detail: 'Finance category deleted.',
    life: 10000,
  })
  await refresh()
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Income categories</p>
        <h3>{{ summary.income }}</h3>
        <p>Mapped to income account heads for journal credit lines.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Expense categories</p>
        <h3>{{ summary.expense }}</h3>
        <p>Mapped to expense account heads for journal debit lines.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Active</p>
        <h3>{{ summary.active }}</h3>
        <p>Inactive categories remain available for historical records.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Finance categories</h1>
          <p>
            Control transaction grouping and posting accounts for income and
            expenses.
          </p>
        </div>
        <Button label="Add category" icon="pi pi-plus" @click="openCreate" />
      </header>

      <div class="admin-page-guide">
        <h2>How to use this page</h2>
        <p>
          Categories decide where income and expense transactions post in the
          ledger.
        </p>
        <ol>
          <li>
            Create categories for common transaction purposes such as repairs,
            salaries, interest, or rent.
          </li>
          <li>
            Map every category to the correct posting account before users
            create journals.
          </li>
          <li>
            Mark categories inactive when they should no longer be used, while
            keeping old records readable.
          </li>
        </ol>
      </div>

      <div class="list-page__toolbar">
        <label class="list-page__search">
          <span class="field-label">
            Search
            <i
              class="pi pi-info-circle"
              title="Find categories by code, name, group, or mapped account."
              aria-label="Find categories by code, name, group, or mapped account."
            />
          </span>
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="search" placeholder="Search categories" />
          </IconField>
        </label>
        <div class="list-page__filters">
          <label>
            <span class="field-label">
              Type
              <i
                class="pi pi-info-circle"
                title="Show income categories, expense categories, or both."
                aria-label="Show income categories, expense categories, or both."
              />
            </span>
            <Select
              v-model="typeFilter"
              :options="[
                { label: 'All types', value: '' },
                { label: 'Income', value: 'INCOME' },
                { label: 'Expense', value: 'EXPENSE' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
          <label>
            <span class="field-label">
              Active state
              <i
                class="pi pi-info-circle"
                title="Show all categories, only usable categories, or inactive historical categories."
                aria-label="Show all categories, only usable categories, or inactive historical categories."
              />
            </span>
            <Select
              v-model="activeFilter"
              :options="[
                { label: 'All statuses', value: '' },
                { label: 'Active only', value: 'true' },
                { label: 'Inactive only', value: 'false' },
              ]"
              option-label="label"
              option-value="value"
            />
          </label>
        </div>
      </div>

      <DataTable
        :value="categories"
        :loading="pending"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column field="code" header="Code" />
        <Column field="name" header="Category" />
        <Column field="transactionType" header="Type" />
        <Column field="categoryGroup" header="Group" />
        <Column field="accountHeadName" header="Posting account">
          <template #body="{ data: row }">
            {{ row.accountHeadCode }} - {{ row.accountHeadName }}
          </template>
        </Column>
        <Column field="requiresAttachment" header="Attachment">
          <template #body="{ data: row }">
            <Tag
              :value="row.requiresAttachment ? 'Required' : 'Optional'"
              :severity="row.requiresAttachment ? 'warn' : 'secondary'"
              rounded
            />
          </template>
        </Column>
        <Column field="isActive" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
          </template>
        </Column>
        <Column header="Actions" style="width: 130px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.25rem">
              <Button
                icon="pi pi-pencil"
                severity="secondary"
                text
                rounded
                :aria-label="`Edit ${row.name}`"
                :title="`Edit ${row.name}`"
                @click="editCategory(row)"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :disabled="row.isSystem"
                :aria-label="`Delete ${row.name}`"
                :title="`Delete ${row.name}`"
                @click="deleteCategory(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog
      v-model:visible="dialog"
      :header="selected ? 'Edit category' : 'Add category'"
      modal
      class="p-dialog-custom"
      :style="{ width: '620px' }"
    >
      <form
        class="admin-form-layout"
        style="padding: 1.5rem 0 0"
        @submit.prevent="submitCategory"
      >
        <div class="admin-page-guide">
          <h2>Category form</h2>
          <p>
            Use this form to connect a transaction purpose with the ledger
            account it should post to.
          </p>
        </div>
        <div class="admin-form-grid">
          <label>
            <span class="field-label">
              Code
              <i
                class="pi pi-info-circle"
                title="Short unique code used to identify and sort this category."
                aria-label="Short unique code used to identify and sort this category."
              />
            </span>
            <InputText
              v-model="form.code"
              required
              :disabled="selected?.isSystem"
            />
          </label>
          <label>
            <span class="field-label">
              Name
              <i
                class="pi pi-info-circle"
                title="Readable category name shown while creating finance transactions."
                aria-label="Readable category name shown while creating finance transactions."
              />
            </span>
            <InputText v-model="form.name" required />
          </label>
          <label>
            <span class="field-label">
              Type
              <i
                class="pi pi-info-circle"
                title="Choose whether this category creates income or expense transactions."
                aria-label="Choose whether this category creates income or expense transactions."
              />
            </span>
            <Select
              v-model="form.transactionType"
              :options="[
                { label: 'Expense', value: 'EXPENSE' },
                { label: 'Income', value: 'INCOME' },
              ]"
              option-label="label"
              option-value="value"
              :disabled="selected?.isSystem"
            />
          </label>
          <label>
            <span class="field-label">
              Group
              <i
                class="pi pi-info-circle"
                title="Higher-level grouping for related categories, such as Repairs or Utilities."
                aria-label="Higher-level grouping for related categories, such as Repairs or Utilities."
              />
            </span>
            <InputText v-model="form.categoryGroup" required />
          </label>
          <label>
            <span class="field-label">
              Posting account
              <i
                class="pi pi-info-circle"
                title="Ledger account used when transactions in this category are posted."
                aria-label="Ledger account used when transactions in this category are posted."
              />
            </span>
            <Select
              v-model="form.accountHeadId"
              :options="accountOptions"
              option-label="label"
              option-value="value"
              required
            />
          </label>
          <label class="admin-toggle-card">
            <span class="field-label">
              Attachment required
              <i
                class="pi pi-info-circle"
                title="Require proof or supporting document for transactions in this category."
                aria-label="Require proof or supporting document for transactions in this category."
              />
            </span>
            <ToggleSwitch v-model="form.requiresAttachment" />
          </label>
          <label class="admin-toggle-card">
            <span class="field-label">
              Active
              <i
                class="pi pi-info-circle"
                title="Inactive categories remain in history but cannot be selected for new transactions."
                aria-label="Inactive categories remain in history but cannot be selected for new transactions."
              />
            </span>
            <ToggleSwitch v-model="form.isActive" />
          </label>
        </div>
        <div
          class="admin-inline-actions"
          style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem"
        >
          <Button
            type="button"
            label="Cancel"
            severity="secondary"
            outlined
            @click="dialog = false"
          />
          <Button type="submit" label="Save category" :loading="saving" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
