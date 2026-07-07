# Resident Ads Platform API

This feature is API-first. Do not add ads navigation, cards, reports, or settings to the existing AJOWA admin dashboard.

## Apply Schema

Apply the migration:

```bash
npx supabase migration up --local
```

For a linked remote project, use the repo's normal Supabase deploy process.

## Create A Management Token

Create one API token for a society:

```bash
npm run ads:key
```

Optional environment variables:

```bash
ADS_API_KEY_SOCIETY_CODE=AJOWA
ADS_API_KEY_NAME="Ads operator"
ADS_API_KEY_EXPIRES_AT=2026-12-31T23:59:59.000Z
```

The command prints the raw token once and stores only `sha256:<hash>` in `ad_api_keys`.

Use it as:

```bash
export ADS_TOKEN="ajowa_ads_..."
export APP_URL="http://127.0.0.1:3020"
```

## Postman Collection

Import this file into Postman:

```text
docs/ads-platform.postman_collection.json
```

Set these collection variables:

- `baseUrl`: local or deployed app URL, for example `http://127.0.0.1:3020`
- `adsToken`: token printed by `npm run ads:key` for admin ads-management APIs
- `adToken`: optional alias; the collection copies this into `adsToken` when `adsToken` is empty
- `campaignId`: set automatically after "Create Campaign"
- `creativeId`: set automatically after "Create Creative"
- `slotKey`: `resident-dues-top`
- `residentEmail`: resident login email for the "Resident Login" request
- `residentPassword`: resident login password for the "Resident Login" request
- `residentCookie`: set automatically after "Resident Login"; required for resident delivery/tracking tests

Admin endpoints use `Authorization: Bearer {{adsToken}}`. Resident endpoints do not use the ads token; they require a logged-in resident session cookie. In Postman, run "Resident Testing" → "Resident Login" before "Fetch Eligible Resident Ad".

## Campaigns

Create a draft campaign:

```bash
curl -sS -X POST "$APP_URL/api/ads-admin/campaigns" \
  -H "Authorization: Bearer $ADS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Sunoo App Promo",
    "description": "Promote Sunoo to residents",
    "status": "DRAFT",
    "priority": 10,
    "targeting": { "scope": "ALL_ACTIVE_RESIDENTS" }
  }'
```

Activate a campaign:

```bash
curl -sS -X PATCH "$APP_URL/api/ads-admin/campaigns/<campaign-id>" \
  -H "Authorization: Bearer $ADS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "status": "ACTIVE" }'
```

Archive a campaign:

```bash
curl -sS -X DELETE "$APP_URL/api/ads-admin/campaigns/<campaign-id>" \
  -H "Authorization: Bearer $ADS_TOKEN"
```

## Creatives

Create a creative:

```bash
curl -sS -X POST "$APP_URL/api/ads-admin/campaigns/<campaign-id>/creatives" \
  -H "Authorization: Bearer $ADS_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
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
      "imageAlt": "Sunoo app promotional banner"
    }
  }'
```

Rules enforced by the API:

- `destinationUrl` must be an absolute external web URL.
- `imageUrl` must be an absolute web URL.
- `http://localhost` and `http://127.0.0.1` are allowed only outside production.
- `slotKey` must be one of the supported resident slots.
- `allowDismiss` is always normalized to `false`; residents cannot close ads.

## Resident Delivery

Resident pages call:

```text
GET /api/my/ads?slot=resident-dues-top
```

The response returns at most one eligible ad for v1.

## Resident Tracking

Resident pages log events through:

```text
POST /api/my/ads/events
```

Payload:

```json
{
  "creativeId": "<creative-id>",
  "eventType": "IMPRESSION",
  "slotKey": "resident-dues-top",
  "pagePath": "/my/dues",
  "metadata": {}
}
```

Notes:

- Impressions are deduped server-side for the same user, creative, slot, and session within a short window.
- Clicks are not deduped.
- Event writes are rate-limited per resident and event type.

Optional non-PWA fallback click redirect:

```text
GET /api/my/ads/<creative-id>/click?slot=resident-dues-top&pagePath=/my/dues
```

The resident banner should continue using direct external open with `window.open`.

## Reporting

Campaign stats:

```bash
curl -sS "$APP_URL/api/ads-admin/campaigns/<campaign-id>/stats?from=2026-07-01&to=2026-07-31" \
  -H "Authorization: Bearer $ADS_TOKEN"
```

Creative stats:

```bash
curl -sS "$APP_URL/api/ads-admin/creatives/<creative-id>/stats" \
  -H "Authorization: Bearer $ADS_TOKEN"
```

Click history:

```bash
curl -sS "$APP_URL/api/ads-admin/events?eventType=CLICK&pageSize=100" \
  -H "Authorization: Bearer $ADS_TOKEN"
```
