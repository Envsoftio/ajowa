<script setup lang="ts">
import type { ServiceLocationType } from '~/types/domain'
import { commonAreaOptions } from '~/shared/service-requests'
import { serviceRequestFieldLimits } from '~/shared/service-request-validation'

defineProps<{
  flatOptions: Array<{ id: string; label: string }>
  locationTypeError?: string | undefined
  flatError?: string | undefined
  areaNameError?: string | undefined
  assetReferenceError?: string | undefined
}>()

const locationType = defineModel<ServiceLocationType>('locationType', {
  required: true,
})
const flatId = defineModel<string | null>('flatId', { default: null })
const areaName = defineModel<string | null>('areaName', { default: null })
const assetReference = defineModel<string | null>('assetReference', {
  default: null,
})
</script>

<template>
  <section class="ticket-location-selector">
    <SelectButton
      v-model="locationType"
      :options="[
        { label: 'My Flat', value: 'FLAT' },
        { label: 'Common Area', value: 'COMMON_AREA' },
        { label: 'Society Asset', value: 'SOCIETY_ASSET' },
      ]"
      option-label="label"
      option-value="value"
      :allow-empty="false"
      :invalid="Boolean(locationTypeError)"
      :aria-describedby="
        locationTypeError ? 'ticket-location-type-error' : undefined
      "
    />
    <small
      v-if="locationTypeError"
      id="ticket-location-type-error"
      class="field-error"
    >
      {{ locationTypeError }}
    </small>

    <label v-if="locationType === 'FLAT'">
      <span
        >Flat <span class="required-marker" aria-hidden="true">*</span></span
      >
      <Select
        v-model="flatId"
        input-id="ticket-flat"
        :options="flatOptions"
        option-label="label"
        option-value="id"
        :placeholder="
          flatOptions.length > 0 ? 'Select flat' : 'No linked flats available'
        "
        :invalid="Boolean(flatError)"
        :aria-describedby="flatError ? 'ticket-flat-error' : undefined"
        fluid
      />
      <small v-if="flatError" id="ticket-flat-error" class="field-error">{{
        flatError
      }}</small>
    </label>

    <label v-if="locationType === 'COMMON_AREA'">
      <span
        >Common area
        <span class="required-marker" aria-hidden="true">*</span></span
      >
      <Select
        v-model="areaName"
        input-id="ticket-common-area"
        :options="[...commonAreaOptions]"
        placeholder="Choose or enter area"
        :invalid="Boolean(areaNameError)"
        :aria-describedby="
          areaNameError ? 'ticket-common-area-error' : undefined
        "
        editable
        fluid
      />
      <small
        v-if="areaNameError"
        id="ticket-common-area-error"
        class="field-error"
        >{{ areaNameError }}</small
      >
    </label>

    <label v-if="locationType === 'SOCIETY_ASSET'">
      <span
        >Asset reference
        <span class="required-marker" aria-hidden="true">*</span></span
      >
      <InputText
        id="ticket-asset-reference"
        v-model="assetReference"
        placeholder="Lift A, pump room, gate hardware"
        :maxlength="serviceRequestFieldLimits.locationDetail"
        :invalid="Boolean(assetReferenceError)"
        :aria-describedby="
          assetReferenceError ? 'ticket-asset-reference-error' : undefined
        "
        fluid
      />
      <small
        v-if="assetReferenceError"
        id="ticket-asset-reference-error"
        class="field-error"
      >
        {{ assetReferenceError }}
      </small>
    </label>
  </section>
</template>

<style scoped>
.ticket-location-selector {
  display: grid;
  gap: 1rem;
}
</style>
