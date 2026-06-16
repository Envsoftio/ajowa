<script setup lang="ts">
import type { ServiceLocationType } from '~/types/domain'
import { commonAreaOptions } from '~/shared/service-requests'

defineProps<{
  flatOptions: Array<{ id: string; label: string }>
}>()

const locationType = defineModel<ServiceLocationType>('locationType', { required: true })
const flatId = defineModel<string | null>('flatId', { default: null })
const areaName = defineModel<string | null>('areaName', { default: null })
const assetReference = defineModel<string | null>('assetReference', { default: null })
</script>

<template>
  <section class="ticket-location-selector">
    <SelectButton
      v-model="locationType"
      :options="[
        { label: 'My Flat', value: 'FLAT' },
        { label: 'Common Area', value: 'COMMON_AREA' },
        { label: 'Society Asset', value: 'SOCIETY_ASSET' }
      ]"
      option-label="label"
      option-value="value"
    />

    <label v-if="locationType === 'FLAT'">
      <span>Flat</span>
      <Select v-model="flatId" :options="flatOptions" option-label="label" option-value="id" placeholder="Select flat" fluid />
    </label>

    <label v-if="locationType === 'COMMON_AREA'">
      <span>Common area</span>
      <Select v-model="areaName" :options="[...commonAreaOptions]" placeholder="Choose area" editable fluid />
    </label>

    <label v-if="locationType === 'SOCIETY_ASSET'">
      <span>Asset reference</span>
      <InputText v-model="assetReference" placeholder="Lift A, pump room, gate hardware" fluid />
    </label>
  </section>
</template>

<style scoped>
.ticket-location-selector {
  display: grid;
  gap: 1rem;
}
</style>
