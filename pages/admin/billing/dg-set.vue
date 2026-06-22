<script setup lang="ts">
definePageMeta({
  layout: 'admin',
  middleware: ['protected'],
  title: 'DG Set Charges',
})
</script>

<template>
  <CycleChargeEntry
    mode="DG"
    title="DG Set charges"
    eyebrow="DG Set billing"
    description="Create a monthly DG Set period here, enter opening and closing readings per flat, then generate DG Set bills."
    charge-name="DG Set"
    charge-label="Power Back Up Charges"
    charge-type="DG_SET"
    period-charge-type="DG_SET"
    source="MONTHLY_DG_METER_CHARGE"
    default-period-frequency="MONTHLY"
    electricity-type="POWER BACK UP"
    :default-rate-per-unit="29"
    default-connection-load="4 KW (5KVA)"
    default-rate-label="DG rate/unit"
    meter-label="Meter no."
    save-button-label="Save DG readings"
    saved-summary="DG readings saved"
    amount-summary-label="DG total"
    units-summary-label="units"
    show-connection-load
  />
</template>
