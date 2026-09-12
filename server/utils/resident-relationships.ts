import type { PoolClient } from 'pg'

type ContactRelationship = {
  id?: string | undefined
  flatId: string
  isPrimaryContact: boolean
  isBillingContact: boolean
  isActive: boolean
}

/**
 * Make an explicitly selected active contact the flat's contact before the
 * relationship is written. The partial unique indexes remain the final guard,
 * while this update makes contact handovers atomic instead of forcing admins
 * to edit the former contact in a separate transaction first.
 */
export const releasePreviousFlatContacts = async (
  client: PoolClient,
  relationship: ContactRelationship,
) => {
  if (
    !relationship.isActive ||
    (!relationship.isPrimaryContact && !relationship.isBillingContact)
  ) {
    return
  }

  await client.query(
    `
      update flat_residents
      set
        is_primary_contact = case when $3 then false else is_primary_contact end,
        is_billing_contact = case when $4 then false else is_billing_contact end,
        updated_at = now()
      where flat_id = $1
        and is_active = true
        and ($2::uuid is null or id <> $2::uuid)
        and (
          ($3 and is_primary_contact = true)
          or ($4 and is_billing_contact = true)
        )
    `,
    [
      relationship.flatId,
      relationship.id ?? null,
      relationship.isPrimaryContact,
      relationship.isBillingContact,
    ],
  )
}
