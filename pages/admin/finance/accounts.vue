<script setup lang="ts">
import type { AccountHead, AccountHeadType, BankAccount, BankAccountType } from '~/types/domain'

definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'Finance Accounts',
})

type AccountsResponse = { ok: true; data: { items: AccountHead[] } }
type BankAccountsResponse = { ok: true; data: { items: BankAccount[] } }

const api = useApi()
const toast = useToast()

const accountTypes: { label: string; value: AccountHeadType }[] = [
  { label: 'Assets', value: 'ASSET' },
  { label: 'Liabilities', value: 'LIABILITY' },
  { label: 'Income', value: 'INCOME' },
  { label: 'Expenses', value: 'EXPENSE' },
  { label: 'Equity', value: 'EQUITY' },
]

const bankAccountTypes: { label: string; value: BankAccountType }[] = [
  { label: 'Savings', value: 'SAVINGS' },
  { label: 'Current', value: 'CURRENT' },
  { label: 'Cash credit', value: 'CASH_CREDIT' },
  { label: 'Overdraft', value: 'OVERDRAFT' },
  { label: 'Other', value: 'OTHER' },
]

const activeTab = ref<'accounts' | 'banks'>('accounts')
const search = ref('')
const activeFilter = ref('')
const typeFilter = ref('')

const selectedAccount = ref<AccountHead | null>(null)
const accountDialog = ref(false)
const savingAccount = ref(false)

const selectedBankAccount = ref<BankAccount | null>(null)
const bankDialog = ref(false)
const savingBankAccount = ref(false)

const accountForm = reactive<{
  code: string
  name: string
  parentId: string | null
  headType: AccountHeadType
  isActive: boolean
  allowsManualEntries: boolean
}>({
  code: '',
  name: '',
  parentId: null,
  headType: 'ASSET',
  isActive: true,
  allowsManualEntries: true,
})

const bankForm = reactive<{
  bankName: string
  accountName: string
  accountNumber: string
  ifscCode: string
  accountType: BankAccountType
  branchName: string
  upiId: string
  accountHeadId: string
  isDefault: boolean
  isActive: boolean
}>({
  bankName: '',
  accountName: '',
  accountNumber: '',
  ifscCode: '',
  accountType: 'CURRENT',
  branchName: '',
  upiId: '',
  accountHeadId: '',
  isDefault: false,
  isActive: true,
})

const loadAccounts = () =>
  api<AccountsResponse>('/api/admin/finance/accounts', {
    query: {
      search: search.value,
      headType: typeFilter.value,
      isActive: activeFilter.value,
    },
  })

const loadBankAccounts = () =>
  api<BankAccountsResponse>('/api/admin/finance/bank-accounts', {
    query: {
      search: search.value,
      isActive: activeFilter.value,
    },
  })

const { data: accountsData, pending: accountsPending, refresh: refreshAccounts } = await useAsyncData(
  'admin-finance-accounts',
  loadAccounts,
  { watch: [search, activeFilter, typeFilter] },
)

const { data: bankAccountsData, pending: bankAccountsPending, refresh: refreshBankAccounts } = await useAsyncData(
  'admin-finance-bank-accounts',
  loadBankAccounts,
  { watch: [search, activeFilter] },
)

const accounts = computed(() => accountsData.value?.data.items ?? [])
const bankAccounts = computed(() => bankAccountsData.value?.data.items ?? [])

const parentOptions = computed(() =>
  accounts.value
    .filter((account) => account.headType === accountForm.headType && account.id !== selectedAccount.value?.id)
    .map((account) => ({
      label: `${'  '.repeat(account.level)}${account.code} - ${account.name}`,
      value: account.id,
    })),
)

const assetAccountOptions = computed(() =>
  accounts.value
    .filter((account) => account.headType === 'ASSET' && account.isActive)
    .map((account) => ({
      label: `${'  '.repeat(account.level)}${account.code} - ${account.name}`,
      value: account.id,
    })),
)

const summary = computed(() => ({
  accounts: accounts.value.length,
  activeAccounts: accounts.value.filter((account) => account.isActive).length,
  bankAccounts: bankAccounts.value.length,
  bankBalance: bankAccounts.value.reduce((total, account) => total + account.balance, 0),
}))

const formatMoney = (value: number) =>
  new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 2,
  }).format(value)

const resetAccountForm = () => {
  selectedAccount.value = null
  accountForm.code = ''
  accountForm.name = ''
  accountForm.parentId = null
  accountForm.headType = 'ASSET'
  accountForm.isActive = true
  accountForm.allowsManualEntries = true
}

const openCreateAccount = () => {
  resetAccountForm()
  accountDialog.value = true
}

const editAccount = (account: AccountHead) => {
  selectedAccount.value = account
  accountForm.code = account.code
  accountForm.name = account.name
  accountForm.parentId = account.parentId
  accountForm.headType = account.headType
  accountForm.isActive = account.isActive
  accountForm.allowsManualEntries = account.allowsManualEntries
  accountDialog.value = true
}

const closeAccountDialog = () => {
  accountDialog.value = false
  resetAccountForm()
}

const submitAccount = async () => {
  savingAccount.value = true

  try {
    const payload = selectedAccount.value?.isSystem
      ? { name: accountForm.name }
      : {
          ...accountForm,
          parentId: accountForm.parentId || null,
        }

    if (selectedAccount.value) {
      await api(`/api/admin/finance/accounts/${selectedAccount.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/finance/accounts', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedAccount.value ? 'Account head updated.' : 'Account head created.',
      life: 3000,
    })
    closeAccountDialog()
    await refreshAccounts()
  } finally {
    savingAccount.value = false
  }
}

const deleteAccount = async (account: AccountHead) => {
  if (!window.confirm(`Delete ${account.name}? This only works for unused custom account heads.`)) {
    return
  }

  await api(`/api/admin/finance/accounts/${account.id}`, { method: 'DELETE' })
  toast.add({
    severity: 'success',
    summary: 'Deleted',
    detail: 'Account head deleted.',
    life: 3000,
  })
  await refreshAccounts()
}

const resetBankForm = () => {
  selectedBankAccount.value = null
  bankForm.bankName = ''
  bankForm.accountName = ''
  bankForm.accountNumber = ''
  bankForm.ifscCode = ''
  bankForm.accountType = 'CURRENT'
  bankForm.branchName = ''
  bankForm.upiId = ''
  bankForm.accountHeadId = assetAccountOptions.value[0]?.value ?? ''
  bankForm.isDefault = false
  bankForm.isActive = true
}

const openCreateBankAccount = () => {
  resetBankForm()
  bankDialog.value = true
}

const editBankAccount = (account: BankAccount) => {
  selectedBankAccount.value = account
  bankForm.bankName = account.bankName
  bankForm.accountName = account.accountName
  bankForm.accountNumber = ''
  bankForm.ifscCode = account.ifscCode
  bankForm.accountType = account.accountType
  bankForm.branchName = account.branchName ?? ''
  bankForm.upiId = account.upiId ?? ''
  bankForm.accountHeadId = account.accountHeadId
  bankForm.isDefault = account.isDefault
  bankForm.isActive = account.isActive
  bankDialog.value = true
}

const closeBankDialog = () => {
  bankDialog.value = false
  resetBankForm()
}

const submitBankAccount = async () => {
  savingBankAccount.value = true

  try {
    const payload: Record<string, unknown> = {
      ...bankForm,
      branchName: bankForm.branchName || null,
      upiId: bankForm.upiId || null,
    }

    if (selectedBankAccount.value && !bankForm.accountNumber) {
      delete payload.accountNumber
    }

    if (selectedBankAccount.value) {
      await api(`/api/admin/finance/bank-accounts/${selectedBankAccount.value.id}`, {
        method: 'PATCH',
        body: payload,
      })
    } else {
      await api('/api/admin/finance/bank-accounts', {
        method: 'POST',
        body: payload,
      })
    }

    toast.add({
      severity: 'success',
      summary: 'Saved',
      detail: selectedBankAccount.value ? 'Bank account updated.' : 'Bank account created.',
      life: 3000,
    })
    closeBankDialog()
    await refreshBankAccounts()
  } finally {
    savingBankAccount.value = false
  }
}

const deleteBankAccount = async (account: BankAccount) => {
  if (!window.confirm(`Delete ${account.accountName}? Bank accounts with linked transactions should be marked inactive instead.`)) {
    return
  }

  await api(`/api/admin/finance/bank-accounts/${account.id}`, { method: 'DELETE' })
  toast.add({
    severity: 'success',
    summary: 'Deleted',
    detail: 'Bank account deleted.',
    life: 3000,
  })
  await refreshBankAccounts()
}
</script>

<template>
  <div class="landing-page">
    <div class="surface-grid">
      <section class="surface-card">
        <p class="eyebrow">Chart of accounts</p>
        <h3>{{ summary.accounts }} heads</h3>
        <p>{{ summary.activeAccounts }} active account heads across assets, liabilities, income, expenses, and equity.</p>
      </section>
      <section class="surface-card">
        <p class="eyebrow">Bank balances</p>
        <h3>{{ formatMoney(summary.bankBalance) }}</h3>
        <p>Calculated from posted journal lines only.</p>
      </section>
    </div>

    <section class="list-page surface-card">
      <header class="list-page__header">
        <div>
          <h1>Finance accounts</h1>
          <p>Maintain account heads, bank mappings, and ledger-derived balances.</p>
        </div>
        <div class="list-page__exports">
          <Button
            v-if="activeTab === 'accounts'"
            label="Create account"
            icon="pi pi-plus"
            @click="openCreateAccount"
          />
          <Button
            v-else
            label="Add bank account"
            icon="pi pi-plus"
            @click="openCreateBankAccount"
          />
        </div>
      </header>

      <div class="list-page__toolbar">
        <SelectButton
          v-model="activeTab"
          :options="[
            { label: 'Account heads', value: 'accounts' },
            { label: 'Bank accounts', value: 'banks' }
          ]"
          option-label="label"
          option-value="value"
        />
        <IconField class="list-page__search">
          <InputIcon class="pi pi-search" />
          <InputText v-model="search" placeholder="Search finance accounts" />
        </IconField>
        <div class="list-page__filters">
          <Select
            v-if="activeTab === 'accounts'"
            v-model="typeFilter"
            :options="[{ label: 'All types', value: '' }, ...accountTypes]"
            option-label="label"
            option-value="value"
            placeholder="Account type"
          />
          <Select
            v-model="activeFilter"
            :options="[
              { label: 'All statuses', value: '' },
              { label: 'Active only', value: 'true' },
              { label: 'Inactive only', value: 'false' }
            ]"
            option-label="label"
            option-value="value"
            placeholder="Active state"
          />
        </div>
      </div>

      <DataTable
        v-if="activeTab === 'accounts'"
        :value="accounts"
        :loading="accountsPending"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column field="code" header="Code">
          <template #body="{ data: row }">
            <span :style="{ paddingLeft: `${row.level * 1.25}rem` }">
              <i v-if="row.hasChildren" class="pi pi-folder" aria-hidden="true" />
              <i v-else class="pi pi-file" aria-hidden="true" />
              {{ row.code }}
            </span>
          </template>
        </Column>
        <Column field="name" header="Account head" />
        <Column field="headType" header="Type" />
        <Column field="balance" header="Running balance">
          <template #body="{ data: row }">
            {{ formatMoney(row.balance) }}
          </template>
        </Column>
        <Column field="isSystem" header="Kind">
          <template #body="{ data: row }">
            <Tag :value="row.isSystem ? 'System' : 'Custom'" :severity="row.isSystem ? 'info' : 'secondary'" rounded />
          </template>
        </Column>
        <Column field="isActive" header="Status">
          <template #body="{ data: row }">
            <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
          </template>
        </Column>
        <Column header="Actions" style="width: 130px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.25rem;">
              <Button icon="pi pi-pencil" severity="secondary" text rounded @click="editAccount(row)" />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                :disabled="row.isSystem"
                @click="deleteAccount(row)"
              />
            </div>
          </template>
        </Column>
      </DataTable>

      <DataTable
        v-else
        :value="bankAccounts"
        :loading="bankAccountsPending"
        responsive-layout="scroll"
        class="list-page__table"
      >
        <Column field="bankName" header="Bank" />
        <Column field="accountName" header="Account name" />
        <Column field="accountNumberMasked" header="Account no." />
        <Column field="ifscCode" header="IFSC" />
        <Column field="accountType" header="Type" />
        <Column field="accountHeadName" header="Mapped Asset" />
        <Column field="balance" header="Running balance">
          <template #body="{ data: row }">
            {{ formatMoney(row.balance) }}
          </template>
        </Column>
        <Column field="isActive" header="Status">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.35rem;">
              <Tag v-if="row.isDefault" value="Default" severity="success" rounded />
              <AppStatusBadge :status="row.isActive ? 'active' : 'inactive'" />
            </div>
          </template>
        </Column>
        <Column header="Actions" style="width: 130px">
          <template #body="{ data: row }">
            <div class="admin-inline-actions" style="gap: 0.25rem;">
              <Button icon="pi pi-pencil" severity="secondary" text rounded @click="editBankAccount(row)" />
              <Button icon="pi pi-trash" severity="danger" text rounded @click="deleteBankAccount(row)" />
            </div>
          </template>
        </Column>
      </DataTable>
    </section>

    <Dialog
      v-model:visible="accountDialog"
      :header="selectedAccount ? 'Edit account head' : 'Create account head'"
      modal
      class="p-dialog-custom"
      :style="{ width: '520px' }"
    >
      <form class="admin-form-layout" style="padding: 1.5rem 0 0;" @submit.prevent="submitAccount">
        <div class="admin-form-grid">
          <label>
            <span>Code</span>
            <InputText v-model="accountForm.code" required :disabled="selectedAccount?.isSystem" />
          </label>
          <label>
            <span>Name</span>
            <InputText v-model="accountForm.name" required />
          </label>
          <label>
            <span>Type</span>
            <Select
              v-model="accountForm.headType"
              :options="accountTypes"
              option-label="label"
              option-value="value"
              :disabled="selectedAccount?.isSystem"
            />
          </label>
          <label>
            <span>Parent</span>
            <Select
              v-model="accountForm.parentId"
              :options="[{ label: 'No parent', value: null }, ...parentOptions]"
              option-label="label"
              option-value="value"
              :disabled="selectedAccount?.isSystem"
              placeholder="Choose parent"
            />
          </label>
          <label class="admin-toggle-card">
            <span>Active</span>
            <ToggleSwitch v-model="accountForm.isActive" :disabled="selectedAccount?.isSystem" />
          </label>
          <label class="admin-toggle-card">
            <span>Manual journal entries</span>
            <ToggleSwitch v-model="accountForm.allowsManualEntries" :disabled="selectedAccount?.isSystem" />
          </label>
        </div>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeAccountDialog" />
          <Button type="submit" :label="selectedAccount ? 'Update account' : 'Create account'" :loading="savingAccount" />
        </div>
      </form>
    </Dialog>

    <Dialog
      v-model:visible="bankDialog"
      :header="selectedBankAccount ? 'Edit bank account' : 'Add bank account'"
      modal
      class="p-dialog-custom"
      :style="{ width: '620px' }"
    >
      <form class="admin-form-layout" style="padding: 1.5rem 0 0;" @submit.prevent="submitBankAccount">
        <div class="admin-form-grid">
          <label>
            <span>Bank</span>
            <InputText v-model="bankForm.bankName" required />
          </label>
          <label>
            <span>Account display name</span>
            <InputText v-model="bankForm.accountName" required />
          </label>
          <label>
            <span>Account number</span>
            <InputText
              v-model="bankForm.accountNumber"
              :required="!selectedBankAccount"
              :placeholder="selectedBankAccount ? 'Leave blank to keep existing' : ''"
            />
          </label>
          <label>
            <span>IFSC</span>
            <InputText v-model="bankForm.ifscCode" required />
          </label>
          <label>
            <span>Type</span>
            <Select v-model="bankForm.accountType" :options="bankAccountTypes" option-label="label" option-value="value" />
          </label>
          <label>
            <span>Mapped Asset account</span>
            <Select
              v-model="bankForm.accountHeadId"
              :options="assetAccountOptions"
              option-label="label"
              option-value="value"
              required
              placeholder="Choose Asset account"
            />
          </label>
          <label>
            <span>Branch</span>
            <InputText v-model="bankForm.branchName" />
          </label>
          <label>
            <span>UPI ID</span>
            <InputText v-model="bankForm.upiId" />
          </label>
          <label class="admin-toggle-card">
            <span>Default account</span>
            <ToggleSwitch v-model="bankForm.isDefault" />
          </label>
          <label class="admin-toggle-card">
            <span>Active</span>
            <ToggleSwitch v-model="bankForm.isActive" />
          </label>
        </div>

        <div class="admin-inline-actions" style="justify-content: flex-end; margin-top: 2rem; gap: 0.75rem;">
          <Button type="button" label="Cancel" severity="secondary" outlined @click="closeBankDialog" />
          <Button type="submit" :label="selectedBankAccount ? 'Update bank account' : 'Add bank account'" :loading="savingBankAccount" />
        </div>
      </form>
    </Dialog>
  </div>
</template>
