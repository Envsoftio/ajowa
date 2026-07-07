# PRD: Resident Ads Platform

Date: 2026-07-03
Owner: AJOWA product/engineering
Status: Draft

## Summary

AJOWA needs a resident-facing ads system for promoting own products and services on resident pages, with reliable tracking of who saw and clicked each ad. Campaign creation and management must stay separate from the current admin dashboard. The existing admin UI must not show ads menus, ads widgets, ads settings, or ads reports.

The first version should provide:

- Resident ad display UI inside `/my/*` pages.
- API-only campaign and creative management.
- Click and impression tracking tied to resident users and, where available, flats.
- Reporting APIs for campaign performance.
- A path for a future standalone Ads Console that consumes the same management APIs without being part of the main admin dashboard.

## Goals

- Show active banner ads to residents in selected app slots.
- Track impressions, clicks, and dismissals by campaign, creative, resident user, flat, page, and slot.
- Manage campaigns, creatives, targeting, and status entirely through protected management APIs.
- Keep the existing admin dashboard unchanged.
- Support targeting by society, all residents, blocks, flats, owners, tenants, billing contacts, and specific users.
- Provide stats APIs for CTR, unique viewers, unique clickers, and per-user click history.

## Non-Goals

- No ads section in the current admin sidebar.
- No dashboard card, widget, or settings entry in the current admin UI.
- No third-party ad network integration in the first version.
- No automated payment/billing for advertisers.
- No public self-service advertiser portal.
- No complex auction, bidding, frequency optimization, or ML-based ranking.

## Users

- Resident: sees relevant ads on resident pages and may click them.
- Ads operator: manages campaigns through APIs or a future standalone console.
- System admin/developer: provisions API credentials and monitors event health.

## Product Constraints

- Ads management UI must be outside the main AJOWA admin dashboard.
- Resident-facing ad UI can appear inside the resident app because residents are the intended audience.
- Ad destinations are always external product URLs, for example `https://sunoo.app` or `https://proctorplus.io`.
- Relative AJOWA routes such as `/my/dues` must not be accepted as ad destinations in v1.
- Management APIs must require a dedicated API token or similarly isolated authorization mechanism.
- Resident event APIs must use the resident's authenticated app session.
- Event logging must be append-only; do not update old event rows except for exceptional cleanup jobs.
- The system must avoid storing raw sensitive request data unless needed. Prefer hashed IP or coarse metadata.

## Recommended Architecture

The feature should be split into three surfaces:

1. Resident delivery API

   Used by logged-in residents to fetch eligible ads.

2. Resident tracking API

   Used by resident pages to log impressions, clicks, and dismissals.

3. Ads management API

   Used by scripts, Postman, internal tools, or a future standalone Ads Console. This API is not connected to the existing admin dashboard.

## Resident UI Requirements

### Placement

The first release should support reusable ad slots:

- `resident-dues-top`
- `resident-dashboard-top`
- `resident-notices-inline`
- `resident-service-requests-top`

Initial implementation can start with one slot, preferably `resident-dues-top`, because `/my/dues` is the resident landing route.

### Component

Create a reusable resident component, for example:

```text
components/ads/ResidentAdBanner.vue
```

Behavior:

- Fetch eligible ads for the current slot.
- Render at most one ad per slot in v1.
- Support image, title, description, CTA label, and optional sponsor/product label.
- Track impression when the ad becomes visible, not merely when data is fetched.
- Track click before opening the external destination.
- Support optional dismiss action if campaign/creative allows dismissal.
- Hide itself if no eligible active ad is returned.

### UI Rules

- The banner must fit naturally inside resident pages and not look like an admin control.
- The banner must not block core workflows such as bill payment, notice reading, or service request creation.
- Images must have stable dimensions to avoid layout shift.
- Ad links must open safely with `target="_blank"` and `rel="noopener noreferrer"` because all ad destinations are external.
- When AJOWA is running as an installed PWA, ad clicks should open the external destination in the browser/out-of-app context, not replace the current PWA view.
- The ad component must not use `navigateTo`, `RouterLink`, or same-window navigation for ad clicks.
- The UI should identify promoted content subtly, for example with a small "Sponsored" or "Promoted" label.

### Creative Data Requirements

V1 ads should be image-led external product promotions. Text-only ads are not preferred for resident pages.

Required creative data:

- `slotKey`: one of the supported resident ad slots.
- `title`: short product or offer title.
- `body`: one short supporting line.
- `ctaLabel`: short call to action such as "Explore", "Visit site", or "Learn more".
- `imageUrl`: primary banner image URL. This should be an absolute `https://` URL.
- `destinationUrl`: external product URL. This must be an absolute `https://` URL.

Recommended image rules:

- Use `WebP`, `JPG`, or `PNG`.
- Preferred desktop banner size: `1200 x 480`.
- Preferred mobile-safe crop: keep product logo, product name, and main visual centered.
- Keep important text outside the image where possible; use `title`, `body`, and `ctaLabel` for readable copy.
- Keep image file size ideally under `300 KB`.
- Provide meaningful alt text through creative metadata.

Optional creative metadata:

```json
{
  "sponsorLabel": "Promoted",
  "imageAlt": "Sunoo app promotional banner",
  "mobileImageUrl": "https://sunoo.app/ads/sunoo-mobile.webp",
  "desktopImageUrl": "https://sunoo.app/ads/sunoo-desktop.webp"
}
```

## Management UI Direction

No management UI should be added to the current app dashboard.

Future standalone Ads Console can be:

- A separate frontend app.
- A private internal page outside the normal admin navigation.
- A Retool/Postman-like workflow.
- A CLI/script consuming the management APIs.

The management API should be complete enough that a separate UI can be built later without changing the resident delivery system.

Suggested future Ads Console screens:

- Campaign list
- Campaign create/edit
- Creative create/edit
- Targeting editor
- Campaign stats
- Event export

## Data Model

### Enums

```sql
ad_campaign_status:
  DRAFT
  ACTIVE
  PAUSED
  ARCHIVED

ad_event_type:
  IMPRESSION
  CLICK
  DISMISS
```

### `ad_campaigns`

Stores campaign-level configuration.

Fields:

- `id uuid primary key`
- `society_id uuid not null references society_profile(id)`
- `name text not null`
- `description text`
- `status ad_campaign_status not null default 'DRAFT'`
- `starts_at timestamptz`
- `ends_at timestamptz`
- `priority integer not null default 0`
- `targeting jsonb not null default '{"scope":"ALL_ACTIVE_RESIDENTS"}'`
- `frequency_cap jsonb not null default '{}'`
- `created_by_user_id uuid references users(id)`
- `updated_by_user_id uuid references users(id)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Targeting should reuse the existing notification audience vocabulary where possible:

- `ALL_ACTIVE_RESIDENTS`
- `BLOCKS`
- `FLATS`
- `USERS`
- `OWNERS`
- `OWNER_OF_FLAT`
- `TENANTS`
- `DEFAULTERS`
- `BILLING_CONTACTS`

### `ad_creatives`

Stores the actual ad content.

Fields:

- `id uuid primary key`
- `campaign_id uuid not null references ad_campaigns(id)`
- `society_id uuid not null references society_profile(id)`
- `slot_key text not null`
- `title text not null`
- `body text`
- `cta_label text`
- `image_url text not null`
- `destination_url text not null`
- `display_order integer not null default 0`
- `is_active boolean not null default true`
- `allow_dismiss boolean not null default false`
- `metadata jsonb not null default '{}'`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

`destination_url` rules:

- Must be an absolute external `https://` URL in v1. `http://` may be allowed only for local development.
- Must not be a relative path such as `/my/dues`.
- Must not use unsafe schemes such as `javascript:`, `data:`, `file:`, or custom app schemes.
- Should be allowlist-capable for owned products such as `sunoo.app` and `proctorplus.io`.

`image_url` rules:

- Must be an absolute `https://` URL in v1. `http://` may be allowed only for local development.
- Should point to a public image asset optimized for web delivery.
- The delivery API can prefer `metadata.mobileImageUrl` or `metadata.desktopImageUrl` when the client supplies viewport context in a later phase.

### `ad_events`

Append-only event log.

Fields:

- `id uuid primary key`
- `society_id uuid not null references society_profile(id)`
- `campaign_id uuid not null references ad_campaigns(id)`
- `creative_id uuid not null references ad_creatives(id)`
- `user_id uuid references users(id)`
- `flat_id uuid references flats(id)`
- `event_type ad_event_type not null`
- `slot_key text not null`
- `page_path text`
- `occurred_at timestamptz not null default now()`
- `request_id text`
- `session_key text`
- `ip_hash text`
- `user_agent text`
- `metadata jsonb not null default '{}'`

Indexes:

- `(society_id, occurred_at desc)`
- `(campaign_id, occurred_at desc)`
- `(creative_id, event_type, occurred_at desc)`
- `(user_id, event_type, occurred_at desc)`
- `(flat_id, event_type, occurred_at desc)`

### Optional `ad_api_keys`

Use only if management APIs are not authenticated through current app sessions.

Fields:

- `id uuid primary key`
- `society_id uuid not null references society_profile(id)`
- `name text not null`
- `key_hash text not null unique`
- `scopes text[] not null default array['ads.manage']`
- `last_used_at timestamptz`
- `expires_at timestamptz`
- `revoked_at timestamptz`
- `created_at timestamptz not null default now()`

Raw API tokens must never be stored after creation.

## API Design

### Resident Delivery API

```text
GET /api/my/ads?slot=resident-dues-top
```

Auth:

- Logged-in resident session required.

Response:

```json
{
  "ok": true,
  "data": {
    "items": [
      {
        "campaignId": "uuid",
        "creativeId": "uuid",
        "slotKey": "resident-dues-top",
        "title": "Try Sunoo",
        "body": "Smart tools for everyday business workflows.",
        "ctaLabel": "Explore",
        "imageUrl": "https://sunoo.app/ads/sunoo-banner.webp",
        "imageAlt": "Sunoo app promotional banner",
        "sponsorLabel": "Promoted",
        "destinationUrl": "https://sunoo.app",
        "openMode": "external-browser",
        "allowDismiss": false
      }
    ]
  }
}
```

Rules:

- Return only active campaigns and active creatives.
- Respect campaign schedule.
- Respect society scope.
- Respect targeting.
- Prefer highest priority, then display order, then newest active campaign.
- Limit response to one ad per slot for v1.
- Return only absolute external destination URLs.
- Return only creatives with a valid image URL.

### Resident Event API

```text
POST /api/my/ads/events
```

Auth:

- Logged-in resident session required.

Request:

```json
{
  "creativeId": "uuid",
  "eventType": "IMPRESSION",
  "slotKey": "resident-dues-top",
  "pagePath": "/my/dues",
  "flatId": "uuid-or-null",
  "metadata": {}
}
```

Rules:

- Validate creative belongs to resident society.
- Validate campaign is active and currently deliverable.
- Validate resident is eligible for the campaign target.
- Insert event row.
- Do not expose other residents' data.

### Click Tracking And External Open Behavior

Preferred resident click flow:

1. User taps or clicks the ad.
2. Client logs a `CLICK` event through `POST /api/my/ads/events`. Prefer `navigator.sendBeacon` where available, with `fetch(..., { keepalive: true })` as a fallback.
3. Client opens the ad's `destinationUrl` directly with `window.open(destinationUrl, '_blank', 'noopener,noreferrer')`.
4. The current AJOWA PWA screen remains open.

This direct external-open flow is preferred over navigating to an internal tracking URL, because an installed PWA may treat same-origin URLs as part of the app before the redirect completes.

### Optional Click Redirect API

The redirect API can exist as a non-PWA fallback, but it should not be the primary resident PWA click path.

```text
GET /api/my/ads/:creativeId/click?slot=resident-dues-top&pagePath=/my/dues
```

Auth:

- Logged-in resident session required.

Rules:

- Validate creative and eligibility.
- Insert `CLICK` event.
- Redirect to the creative destination URL.
- Redirect only to valid absolute external `https://` URLs.
- Reject relative paths and unsafe URL schemes.

This endpoint is less preferred for installed PWA clicks because the same-origin tracking URL may briefly open inside AJOWA before the browser handles the external destination.

## Management API

Base path:

```text
/api/ads-admin
```

This path intentionally does not live under the visible admin dashboard UI.

### Authentication

Preferred v1:

- `Authorization: Bearer <ads-management-token>`
- Token is hashed and checked against `ad_api_keys`.
- Token is scoped to one society.
- Required scope: `ads.manage`.

Optional fallback:

- Allow logged-in `ADMIN` only, but do not expose any UI route.

### Campaigns

```text
GET    /api/ads-admin/campaigns
POST   /api/ads-admin/campaigns
GET    /api/ads-admin/campaigns/:id
PATCH  /api/ads-admin/campaigns/:id
DELETE /api/ads-admin/campaigns/:id
```

Delete behavior:

- Prefer soft delete by setting status to `ARCHIVED`.
- Do not physically delete campaigns that have events.

Create request:

```json
{
  "name": "Sunoo App Promo",
  "description": "Promote Sunoo to residents",
  "status": "DRAFT",
  "startsAt": "2026-07-03T00:00:00.000Z",
  "endsAt": "2026-08-03T00:00:00.000Z",
  "priority": 10,
  "targeting": {
    "scope": "ALL_ACTIVE_RESIDENTS"
  }
}
```

### Creatives

```text
GET    /api/ads-admin/campaigns/:campaignId/creatives
POST   /api/ads-admin/campaigns/:campaignId/creatives
GET    /api/ads-admin/creatives/:id
PATCH  /api/ads-admin/creatives/:id
DELETE /api/ads-admin/creatives/:id
```

Create request:

```json
{
  "slotKey": "resident-dues-top",
  "title": "Try Sunoo",
  "body": "Smart tools for everyday business workflows.",
  "ctaLabel": "Explore",
  "imageUrl": "https://sunoo.app/ads/sunoo-banner.webp",
  "destinationUrl": "https://sunoo.app",
  "displayOrder": 1,
  "isActive": true,
  "allowDismiss": false,
  "metadata": {
    "sponsorLabel": "Promoted",
    "imageAlt": "Sunoo app promotional banner",
    "mobileImageUrl": "https://sunoo.app/ads/sunoo-mobile.webp",
    "desktopImageUrl": "https://sunoo.app/ads/sunoo-desktop.webp"
  }
}
```

### Stats

```text
GET /api/ads-admin/campaigns/:id/stats?from=2026-07-01&to=2026-07-31
GET /api/ads-admin/creatives/:id/stats?from=2026-07-01&to=2026-07-31
```

Response:

```json
{
  "ok": true,
  "data": {
    "campaignId": "uuid",
    "impressions": 1200,
    "uniqueViewers": 650,
    "clicks": 80,
    "uniqueClickers": 58,
    "dismissals": 12,
    "ctr": 0.0667,
    "bySlot": [
      {
        "slotKey": "resident-dues-top",
        "impressions": 1200,
        "clicks": 80,
        "ctr": 0.0667
      }
    ]
  }
}
```

### Events

```text
GET /api/ads-admin/events
```

Filters:

- `campaignId`
- `creativeId`
- `eventType`
- `userId`
- `flatId`
- `slotKey`
- `from`
- `to`
- `page`
- `pageSize`

Use this for "who clicked my ad".

Response item:

```json
{
  "eventId": "uuid",
  "eventType": "CLICK",
  "campaignId": "uuid",
  "creativeId": "uuid",
  "userId": "uuid",
  "residentName": "Resident Name",
  "flatId": "uuid",
  "flatLabel": "A 101",
  "slotKey": "resident-dues-top",
  "pagePath": "/my/dues",
  "occurredAt": "2026-07-03T10:10:00.000Z"
}
```

## Security And Privacy

- Enable RLS on all public ad tables if they are in the exposed `public` schema.
- Prefer server APIs for all reads/writes; do not expose direct table access to browser clients.
- Management APIs must never trust a `societyId` supplied by the caller when using an API key. Society must come from the validated token.
- Resident APIs must derive `society_id` and `user_id` from the authenticated session.
- If `flatId` is supplied in event payload, verify it belongs to the resident's active flat access.
- Store API key hashes only.
- Avoid storing raw IP addresses. If fraud/rate analysis is needed, store a salted hash.
- Redact API tokens from logs.
- Rate limit event endpoints to prevent abuse.

## RLS Direction

Even if server APIs use direct database access, ad tables should have RLS enabled as defense in depth.

Suggested policy posture:

- `ad_campaigns`: no direct anon/authenticated table access.
- `ad_creatives`: no direct anon/authenticated table access.
- `ad_events`: no direct anon/authenticated table access.
- `ad_api_keys`: no direct anon/authenticated table access.

Server routes remain the intended access layer.

## Analytics Requirements

The system must support:

- Total impressions per campaign/creative.
- Unique viewers per campaign/creative.
- Total clicks per campaign/creative.
- Unique clickers per campaign/creative.
- CTR = clicks / impressions.
- Click list with resident name and flat label.
- Events grouped by slot.
- Events grouped by day.
- Events filtered by date range.

Future analytics:

- Frequency cap reporting.
- Conversion events.
- Export CSV.
- Per-block performance.

## Targeting Requirements

V1 targeting:

```json
{ "scope": "ALL_ACTIVE_RESIDENTS" }
```

```json
{ "scope": "BLOCKS", "blockIds": ["uuid"] }
```

```json
{ "scope": "FLATS", "flatIds": ["uuid"] }
```

```json
{ "scope": "USERS", "userIds": ["uuid"] }
```

```json
{ "scope": "OWNERS" }
```

```json
{ "scope": "TENANTS" }
```

```json
{ "scope": "BILLING_CONTACTS" }
```

V2 targeting:

- Defaulters.
- Recently paid users.
- Residents with open service requests.
- Residents who have not clicked a campaign.
- Page-specific targeting.

## Delivery Ranking

When multiple ads match the same slot:

1. Higher campaign priority wins.
2. Lower creative display order wins.
3. Newer campaign wins.
4. Stable fallback by creative id.

V1 should return a single ad per slot. V2 can support rotation.

## Event Deduplication

Impressions can be noisy, so event dedupe should be considered:

- Client should send one impression per creative per page view.
- Server may optionally dedupe impressions by `user_id + creative_id + slot_key + session_key` within a short window.
- Clicks should not be aggressively deduped because repeated clicks are useful behavior, but reporting should include unique clickers.

## Acceptance Criteria

- Resident pages can render an ad without any admin dashboard changes.
- A campaign can be created, activated, paused, and archived through API calls.
- A creative can be created and attached to a campaign through API calls.
- Resident delivery API returns only eligible active ads.
- Impression events are logged when ads are visible.
- Click events are logged and tied to the resident user.
- Management stats API returns impressions, clicks, unique viewers, unique clickers, and CTR.
- Management events API can answer which residents clicked which ads.
- Existing admin dashboard navigation and pages remain unchanged.

## Implementation Phases

### Phase 1: Foundation

- Add database tables and indexes.
- Add management API token support.
- Add campaign and creative CRUD APIs.
- Add resident delivery API.
- Add PWA-safe click tracking and external browser open behavior.
- Add event logging API.
- Add one resident banner slot.
- Add stats API.

### Phase 2: Standalone Management Surface

- Build a separate Ads Console or internal tool using `/api/ads-admin/*`.
- Add image upload support through Supabase Storage if needed.
- Add CSV export.
- Add more targeting filters.

### Phase 3: Optimization

- Add frequency caps.
- Add rotation.
- Add conversion tracking.
- Add scheduled campaign automation.
- Add event retention/archive jobs.

## Open Questions

- Should the first management auth be API token only, or should logged-in `ADMIN` also be allowed?
- Should ad images be external URLs in v1, or uploaded to Supabase Storage from day one?
- Do we need resident opt-out or dismiss persistence in v1?
- What is the first resident slot to ship: dues page, dashboard, notices, or service requests?
