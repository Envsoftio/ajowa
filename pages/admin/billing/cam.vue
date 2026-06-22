<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'CAM Charges',
})
</script>

<template>
  <CycleChargeEntry
    mode="CAM"
    title="CAM charges"
    eyebrow="CAM billing"
    description="Generate CAM invoices from a start month. Quarterly is applied by default, and monthly or yearly advance flats can be changed per row."
    charge-name="CAM Charges"
    charge-label="CAM Charges"
    charge-type="CAM"
    period-charge-type="CAM"
    source="CYCLE_CAM_FLAT_CHARGE"
    default-period-frequency="QUARTERLY"
    :default-cycle-months="3"
    :default-rate-per-sq-ft="3.25"
    default-rate-label="CAM rate/sq ft/month"
    save-button-label="Save CAM charges"
    saved-summary="CAM charges saved"
    amount-summary-label="CAM total"
    units-summary-label="sq ft"
    show-area-rate
    show-per-flat-cycle
    cam-run-flow
  />
</template>
