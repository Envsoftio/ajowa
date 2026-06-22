<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'CAM Charges',
})
</script>

<template>
  <BillingCycleChargeEntry
    mode="CAM"
    title="CAM charges"
    eyebrow="CAM billing"
    description="Select a monthly, quarterly, or custom bill cycle, then enter CAM readings or direct per-flat amounts before final bill generation."
    charge-name="CAM Charges"
    charge-label="CAM Charges"
    charge-type="CAM"
    source="CYCLE_CAM_FLAT_CHARGE"
    default-amount-label="Default CAM amount"
    default-rate-label="Default CAM rate/unit"
    meter-label="CAM ref."
    save-button-label="Save CAM charges"
    saved-summary="CAM charges saved"
    amount-summary-label="CAM total"
    units-summary-label="units"
    allow-manual-amount
  />
</template>
