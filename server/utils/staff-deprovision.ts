import type { PoolClient } from 'pg'

type OpenTicketRow = {
  id: string
  status: string
}

export type DeprovisionStaffInput = {
  userId: string
  societyId: string
  actorUserId: string
  authUserId: string | null
  email: string | null
}

const archivedAuthEmail = (authUserId: string) =>
  `archived+${authUserId}@deleted.ajowa.invalid`

export const deprovisionStaffMember = async (
  client: PoolClient,
  input: DeprovisionStaffInput,
) => {
  await client.query(
    `
      update service_staff_assignments
      set is_active = false,
          is_primary = false,
          ended_at = coalesce(ended_at, now()),
          updated_at = now()
      where user_id = $1
        and is_active = true
    `,
    [input.userId],
  )

  if (input.email) {
    await client.query(
      `
        update auth_invites
        set revoked_at = now(),
            revoked_by_user_id = $2,
            updated_at = now()
        where society_id = $3
          and email = $1
          and accepted_at is null
          and revoked_at is null
      `,
      [input.email, input.actorUserId, input.societyId],
    )
  }

  await client.query(
    `
      update push_subscriptions
      set status = 'REVOKED',
          revoked_at = coalesce(revoked_at, now()),
          updated_at = now()
      where user_id = $1
        and status = 'ACTIVE'
    `,
    [input.userId],
  )

  await client.query(
    `
      update notification_jobs nj
      set status = 'CANCELLED',
          failure_reason = 'Recipient staff account archived',
          updated_at = now()
      from notification_audiences na
      where na.id = nj.audience_id
        and na.target_user_id = $1
        and nj.status in ('QUEUED', 'RETRYING')
    `,
    [input.userId],
  )

  await client.query(
    `
      update shared_report_links
      set revoked_at = now(),
          revoked_by_user_id = $2,
          revoked_reason = coalesce(
            revoked_reason,
            'Owner staff account archived'
          ),
          updated_at = now()
      where society_id = $3
        and owner_user_id = $1
        and revoked_at is null
        and consumed_at is null
        and expires_at > now()
    `,
    [input.userId, input.actorUserId, input.societyId],
  )

  const openTickets = await client.query<OpenTicketRow>(
    `
      select id, status::text as status
      from service_requests
      where society_id = $2
        and assignee_user_id = $1
        and status not in ('RESOLVED', 'CLOSED', 'CANCELLED')
      for update
    `,
    [input.userId, input.societyId],
  )

  const openTicketIds = openTickets.rows.map((ticket) => ticket.id)

  if (openTicketIds.length > 0) {
    await client.query(
      `
        update service_request_assignments
        set unassigned_at = now()
        where service_request_id = any($1::uuid[])
          and assignee_user_id = $2
          and unassigned_at is null
      `,
      [openTicketIds, input.userId],
    )

    await client.query(
      `
        update service_requests
        set assignee_user_id = null,
            status = 'NEEDS_REASSIGNMENT',
            updated_at = now()
        where id = any($1::uuid[])
      `,
      [openTicketIds],
    )

    for (const ticket of openTickets.rows) {
      await client.query(
        `
          insert into service_request_events (
            service_request_id,
            event_type,
            actor_user_id,
            visibility,
            from_status,
            to_status,
            metadata
          )
          values (
            $1,
            'REASSIGNED',
            $2,
            'SYSTEM',
            $3::service_request_status,
            'NEEDS_REASSIGNMENT',
            $4::jsonb
          )
        `,
        [
          ticket.id,
          input.actorUserId,
          ticket.status,
          JSON.stringify({
            fromAssigneeUserId: input.userId,
            toAssigneeUserId: null,
            reason: 'Staff account archived',
          }),
        ],
      )
    }
  }

  if (input.authUserId) {
    await client.query('delete from auth_sessions where user_id = $1', [
      input.authUserId,
    ])
    await client.query('delete from auth_accounts where user_id = $1', [
      input.authUserId,
    ])
    await client.query('delete from auth_verifications where value = $1', [
      input.authUserId,
    ])
    await client.query(
      `
        update auth_users
        set name = 'Archived staff',
            email = $2,
            email_verified = false,
            image = null,
            updated_at = now()
        where id = $1
      `,
      [input.authUserId, archivedAuthEmail(input.authUserId)],
    )
  }

  await client.query(
    `
      update users
      set email = null,
          mobile_number = null,
          whatsapp_number = null,
          profile_image_path = null,
          can_login = false,
          must_change_password = false,
          email_verified = false,
          is_active = false,
          staff_permissions = '{}'::text[],
          notification_push_enabled = false,
          notification_email_enabled = false,
          notification_whatsapp_enabled = false,
          notification_in_app_enabled = false,
          deleted_at = now(),
          updated_at = now()
      where id = $1
        and society_id = $2
    `,
    [input.userId, input.societyId],
  )

  return {
    openTicketsRequeued: openTicketIds.length,
  }
}
