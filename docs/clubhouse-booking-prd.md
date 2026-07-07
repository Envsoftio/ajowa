# PRD: Clubhouse And Amenity Booking

Date: 2026-07-06
Owner: AJOWA product/engineering
Status: Draft

## Summary

AJOWA needs a proper resident-facing booking workflow for shared amenities such as the clubhouse, community hall, party area, gym room, pool, sports court, or other society facilities. Today residents can only raise a generic service request and write booking details in free text. That is useful as a temporary workaround, but it does not give residents a clear booking path, does not prevent double booking, and does not give admins a calendar-style approval workflow.

The recommended implementation is an additive booking module that stays separate from the current service-request system. Service requests should continue to handle complaints and operational work. Amenity bookings should handle reservation intent, availability, approval, cancellation, and optional charges.

The first production release should provide:

- Resident booking request flow for clubhouse and configured amenities.
- Admin booking approval workflow.
- Booking conflict prevention for approved reservations.
- Resident and admin booking lists.
- Notifications for submitted, approved, rejected, cancelled, and updated bookings.
- Clean future path for deposits, charges, QR/access integration, and calendar exports.

## Recommendation

Build the Proper Booking Feature as a separate module, not as an extension of `service_requests`.

This keeps existing features safe because the implementation can be additive:

- Do not add required columns to existing tables.
- Do not change service-request statuses or routing.
- Do not reuse the current ticket queue for booking approval.
- Do not connect booking charges to existing billing dues in the first release.
- Add new routes, APIs, tables, and sidebar entries for bookings.

Recommended rollout:

1. Phase 1: Booking request, approval, cancellation, conflict prevention, notifications.
2. Phase 2: Booking charges or deposits as admin-created receivables or manual payment records.
3. Phase 3: Rules engine, blackout dates, recurring slots, security/gate visibility, exports.

## Goals

- Let residents request clubhouse or amenity bookings using structured fields.
- Let admins approve, reject, cancel, and review bookings from a dedicated workspace.
- Prevent double booking for the same amenity and overlapping time window.
- Keep residents informed about booking status through in-app, push, and email notifications where available.
- Keep all booking history auditable.
- Support multiple amenities under the same society.
- Allow each amenity to define booking rules such as operating hours, min/max duration, capacity, lead time, and cancellation window.
- Preserve existing service requests, dues, payments, QR, notices, reports, and finance behavior.

## Non-Goals

- No automatic billing integration in the first release.
- No online payment collection for booking charges in the first release.
- No external calendar sync in the first release.
- No dynamic pricing engine in the first release.
- No self-service admin rule builder beyond basic amenity configuration in the first release.
- No migration of existing service requests into bookings unless explicitly planned later.
- No replacement of service requests for repairs, complaints, or staff work orders.

## Users

- Resident: requests an amenity booking, views status, cancels if allowed.
- Admin/manager: configures amenities, reviews booking requests, approves, rejects, cancels, and blocks unavailable slots.
- Service/security staff: may view approved bookings in a future phase for access control or preparation.
- Finance/admin staff: may reconcile booking charges or deposits in a future phase.

## Existing Product Context

The current app already has:

- Resident pages under `/my/*`.
- Admin pages under `/admin/*`.
- Service requests under `/my/service-requests` and `/admin/service-requests`.
- Notification infrastructure.
- Flat access and resident relationships.
- Staff permissions and admin/manager roles.
- Finance, dues, and payments.

The current app also seeds a `Clubhouse & Amenities` service department, but that department is for support tickets. A proper booking module should use new booking records and only optionally link to a service request if operational follow-up is needed later.

## Product Principles

- Booking should feel like booking, not like filing a complaint.
- Availability should be clear before the resident submits.
- Admin approval should be fast and calendar-aware.
- The database must be the final guard against double booking.
- The first release should stay operationally simple and avoid premature payment complexity.
- Every booking status change should leave an audit trail.

## High-Level User Journeys

### Resident Creates Booking

1. Resident opens `/my/amenity-bookings/new`.
2. Resident selects flat, amenity, booking date, start time, end time, guest count, and purpose.
3. System validates basic rules and visible conflicts.
4. Resident submits request.
5. System creates a booking in `REQUESTED` status.
6. Admins receive a notification.
7. Resident can view the booking in `/my/amenity-bookings`.

### Admin Approves Booking

1. Admin opens `/admin/amenity-bookings`.
2. Admin filters by date, amenity, status, flat, or requester.
3. Admin opens a booking detail view.
4. Admin reviews resident details, booking window, guest count, purpose, and conflicts.
5. Admin approves the booking.
6. System verifies no approved overlap exists at the database level.
7. Resident receives an approval notification.

### Admin Rejects Booking

1. Admin opens the booking.
2. Admin chooses reject.
3. Admin enters a reason.
4. System changes status to `REJECTED`.
5. Resident receives the reason.

### Resident Cancels Booking

1. Resident opens their booking detail.
2. If status and cancellation window allow it, resident cancels.
3. System changes status to `CANCELLED`.
4. Admins receive a notification.

### Admin Blocks Time

1. Admin creates a maintenance/private block for an amenity.
2. Block appears as unavailable in resident availability.
3. New booking requests cannot overlap approved blocks.

## Functional Requirements

### Resident Requirements

#### Resident Navigation

Add resident navigation entry:

```text
My Bookings
```

Recommended route:

```text
/my/amenity-bookings
```

#### Resident Booking List

Residents can see bookings linked to their accessible flats.

List should show:

- Booking number
- Amenity name
- Flat
- Date
- Start time
- End time
- Status
- Guest count
- Created date
- Primary action

Filters:

- Status
- Amenity
- Date range

#### Resident Create Booking

Resident form fields:

- Flat
- Amenity
- Booking date
- Start time
- End time
- Guest count
- Purpose
- Notes or special instructions
- Agreement checkbox for society rules

Validation:

- Flat must be accessible to resident.
- Amenity must be active and bookable.
- Start time must be before end time.
- Booking must satisfy amenity min/max duration.
- Booking must be inside operating hours.
- Booking must respect minimum lead time.
- Guest count must not exceed configured capacity.
- Booking request cannot overlap an already approved booking or blocked slot.

#### Resident Booking Detail

Detail view should show:

- Booking number
- Amenity
- Status
- Date and time
- Flat
- Requester
- Guest count
- Purpose
- Notes
- Admin decision reason, if rejected or cancelled by admin
- Timeline of status changes

Allowed resident actions:

- Cancel booking when status is `REQUESTED` or `APPROVED` and cancellation window allows.
- Add a note/comment in a future phase.
- Download approval receipt or pass in a future phase.

### Admin Requirements

#### Admin Navigation

Add admin navigation entry:

```text
Amenity Bookings
```

Recommended route:

```text
/admin/amenity-bookings
```

Recommended permission:

```text
amenity-bookings.manage
```

Admins should always have access. Managers should need the permission.

#### Admin Booking Queue

Admin list should support:

- Table view
- Calendar/day view in a later phase
- Date range filter
- Amenity filter
- Status filter
- Flat/block filter
- Search by booking number, requester, phone, or flat

Visible columns:

- Booking number
- Amenity
- Flat
- Requester
- Date
- Start time
- End time
- Guest count
- Status
- Submitted at
- Decision owner

Primary actions:

- View
- Approve
- Reject
- Cancel
- Mark completed

#### Admin Booking Detail

Admin detail should show:

- Complete resident and flat details
- Booking fields
- Conflict check result
- Status timeline
- Internal notes
- Notification delivery state in a future phase
- Related charge/payment records in a future phase

Admin actions:

- Approve
- Reject with reason
- Cancel with reason
- Update internal notes
- Mark checked in in a future phase
- Mark completed in a future phase
- Create service request for setup/cleanup in a future phase

#### Amenity Management

Admins need a way to configure bookable amenities.

Recommended route:

```text
/admin/amenities
```

Fields:

- Name
- Code
- Description
- Capacity
- Location
- Is active
- Is bookable
- Requires approval
- Operating hours
- Minimum duration
- Maximum duration
- Slot interval
- Minimum lead time
- Maximum advance booking days
- Cancellation cutoff
- Rules text
- Charge configuration placeholder

Initial seed can include:

- Clubhouse
- Community Hall

## Booking Status Model

Recommended enum:

```text
REQUESTED
APPROVED
REJECTED
CANCELLED
COMPLETED
NO_SHOW
```

Optional future statuses:

```text
PAYMENT_PENDING
PAYMENT_CONFIRMED
CHECKED_IN
EXPIRED
```

Status rules:

- New resident bookings start as `REQUESTED`.
- Only admins/managers with permission can approve or reject.
- Residents can cancel their own `REQUESTED` or `APPROVED` bookings if rules allow.
- Approved bookings block overlapping approvals for the same amenity.
- Cancelled, rejected, completed, and no-show bookings should not block future slots.

## Data Model

### Enums

```sql
amenity_booking_status:
  REQUESTED
  APPROVED
  REJECTED
  CANCELLED
  COMPLETED
  NO_SHOW

amenity_booking_event_type:
  CREATED
  UPDATED
  APPROVED
  REJECTED
  CANCELLED
  COMPLETED
  NO_SHOW
  INTERNAL_NOTE
```

### `amenities`

Stores facilities that can be booked.

Fields:

- `id uuid primary key`
- `society_id uuid not null references society_profile(id)`
- `code text not null`
- `name text not null`
- `description text`
- `location text`
- `capacity integer`
- `is_active boolean not null default true`
- `is_bookable boolean not null default true`
- `requires_approval boolean not null default true`
- `operating_hours jsonb not null default '{}'`
- `booking_rules jsonb not null default '{}'`
- `rules_text text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- Unique `(society_id, code)`
- Unique `(society_id, name)`
- Capacity must be positive when present.

Example `booking_rules`:

```json
{
  "minDurationMinutes": 60,
  "maxDurationMinutes": 240,
  "slotIntervalMinutes": 30,
  "minimumLeadHours": 24,
  "maximumAdvanceDays": 60,
  "cancellationCutoffHours": 24
}
```

Example `operating_hours`:

```json
{
  "monday": [{ "start": "09:00", "end": "22:00" }],
  "tuesday": [{ "start": "09:00", "end": "22:00" }],
  "wednesday": [{ "start": "09:00", "end": "22:00" }],
  "thursday": [{ "start": "09:00", "end": "22:00" }],
  "friday": [{ "start": "09:00", "end": "22:00" }],
  "saturday": [{ "start": "09:00", "end": "23:00" }],
  "sunday": [{ "start": "09:00", "end": "23:00" }]
}
```

### `amenity_bookings`

Stores booking requests and approved reservations.

Fields:

- `id uuid primary key`
- `society_id uuid not null references society_profile(id)`
- `booking_number text not null unique`
- `amenity_id uuid not null references amenities(id)`
- `requester_user_id uuid not null references users(id)`
- `flat_id uuid not null references flats(id)`
- `status amenity_booking_status not null default 'REQUESTED'`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `guest_count integer`
- `purpose text not null`
- `resident_notes text`
- `admin_notes text`
- `decision_reason text`
- `approved_by_user_id uuid references users(id)`
- `approved_at timestamptz`
- `rejected_by_user_id uuid references users(id)`
- `rejected_at timestamptz`
- `cancelled_by_user_id uuid references users(id)`
- `cancelled_at timestamptz`
- `completed_by_user_id uuid references users(id)`
- `completed_at timestamptz`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `ends_at > starts_at`
- `guest_count` must be positive when present.
- Flat must belong to the same society.
- Amenity must belong to the same society.

Indexes:

- `(society_id, starts_at desc)`
- `(society_id, status, starts_at desc)`
- `(amenity_id, starts_at, ends_at)`
- `(flat_id, starts_at desc)`
- `(requester_user_id, starts_at desc)`

### Conflict Prevention

Use a database-level guard so two approved bookings cannot overlap for the same amenity.

Recommended PostgreSQL approach:

```sql
create extension if not exists btree_gist;

alter table amenity_bookings
  add constraint amenity_bookings_no_approved_overlap
  exclude using gist (
    amenity_id with =,
    tstzrange(starts_at, ends_at, '[)') with &&
  )
  where (status = 'APPROVED');
```

If `btree_gist` cannot be used in the target environment, fallback should be a transaction with row-level locking or an advisory lock around approval. The database must still be the final conflict authority, not only the frontend.

### `amenity_booking_events`

Stores booking timeline and audit events.

Fields:

- `id uuid primary key`
- `booking_id uuid not null references amenity_bookings(id) on delete cascade`
- `event_type amenity_booking_event_type not null`
- `actor_user_id uuid references users(id) on delete set null`
- `from_status amenity_booking_status`
- `to_status amenity_booking_status`
- `visibility text not null default 'RESIDENT_VISIBLE'`
- `message text`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`

Indexes:

- `(booking_id, created_at asc)`
- `(actor_user_id, created_at desc)`

### `amenity_blackouts`

Stores blocked time windows for maintenance, society events, holidays, or admin holds.

Fields:

- `id uuid primary key`
- `society_id uuid not null references society_profile(id)`
- `amenity_id uuid not null references amenities(id)`
- `title text not null`
- `starts_at timestamptz not null`
- `ends_at timestamptz not null`
- `reason text`
- `created_by_user_id uuid references users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints:

- `ends_at > starts_at`

Indexes:

- `(society_id, starts_at desc)`
- `(amenity_id, starts_at, ends_at)`

Blackouts should be included in availability checks. They can use a similar overlap constraint if blackouts must not overlap each other.

## API Design

### Resident APIs

#### List Amenities

```text
GET /api/my/amenities
```

Returns active, bookable amenities for the resident society.

#### Check Availability

```text
GET /api/my/amenities/:id/availability?date=2026-07-10
```

Returns:

- Amenity operating hours
- Booked approved windows
- Blackout windows
- Available slot suggestions

#### List My Bookings

```text
GET /api/my/amenity-bookings
```

Query filters:

- `status`
- `amenityId`
- `dateFrom`
- `dateTo`
- `page`
- `pageSize`

#### Create Booking

```text
POST /api/my/amenity-bookings
```

Body:

```json
{
  "amenityId": "uuid",
  "flatId": "uuid",
  "startsAt": "2026-07-10T13:30:00+05:30",
  "endsAt": "2026-07-10T16:30:00+05:30",
  "guestCount": 25,
  "purpose": "Family function",
  "residentNotes": "Need basic seating arrangement.",
  "rulesAccepted": true
}
```

#### Get Booking Detail

```text
GET /api/my/amenity-bookings/:id
```

Residents can only access bookings tied to their accessible flats.

#### Cancel Booking

```text
POST /api/my/amenity-bookings/:id/cancel
```

Body:

```json
{
  "reason": "Plan changed"
}
```

### Admin APIs

#### List Amenities

```text
GET /api/admin/amenities
```

#### Create Amenity

```text
POST /api/admin/amenities
```

#### Update Amenity

```text
PATCH /api/admin/amenities/:id
```

#### List Bookings

```text
GET /api/admin/amenity-bookings
```

Query filters:

- `status`
- `amenityId`
- `flatId`
- `blockId`
- `search`
- `dateFrom`
- `dateTo`
- `page`
- `pageSize`

#### Get Booking Detail

```text
GET /api/admin/amenity-bookings/:id
```

#### Approve Booking

```text
POST /api/admin/amenity-bookings/:id/approve
```

Body:

```json
{
  "adminNotes": "Approved. Resident must follow clubhouse timing rules."
}
```

#### Reject Booking

```text
POST /api/admin/amenity-bookings/:id/reject
```

Body:

```json
{
  "reason": "Clubhouse already reserved for society maintenance."
}
```

#### Cancel Booking

```text
POST /api/admin/amenity-bookings/:id/cancel
```

Body:

```json
{
  "reason": "Emergency maintenance required."
}
```

#### Complete Booking

```text
POST /api/admin/amenity-bookings/:id/complete
```

## Authorization

### Resident Authorization

Residents can:

- View active bookable amenities.
- View availability for their society.
- Create bookings only for flats they can access.
- View bookings linked to flats they can access.
- Cancel their own bookings if rules allow.

Residents cannot:

- Approve bookings.
- View other residents' booking details.
- Edit amenity rules.
- See internal admin notes.

### Admin Authorization

Admins can:

- Manage amenities.
- View all bookings for their society.
- Approve, reject, cancel, and complete bookings.
- Create blackouts.
- Add internal notes.

Managers can do the same only if assigned:

```text
amenity-bookings.manage
```

Recommended new permissions:

```text
amenity-bookings.view
amenity-bookings.manage
amenities.manage
```

MVP can simplify this to:

```text
amenity-bookings.manage
```

## Notifications

Use the existing notification infrastructure.

Recommended event keys:

- `amenity_booking.created`
- `amenity_booking.approved`
- `amenity_booking.rejected`
- `amenity_booking.cancelled`
- `amenity_booking.completed`

Resident notifications:

- Booking submitted
- Booking approved
- Booking rejected
- Booking cancelled by admin
- Reminder before approved booking in a future phase

Admin notifications:

- New booking request submitted
- Resident cancelled approved booking
- Conflict or approval failure in a future phase

Payload should include:

- Booking ID
- Booking number
- Amenity name
- Flat label
- Status
- Date and time
- Deep link URL

## Billing And Payments

Recommendation: do not connect to existing dues/payments in Phase 1.

Reason:

- Booking approval and conflict prevention are the core product risk.
- Existing dues and payments are already important flows.
- Premature integration could create accounting ambiguity around deposits, refunds, cancellations, waivers, and partial payments.

Phase 2 options:

### Manual Charge Tracking

Add fields to booking:

- `charge_amount`
- `deposit_amount`
- `payment_status`
- `payment_reference`

Admin records payment manually.

### Finance Transaction Integration

Create a finance income transaction after approval.

Useful when clubhouse charges should appear in finance reports, but not necessarily as resident dues.

### Resident Due Integration

Create a resident payable due for the booking charge.

This is the most integrated option and should come later because it needs rules for:

- Due date
- Pay before approval or after approval
- Cancellation refunds
- Deposit refunds
- Waivers
- Receipt wording
- Report treatment

## UI Requirements

### Resident UI

Booking pages should be clear and compact. This is an operational workflow, not a marketing page.

Recommended screens:

- `/my/amenity-bookings`
- `/my/amenity-bookings/new`
- `/my/amenity-bookings/:id`

#### Create Screen Layout

Sections:

- Amenity
- Date and time
- Flat and requester
- Purpose and guest count
- Rules confirmation

Use:

- Select for amenity.
- Date picker for date.
- Time inputs or slot selector for start/end.
- Number input for guest count.
- Textarea for purpose/notes.
- Checkbox for rules acceptance.

#### Booking Status Display

Use status tags:

- Requested
- Approved
- Rejected
- Cancelled
- Completed
- No show

#### Availability Display

MVP:

- Show unavailable windows for selected date.
- Block submit if selected time overlaps an approved booking or blackout.

Later:

- Full day timeline.
- Suggested available slots.
- Calendar month indicators.

### Admin UI

Recommended screens:

- `/admin/amenity-bookings`
- `/admin/amenity-bookings/:id`
- `/admin/amenities`

#### Admin Booking List

Should prioritize scanning and action:

- Dense table
- Filters at top
- Status tags
- Quick approve/reject action where safe
- Detail page for full review

#### Admin Booking Calendar

Recommended for Phase 2:

- Day/week view by amenity.
- Approved bookings and blackouts visible.
- Requested bookings visible as pending.
- Click slot to create blackout.

## Reports

MVP admin reports can be simple filters/export from the booking list.

Useful report fields:

- Booking number
- Amenity
- Flat
- Requester
- Status
- Date
- Start time
- End time
- Guest count
- Purpose
- Created at
- Approved at
- Cancelled at
- Decision reason

Future metrics:

- Amenity utilization
- Peak booking days
- Approval turnaround time
- Cancellation rate
- Revenue by amenity

## Audit And History

Every booking status change must create an `amenity_booking_events` row.

Events should capture:

- Actor
- From status
- To status
- Message or reason
- Metadata
- Timestamp

Admin decisions should never overwrite the historical reason. Later updates can add new events.

## Migration And Compatibility Plan

This feature should be introduced with a new migration that only adds:

- New enums
- New tables
- New indexes
- New permissions
- New seed records for clubhouse amenities

Do not alter these existing tables in Phase 1:

- `service_requests`
- `maintenance_dues`
- `payments`
- `journal_entries`
- `qr_access_tokens`
- `notices`

Safe optional changes:

- Add new staff permission strings.
- Add new sidebar links.
- Add new notification template records.

Existing service-request behavior should remain unchanged.

## Rollout Plan

### Phase 1: Core Booking

Deliver:

- Tables and migrations.
- Amenity seed data for Clubhouse.
- Resident booking create/list/detail/cancel.
- Admin booking list/detail/approve/reject/cancel.
- Conflict prevention at approval.
- Blackout support.
- Basic notifications.

### Phase 2: Operations

Deliver:

- Admin calendar view.
- Booking reminders.
- Setup/cleanup notes.
- Service-request link for setup tasks.
- Export CSV.
- Security/service staff read-only view.

### Phase 3: Charges

Deliver one selected charge path:

- Manual charge tracking, or
- Finance transaction integration, or
- Resident due/payment integration.

Recommendation: start with manual charge tracking if society operations need money tracking quickly.

### Phase 4: Advanced Rules

Deliver:

- Recurring blocks.
- Per-day operating hours UI.
- Amenity-specific approval policy.
- Max bookings per flat per month.
- Cooldown after cancellation.
- Deposit refund tracking.

## Acceptance Criteria

### Resident Booking

- Resident can view active amenities.
- Resident can create a booking for an accessible flat.
- Resident cannot create a booking for another resident's flat.
- Resident cannot submit end time before start time.
- Resident cannot submit outside amenity operating hours.
- Resident cannot submit guest count above capacity.
- Resident sees their booking after submission.
- Resident can cancel an eligible booking.

### Admin Booking

- Admin can view all bookings for their society.
- Admin can approve a requested booking.
- Admin can reject a requested booking with reason.
- Admin can cancel an approved booking with reason.
- Admin can create a blackout window.
- Admin sees status history.

### Conflict Prevention

- Two approved bookings for the same amenity cannot overlap.
- An approved booking cannot overlap an active blackout.
- Race condition approval attempts cannot create duplicate approved slots.
- Rejected and cancelled bookings do not block availability.

### Notifications

- Admin receives notification when a resident submits a booking.
- Resident receives notification when booking is approved.
- Resident receives notification when booking is rejected.
- Resident receives notification when booking is cancelled by admin.

### Compatibility

- Existing service requests still create, list, assign, comment, and update status.
- Existing dues pages still load.
- Existing payment APIs are unchanged.
- Existing admin service-request pages are unchanged.
- Existing resident navigation remains valid.

## Test Plan

### Unit/Utility Tests

- Booking validation.
- Operating hours validation.
- Duration validation.
- Lead time validation.
- Cancellation window validation.
- Conflict detection.

### API Tests

- Resident creates booking.
- Resident cannot create for inaccessible flat.
- Admin approves booking.
- Admin approval fails on conflict.
- Admin rejects booking.
- Resident cancels booking.
- Blackout blocks availability.

### Database Tests

- Overlap constraint prevents approved conflicts.
- Indexes support list filters.
- Foreign keys enforce society ownership.
- Event rows are created for each status transition.

### Regression Tests

- Service request create flow.
- Service request admin list/detail.
- Resident dues list.
- Admin payments list.
- Notification summary.

## Risks And Mitigations

### Risk: Double Booking

Mitigation:

- Use database-level overlap constraint for approved bookings.
- Recheck conflicts inside approval transaction.

### Risk: Breaking Existing Features

Mitigation:

- Add new tables and routes.
- Avoid changing existing service-request, dues, and payment schema in Phase 1.
- Add regression checks for current flows.

### Risk: Billing Complexity

Mitigation:

- Keep charges out of Phase 1.
- Decide charge policy after booking workflow is stable.

### Risk: Timezone Confusion

Mitigation:

- Store `starts_at` and `ends_at` as `timestamptz`.
- Render using society timezone or app timezone.
- Show date and time consistently in resident and admin views.

### Risk: Admin Overload

Mitigation:

- Provide filters, status tags, and quick actions.
- Notify only relevant admins/managers.
- Add calendar view in Phase 2.

## Open Questions

- Which amenities should ship first: Clubhouse only, or Clubhouse plus Community Hall?
- Should residents be allowed to request multiple slots in one request?
- What are the society operating hours for clubhouse bookings?
- What is the minimum and maximum booking duration?
- How far in advance can residents book?
- Should approval be mandatory for every booking?
- Should rejected/cancelled reasons be visible to residents?
- Should residents be able to cancel approved bookings without admin approval?
- Are booking charges required from day one?
- If charges are required, should payment happen before approval or after approval?
- Should guards/service staff see approved bookings?

## Recommended MVP Decision Set

For the first version, use these defaults unless society policy says otherwise:

- Amenity: Clubhouse
- Status flow: `REQUESTED` to `APPROVED`, `REJECTED`, or `CANCELLED`
- Approval: always required
- Conflict prevention: database exclusion constraint for approved bookings
- Charges: not included in Phase 1
- Resident cancellation: allowed until 24 hours before start time
- Minimum duration: 1 hour
- Maximum duration: 4 hours
- Slot interval: 30 minutes
- Minimum lead time: 24 hours
- Maximum advance booking: 60 days
- Notifications: in-app and email where configured

## Final Recommendation

Proceed with a separate Proper Booking Feature as an additive module. The first release should focus on booking clarity, admin approval, and conflict prevention. Keep service requests, dues, and payments untouched until the booking workflow is stable in production.

This gives residents a real clubhouse booking experience while protecting the current operational and finance workflows.
