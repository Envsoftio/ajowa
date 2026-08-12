# PRD: Easebuzz Payment Gateway

Date: 2026-07-29
Last reviewed: 2026-08-12
Owner: AJOWA product/engineering
Status: Revised draft — implementation requires the operational decisions and release gates in this document

## Summary

AJOWA will implement Easebuzz for resident online maintenance payments while preserving the existing dues, allocation, receipt, notification, reporting, and finance workflows.

Razorpay was never connected to the resident UI, configured as a real production gateway, or used to process live transactions. The repository contains Razorpay prototype code only. AJOWA decided not to complete that integration because Razorpay is too costly for the society's payment use case and selected Easebuzz instead.

There is therefore no live-provider migration, dual-running period, settlement handover, or Razorpay transaction reconciliation. After confirming that production contains no real Razorpay payment data or active dashboard configuration, the unused Razorpay code, dependency, configuration, and provider-specific database table can be removed as project cleanup.

The Easebuzz implementation must remain additive and feature-flagged until it has been proven in sandbox and controlled production use.

The first production release should provide:

- Resident checkout through the EaseCheckout iframe.
- Server-side Easebuzz initiation and SHA-512 request signing.
- Reverse-hash validation for callbacks and transaction webhooks.
- Authoritative transaction verification using the merchant-approved, pinned Easebuzz Transaction V2 contract.
- Idempotent payment initiation, webhook handling, reconciliation, allocation, receipt creation, finance journal posting, and notifications.
- A safe pending-verification experience when the browser result arrives before server confirmation.
- Provider-neutral payment-attempt and gateway-event records.
- Monitoring and reconciliation for incomplete or delayed payments.
- A rollback path that disables online payments while preserving manual collection.
- Complete removal of unused Razorpay prototype code, configuration, endpoints, and dependencies.

## Business Context

The decision to use Easebuzz is commercial as well as technical:

- Razorpay was evaluated and prototype code was written, but the integration was never completed or used.
- Razorpay's pricing is too costly for AJOWA's expected transaction profile.
- Easebuzz was selected as the payment gateway to implement.
- No resident has paid through Razorpay in AJOWA.
- No production functionality depends on the Razorpay code.

## Recommendation

Build a provider-neutral online-payment workflow and implement Easebuzz as the only active provider.

Do not convert the unused Razorpay endpoints line by line. Easebuzz has its own initiation, callback, webhook, identifier, and status contracts. A provider-neutral boundary keeps the established accounting model stable and prevents payment-provider details from spreading across resident, billing, receipt, and finance code.

Recommended rollout:

1. Confirm that Razorpay has no production transactions, credentials, webhooks, or non-empty provider records.
2. Remove the unused Razorpay prototype integration.
3. Add provider-neutral schema and payment finalization.
4. Implement Easebuzz initiation, callback, webhook, verification, and reconciliation.
5. Connect the existing resident Pay buttons to EaseCheckout.
6. Complete sandbox and controlled production testing.
7. Enable Easebuzz behind the online-payments feature flag.

## Goals

- Implement Easebuzz as AJOWA's first live resident online-payment gateway.
- Remove all unused Razorpay prototype code and configuration.
- Preserve current manual-payment workflows without behavioral changes.
- Preserve all existing payments, allocations, receipts, journals, reports, and audit history unrelated to the unused Razorpay prototype.
- Let eligible residents pay dues from the existing `/my/dues` page.
- Prevent duplicate gateway transactions and duplicate local financial effects.
- Ensure a browser callback alone can never verify a payment.
- Ensure successful payments allocate dues, receive a receipt number, post a finance journal, and notify the resident exactly once.
- Handle duplicate, delayed, missing, and out-of-order gateway events safely.
- Support reconciliation when the resident closes the browser or a webhook is delayed.
- Keep Easebuzz credentials and salts out of public runtime configuration and logs.
- Ensure no Razorpay dependency, API route, runtime configuration, or executable integration code remains.

## Non-Goals

- No redesign of the maintenance dues calculation or allocation policy.
- No change to manual cash, cheque, bank-transfer, or manually recorded UPI payments.
- No migration or rewriting of existing manual-payment receipts.
- No dual-provider or dual-charge architecture.
- No storage or processing of raw card data inside AJOWA.
- No merchant-hosted card form or seamless card integration; the release uses EaseCheckout.
- No automatic refund workflow in the initial release.
- No deletion of financial history merely to remove provider-specific names.
- No editing of already-applied migration files in place.

## Users

- Resident: initiates an online payment, completes EaseCheckout, sees verification progress, and accesses the resulting receipt.
- Admin/manager: reviews payments, investigates pending or failed attempts, and reconciles gateway references.
- Finance/admin staff: relies on verified payments, allocations, journals, receipts, and reports remaining consistent.
- Engineering/operations: configures gateway credentials, monitors webhook and reconciliation health, removes the unused prototype, and performs the staged Easebuzz launch.

## Existing Product Context

AJOWA is a Nuxt application backed by PostgreSQL/Supabase. The existing payment domain already supports:

- Resident dues and linked-flat authorization.
- Allocation modes including oldest-unpaid-first, selected periods, and tenure packs.
- Manual payment recording.
- Payment statuses including initiated, pending verification, verified, failed, refunded, and cancelled.
- Receipt numbering and receipt PDF storage.
- Maintenance receipt journal entries.
- Resident notifications.
- Payment and finance reporting based on verified payments.
- Generic payment columns such as `gateway_order_id`, `gateway_payment_id`, `gateway_webhook_event_id`, and `idempotency_key`.

No online gateway has been used in production. Easebuzz should become the first live integration and should reuse these established domain capabilities rather than create a separate accounting path.

## Repository Audit Findings

### Razorpay Is Prototype Code Only

The resident Pay buttons in [`pages/my/dues.vue`](../pages/my/dues.vue) display eligibility and disabled states but have no checkout click handler. No resident frontend code currently calls the Razorpay order endpoint or loads Razorpay checkout.

Implications:

- Razorpay was never available to residents as a payment method.
- The Razorpay endpoints are unused prototype code, not an active production integration.
- There should be no real Razorpay transaction, settlement, refund, dispute, or receipt history to migrate.
- The Easebuzz project must include the first complete resident checkout connection.
- Existing manual payment functionality remains the production baseline that must not regress.

Before deleting provider-specific database objects, production must still be checked to prove that the Razorpay webhook table and Razorpay-linked payment fields contain no real records. This is a destructive-cleanup safeguard, not a transaction-migration phase.

### Prototype Initiation Has An Idempotency Design Defect

[`server/api/razorpay/orders.post.ts`](../server/api/razorpay/orders.post.ts) creates a Razorpay order before inserting or reusing the local idempotent `payments` row.

If that prototype were activated, a retry after the external order succeeds but before the database transaction finishes could create another external order.

The Easebuzz design must:

- Create or reuse the local payment and gateway attempt first.
- Assign one stable, unique `txnid`.
- Reuse that `txnid` for the same idempotency key.
- Call the external gateway only after the local attempt is durable.

### Prototype Online Finalization Is Not Atomic

[`server/api/razorpay/webhook.post.ts`](../server/api/razorpay/webhook.post.ts) marks a payment `VERIFIED`, commits, and then separately:

- Allocates the payment.
- Generates a receipt.
- Enqueues the resident notification.

If activated, a process failure between these steps could leave a verified payment without allocations or a receipt. Easebuzz must not copy this prototype behavior.

### Prototype Online Flow Omits The Finance Journal

The manual payment flow in [`server/api/payments/index.post.ts`](../server/api/payments/index.post.ts) performs allocation, receipt-number assignment, and `postMaintenanceReceiptJournal` in one database transaction.

The Razorpay prototype webhook does not call `postMaintenanceReceiptJournal`. No real Razorpay payment was processed, so this did not create a production accounting incident. It is nevertheless a design gap that must be corrected before Easebuzz handles live funds.

Easebuzz must use a shared, idempotent online-payment finalizer that performs all required accounting changes together.

### Prototype Webhook Handling Has Limited State Coverage

The Razorpay webhook only finalizes `payment.captured`. Other events are recorded and ignored, without mapping failure, cancellation, pending, or refund states into the local payment state machine.

Easebuzz must explicitly map and reconcile every relevant gateway state.

### Prototype Webhook Storage Is Provider-Specific

[`supabase/migrations/20260616103000_phase7_payments.sql`](../supabase/migrations/20260616103000_phase7_payments.sql) creates `razorpay_webhook_events`.

The prototype table:

- Is tied to one provider.
- Stores full raw payloads.
- Does not enable RLS in that migration.
- Does not explicitly revoke `anon` or `authenticated` access.

After confirming that this table has no production event records, a new migration may drop it. Easebuzz should use private, provider-neutral event storage with redaction and retention controls.

### Automated Test Coverage Exists But The Baseline Must Be Green

[`package.json`](../package.json) includes an `npm test` command and the repository contains an automated test suite. At the time of this PRD review, `npm run typecheck` passes, while `npm test` has one pre-existing module-resolution failure in `tests/admin-resident-validation.test.mjs` caused by an extensionless import under the Node test runner.

The existing failure must be corrected and the full baseline recorded before Easebuzz implementation begins. The project must then add gateway-specific unit, database, API, concurrency, accounting, and sandbox coverage. A release cannot claim non-regression by comparing against a known failing baseline.

## Product Principles

- The database, not the browser, is the financial source of truth.
- A resident-facing success message is provisional until the server verifies the transaction.
- External gateway calls must not occur while database row locks are held.
- Every external event may be duplicated, delayed, or delivered out of order.
- Idempotency must cover both gateway initiation and every downstream financial effect.
- Gateway capture, local payment verification, and bank settlement are separate financial events.
- A verified gateway payment must debit a gateway-clearing account; it must not be recorded as bank cash before settlement.
- Verified payments must not regress because an older failure or cancellation event arrives later.
- Manual payment paths must remain operational if online payments are disabled.
- Existing manual-payment and financial records must remain accessible while prototype code is removed.
- Gateway secrets and raw payment payloads are server-only data.
- Durable database work, not in-memory follow-up execution, must guarantee receipt, notification, and reconciliation recovery.
- Production rollout must be reversible without deleting or rewriting payments.

## Non-Regression Requirements

Easebuzz is a new capability. It must not change the behavior of any currently working feature unless this PRD explicitly requires it.

### Existing Functionality That Must Remain Unchanged

Resident functionality:

- `/my/dues` loading, grouping, totals, balances, overdue counts, and refresh.
- Linked-flat authorization and billing-contact payment eligibility.
- CAM advance-covered and partially adjusted dues.
- Charge breakdown display and bill access.
- Existing receipt list and receipt downloads.

Admin and manager functionality:

- Manual cash payment recording.
- Manual cheque payment recording and cheque validation.
- Manual bank-transfer and manually recorded UPI payment handling.
- UTR and bank-reference duplicate detection and authorized override behavior.
- Payment list, filters, search, status display, and payment detail.

Accounting functionality:

- Oldest-unpaid-first allocation.
- Selected-period allocation.
- Tenure-pack allocation.
- Partial payment, excess payment, and advance-credit behavior.
- Receipt number sequencing.
- Receipt PDF generation and storage.
- Maintenance receipt journal posting.
- Payment and finance reports that count only verified payments.
- Existing receipt-ready notification behavior.

Platform functionality:

- Authentication, roles, permissions, and linked-flat access.
- Existing Supabase migrations and database reset.
- Existing storage, email, push, and other notification integrations.
- Manual payment collection when online payments are disabled or unavailable.

### Implementation Isolation

- New Easebuzz endpoints must be added separately from the existing manual-payment API.
- Existing manual-payment request and response contracts must not change.
- Provider-specific Easebuzz code must remain behind the online-payment adapter.
- New columns on existing tables must be nullable or have backward-compatible defaults.
- No existing payment status may be reinterpreted for manual payments.
- Existing generic allocation, receipt, journal, and notification functions may be reused only with regression coverage.
- Existing manual-payment journal behavior must not be reused unchanged for online gateway receipts because bank settlement occurs later and may be net of fees and taxes.
- The online-payments feature flag must default to disabled in every environment until the release gate is approved.
- Failed or pending online payments must not appear in verified-payment totals or reduce dues balances.

### Migration Safety

- Razorpay prototype cleanup must first prove that provider-specific tables and payment identifiers contain no real data.
- The cleanup migration must abort instead of dropping the prototype webhook table if unexpected rows exist.
- Schema changes must not rewrite payment amounts, statuses, allocations, receipts, journals, or references.
- Every migration must succeed on both a fresh database reset and a production-shaped backup.
- Database and security advisors must pass before deployment.
- A rollback must disable new online payments without reverting or deleting already verified Easebuzz payments.

### Release Gate

Easebuzz cannot be enabled for residents unless:

- All existing manual-payment regression tests pass.
- Dues totals before and after the deployment match for the same database snapshot.
- Existing receipt and finance report totals match.
- No verified payment is missing its complete allocation/advance disposition, receipt number, or journal.
- The pre-implementation automated-test baseline is green and documented.
- Test, lint, typecheck, format check, build, payment tests, migration reset, and security checks pass.
- Gateway-clearing balances reconcile to unsettled Easebuzz payments, and settled batches reconcile gross-to-fees/taxes-to-net bank deposits.
- The online-payment kill switch has been exercised in the deployment environment.

## High-Level Resident Journey

### Resident Starts Payment

1. Resident opens `/my/dues`.
2. Resident chooses an eligible due and selects Pay.
3. AJOWA confirms linked-flat access and recalculates the allocation preview on the server.
4. AJOWA creates or reuses an idempotent local payment and gateway attempt.
5. AJOWA signs and sends the Easebuzz Initiate Payment request.
6. Easebuzz returns an `access_key`.
7. AJOWA opens EaseCheckout using the official browser script.

### Resident Completes Checkout

1. EaseCheckout returns a browser response.
2. AJOWA displays a verification-in-progress state.
3. The browser sends only the local payment identifier or `txnid` to AJOWA.
4. AJOWA verifies the transaction through its stored data, callback/webhook hash, and the pinned Easebuzz Transaction V2 contract approved for the merchant account.
5. AJOWA finalizes the verified payment exactly once.
6. The resident sees success only after local finalization completes.
7. Dues and receipts refresh.

### Resident Closes The Browser

1. The local payment remains initiated or pending verification.
2. Easebuzz webhook processing or scheduled reconciliation retrieves the authoritative transaction state.
3. A successful transaction is finalized without requiring the browser to return.
4. The resident can see the receipt when they next open the app.

### Payment Is Pending

1. AJOWA shows that the payment is awaiting bank/gateway confirmation.
2. The Pay action must not immediately create a second attempt for the same idempotency key.
3. Status polling and scheduled reconciliation continue.
4. The transaction eventually becomes verified, failed, or cancelled according to authoritative gateway status.

## Easebuzz Integration Contract

### EaseCheckout

The browser integration uses the official EaseCheckout script:

```text
https://ebz-static.s3.ap-south-1.amazonaws.com/easecheckout/v2.0.0/easebuzz-checkout-v2.min.js
```

Server initiation returns an `access_key`. The frontend creates `EasebuzzCheckout` with the merchant key and `test` or `prod` environment, then calls `initiatePayment`.

The frontend `onResponse` callback is for user experience and for triggering server verification. It is not authorization to mark a payment verified.

### Initiate Payment

The server sends a form-encoded request containing fields including:

- `key`
- `txnid`
- `amount`
- `productinfo`
- `firstname`
- `phone`
- `email`
- `surl`
- `furl`
- `udf1` through `udf10`
- `hash`

The request hash is SHA-512 over the exact documented field order:

```text
key|txnid|amount|productinfo|firstname|email|udf1|udf2|udf3|udf4|udf5|udf6|udf7|udf8|udf9|udf10|salt
```

Requirements:

- Trim values according to the Easebuzz contract before hashing.
- Use a canonical two-decimal amount string.
- Keep `udf8`, `udf9`, and `udf10` empty as required by the current integration guidance.
- Use `udf1` for the local payment UUID.
- Additional UDF correlation values are informational and must not replace local authorization checks.
- Ensure `txnid` satisfies Easebuzz length and character constraints.
- Never expose the salt.

### Callback Reverse Hash

Callbacks include a reverse hash calculated over the response fields and merchant salt.

AJOWA must:

- Reconstruct the documented reverse-hash sequence exactly.
- Compare hashes using a timing-safe function.
- Reject an invalid hash.
- Validate `key`, `txnid`, amount, product information, and local payment correlation.
- Persist a redacted callback record for investigation.
- Use the pinned Transaction V2 contract before financial finalization when the callback is the only available signal.

### Transaction Webhook

The transaction webhook is form encoded.

AJOWA must:

- Read the exact request body and parse form fields safely.
- Verify the reverse hash.
- Validate the event against a local Easebuzz attempt.
- Persist the event idempotently.
- Return HTTP 200 after durable acceptance within the Easebuzz response window.
- Avoid receipt generation, notification delivery, or slow external calls in the webhook response path.
- Process duplicates and out-of-order states safely.

Easebuzz payloads do not provide the same globally unique event identifier assumed by the Razorpay prototype. AJOWA should create a deterministic event fingerprint from normalized provider, `txnid`, `easepayid`, status, and payload hash.

### Transaction API V2 Contract

The currently reviewed official Easebuzz integration kit uses `POST /transaction/v2/retrieve` with a SHA-512 hash over `key|txnid|salt`. Before implementation, engineering must confirm this contract against the merchant account's current Easebuzz documentation and sandbox behavior. The endpoint path, required fields, hash sequence, timeout behavior, and representative redacted response fixtures must be version-pinned in automated contract tests.

AJOWA must integrate authoritative transaction retrieval for:

- Browser-triggered verification.
- Stale initiated or pending transactions.
- Callback/webhook ambiguity.
- Webhook delivery failure.
- Operational reconciliation.

The request uses the locally stored `txnid` and a server-generated SHA-512 hash. The response must be integrity-checked according to the pinned contract and compared with the local merchant key, `txnid`, amount, provider, and known `easepayid` when present. A response format or status that does not match the pinned contract must remain pending or under review; it must never default to success.

Self-generated test vectors are insufficient. The test suite must include merchant-approved documentation vectors or redacted sandbox fixtures for initiation, callback, webhook, transaction retrieval, duplicate transaction IDs, and each supported terminal and non-terminal status.

### Refunds

Easebuzz Refund API automation is not required for the initial payment-collection release.

A future refund phase must:

- Create a refund request record.
- Use a unique merchant refund identifier.
- Track queued, accepted, refunded, and failed states.
- Reverse or adjust allocations and finance journals according to accounting policy.
- Never delete the original payment.
- Never mark a payment refunded from a browser-only response.

## Provider-Neutral Architecture

Recommended boundary:

```text
Resident UI
  -> Online Payment API
    -> Provider Adapter
      -> Easebuzz Initiate / Transaction API
    -> Payment Attempt Store
    -> Gateway Event Store
    -> Payment State Machine
    -> Verified Payment Finalizer
      -> Allocation
      -> Receipt Number
      -> Gateway Clearing Journal
      -> Durable Effect Jobs
      -> Receipt PDF
      -> Notification
    -> Settlement Reconciliation
      -> Bank / Fee / Tax / Clearing Journal
```

The initial provider adapter may expose:

```ts
interface OnlinePaymentProvider {
  initiate(input: InitiatePaymentInput): Promise<InitiatePaymentResult>
  verifyCallback(input: FormPayload): VerifiedGatewayMessage
  retrieveTransaction(txnid: string): Promise<GatewayTransaction>
  normalizeStatus(status: string): LocalPaymentTransition
}
```

The accounting domain must not import Easebuzz-specific code directly.

## Identifier Mapping

| AJOWA concept                      | Easebuzz value             |
| ---------------------------------- | -------------------------- |
| Provider                           | `EASEBUZZ`                 |
| Local payment                      | `payments.id`              |
| Local idempotency                  | `payments.idempotency_key` |
| Gateway order/merchant transaction | `txnid`                    |
| Gateway payment identifier         | `easepayid`                |
| Bank reference                     | `bank_ref_num`             |
| Callback/webhook integrity         | Reverse SHA-512 hash       |
| Server reconciliation              | Pinned Transaction V2 API  |
| Local correlation                  | `udf1 = payments.id`       |

The existing generic `gateway_order_id` can store `txnid`, and `gateway_payment_id` can store `easepayid`. Provider-scoped uniqueness keeps the schema safe for future provider changes even though Easebuzz is the only live provider in this release.

## Data Model

Schema changes must preserve existing records and be delivered through new Supabase migrations created with:

```text
supabase migration new easebuzz_payment_gateway
```

Do not edit the previously applied Razorpay migration. New gateway tables and columns are additive. The only non-additive operations are the separately guarded removal of the unused Razorpay table and the audited replacement of legacy global gateway indexes described below.

### `payments` Changes

Add:

- `payment_provider text`
- Optional `gateway_paid_at timestamptz`
- Optional `gateway_finalized_at timestamptz`
- Optional `gateway_finalization_error text`

Constraints:

- Online gateway payments must identify a provider.
- The only supported live provider value is `EASEBUZZ`.
- Manual payments may keep `payment_provider` null.
- Provider validation should use an idempotently created check constraint or a provider lookup table.

Pre-migration verification:

- Confirm that no real `ONLINE_GATEWAY` payment contains Razorpay order, payment, webhook, receipt, allocation, or journal data.
- Stop and investigate if any such row exists; do not classify or delete it automatically.
- New Easebuzz rows use `EASEBUZZ`.
- Existing manual-payment rows remain unchanged.

Existing-index compatibility:

- The current schema has globally unique partial indexes on `gateway_order_id`, `gateway_payment_id`, `gateway_webhook_event_id`, and `idempotency_key`.
- After production data is audited, replace only the global `gateway_order_id` and `gateway_payment_id` indexes with provider-scoped unique indexes. Do not leave both global and provider-scoped versions active because the global indexes would defeat the provider-neutral design.
- Keep the existing global `payments.idempotency_key` constraint for backward compatibility with manual payments. Scope online initiation additionally through the attempts-table constraint described below.
- Keep legacy `gateway_webhook_event_id` nullable for compatibility, but new provider-neutral event processing must use `payment_gateway_events`; do not write new Easebuzz fingerprints into the single-value legacy column.

Required indexes:

- Unique partial index on `(payment_provider, gateway_order_id)` where `gateway_order_id is not null`.
- Unique partial index on `(payment_provider, gateway_payment_id)` where `gateway_payment_id is not null`.
- Index for reconciliation on `(payment_provider, status, created_at)` limited to active online states.

### `payment_gateway_attempts`

Purpose:

- Stores each durable gateway initiation attempt.
- Separates the logical payment from provider request lifecycle.
- Enables safe retry and reconciliation.

Recommended fields:

- `id uuid primary key default gen_random_uuid()`
- `payment_id uuid not null references payments(id) on delete restrict`
- `society_id uuid not null`
- `provider text not null`
- `merchant_transaction_id text not null`
- `idempotency_key text not null`
- `request_fingerprint text not null`
- `status text not null`
- `amount numeric(10,2) not null`
- `currency text not null default 'INR'`
- `initiation_response jsonb not null default '{}'`
- Optional encrypted or access-restricted `access_key`
- Optional `access_key_expires_at timestamptz`
- `last_gateway_status text`
- `attempt_count integer not null default 0`
- `failure_stage text`
- `failure_code text`
- `resident_message text`
- `retry_allowed boolean not null default false`
- `next_reconciliation_at timestamptz`
- `manual_review_required_at timestamptz`
- `last_error_code text`
- `last_error_message text`
- `initiated_at timestamptz`
- `last_verified_at timestamptz`
- `completed_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- Unique `(provider, merchant_transaction_id)`.
- Unique `(society_id, provider, idempotency_key)`.
- Unique `(payment_id, provider)` for the initial single-provider workflow.
- `society_id` references `society_profile(id) on delete restrict`.
- Index `(payment_id, created_at desc)`.
- Partial reconciliation index on `(provider, updated_at)` for initiated and pending attempts.
- Foreign-key indexes for `payment_id` and `society_id`.

The `request_fingerprint` must be a cryptographic digest generated from the canonical society, payer, flat, amount, currency, allocation mode, sorted selected due IDs, tenure, and other financially relevant intent. Store the digest rather than a raw string containing personal or financial data. Reusing an idempotency key with a different fingerprint returns `409 CONFLICT` and must not call Easebuzz.

The implementation must resolve the crash window in which Easebuzz returns an `access_key` but AJOWA fails before returning it to the browser. Before sandbox approval, confirm whether Easebuzz safely returns/reissues an access key when initiation is repeated with the same `txnid`. If not, store the access key with an explicit expiry, server-only access, log redaction, and bounded retention. An ambiguous duplicate-`txnid` response must trigger transaction retrieval or manual review; it must never generate a new `txnid` automatically.

### `payment_gateway_events`

Purpose:

- Stores callback and webhook receipt.
- Provides idempotency, audit, retry, and reconciliation context.

Recommended fields:

- `id uuid primary key default gen_random_uuid()`
- `society_id uuid references society_profile(id) on delete restrict`
- `payment_id uuid references payments(id) on delete restrict`
- `attempt_id uuid references payment_gateway_attempts(id) on delete restrict`
- `provider text not null`
- `event_fingerprint text not null`
- `event_kind text not null`
- `merchant_transaction_id text`
- `gateway_payment_id text`
- `gateway_status text`
- `payload_hash text not null`
- `hash_verified boolean not null default false`
- `redacted_payload jsonb not null default '{}'`
- `received_count integer not null default 1`
- `received_at timestamptz not null default now()`
- `processed_at timestamptz`
- `processing_error text`
- `retry_count integer not null default 0`
- `last_retry_at timestamptz`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Constraints and indexes:

- Unique `(provider, event_fingerprint)`.
- Foreign-key indexes for `society_id`, `payment_id`, and `attempt_id`.
- Index `(provider, merchant_transaction_id, received_at desc)`.
- Partial index on `(provider, received_at)` where `processed_at is null`.

The fingerprint must include normalized provider, event kind, `txnid`, `easepayid`, gateway status, and payload hash. Including event kind prevents a callback and webhook with otherwise identical fields from being incorrectly collapsed into one audit record. Duplicate receipt should use `INSERT ... ON CONFLICT` to increment `received_count` atomically.

An event may initially be stored without `society_id`, `payment_id`, or `attempt_id` only when correlation is invalid or unavailable. Valid correlated events must set all three references and must pass an application-level check that payment, attempt, society, provider, merchant transaction ID, and amount agree.

### `payment_effect_jobs`

Purpose:

- Durably records post-commit work so a process crash cannot lose receipt PDF generation or notification enqueueing.
- Supports bounded retries and operational visibility.

Recommended fields:

- `id uuid primary key default gen_random_uuid()`
- `society_id uuid not null references society_profile(id) on delete restrict`
- `payment_id uuid not null references payments(id) on delete restrict`
- `job_type text not null`
- `status text not null default 'QUEUED'`
- `attempt_count integer not null default 0`
- `next_attempt_at timestamptz`
- `locked_at timestamptz`
- `locked_by text`
- `last_error_code text`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Requirements:

- Unique `(payment_id, job_type)` for `RECEIPT_PDF` and `RECEIPT_NOTIFICATION`.
- Finalization inserts required jobs in the same database transaction as payment verification.
- Workers claim jobs in bounded batches using the repository's established `FOR UPDATE SKIP LOCKED` pattern, perform external work outside the claim transaction, and recover stale locks.
- The existing notification queue remains the delivery system; the payment-effect job guarantees that enqueueing into it is retried exactly once logically.

### `payment_gateway_settlements` And Settlement Items

Purpose:

- Separates gateway payment verification from actual bank settlement.
- Reconciles gross captured amounts, gateway fees, taxes, adjustments, refunds, and net bank deposits.

Minimum model:

- A settlement header scoped by society and provider with provider settlement ID, settlement date, currency, gross amount, fee amount, tax amount, adjustment amount, net amount, bank account, status, and source/import metadata.
- Settlement items linked to the header and local payment/attempt with `easepayid`, `txnid`, gross amount, fee, tax, adjustment, and net amount.
- Unique provider-scoped settlement and settlement-item identifiers.
- Additive foreign keys with `on delete restrict`, RLS, explicit public-role revocation, and indexes for unresolved clearing entries.

The first release may use a protected, audited statement import if the merchant account does not provide a suitable settlement API. General availability still requires a repeatable daily reconciliation process; dashboard-only visual checking is not sufficient.

### Finance Schema Compatibility

Add a backward-compatible journal posting-source field, for example `posting_source text not null default 'USER'`, with supported values such as `USER`, `PAYMENT_GATEWAY`, and `GATEWAY_SETTLEMENT`. Existing journals retain `USER`. Online receipt and settlement journals use the appropriate system source and may keep `posted_by_user_id` null; user-triggered manual journals continue to require their current actor attribution.

If the team instead chooses a dedicated system user, it must be a non-login service identity with stable lifecycle rules and must never be an arbitrary resident or administrator. The selected model must be applied consistently to audit records, journal entries, retries, and reconciliation.

### Data API And RLS Requirements

`payment_gateway_attempts`, `payment_gateway_events`, `payment_effect_jobs`, settlement headers, and settlement items contain internal payment metadata.

Requirements:

- Enable RLS on every new internal payment table if it is in `public`.
- Do not create resident-facing policies for raw gateway data.
- Explicitly revoke table access from `anon` and `authenticated`.
- Use the server database role for all access.
- Do not expose raw payloads, hashes, salts, keys, or internal errors through resident APIs.
- Run Supabase database and security advisors after the migration.

Current Supabase platform behavior may not automatically expose newly created tables to the Data API. The migration must not rely on that default; explicit revokes and RLS remain required defense in depth.

## API Requirements

### Initiate Online Payment

```text
POST /api/payments/online/initiate
```

Auth:

- Active authenticated resident.
- Resident must have payment permission for the selected linked flat.

Request:

- `flatId`
- `amount`
- `allocationMode`
- `selectedDueIds`
- `tenureMonths`
- `idempotencyKey`

Behavior:

1. Validate input.
2. Validate linked-flat access.
3. Enforce the same billing-contact, owner/tenant, society-policy, active-user, active-flat, and `canPayNow` rules used by `/my/dues`; linked-flat membership alone is insufficient.
4. Recalculate allocation preview and payable amount on the server.
5. Build and compare the canonical request fingerprint.
6. Create or reuse the local `INITIATED` payment.
7. Create or reuse the Easebuzz attempt and stable `txnid`.
8. Commit local state.
9. Call Easebuzz outside the database transaction.
10. Store the redacted initiation result and recoverable access-key state according to the approved contract.
11. Return checkout data.

Response:

- `paymentId`
- `txnid`
- `accessKey`
- `merchantKey`
- `environment`
- `amount`
- `currency`
- `allocationPreview`

The salt and server hash inputs beyond documented browser requirements must not be returned.

The response amount and preview are authoritative. If the server-calculated intent no longer matches the submitted due selection, return a safe conflict that asks the resident to refresh; do not initiate a stale amount silently.

### Easebuzz Success/Failure Callback

```text
POST /api/payments/easebuzz/callback
```

Behavior:

- Accept form-encoded callback fields.
- Validate reverse hash.
- Persist a redacted event.
- Queue reconciliation using the pinned Transaction V2 contract.
- Return a safe HTML redirect or result response promptly; do not hold the unauthenticated callback open for slow transaction retrieval or financial finalization.
- Do not expose internal validation details to an unauthenticated caller.

### Easebuzz Transaction Webhook

```text
POST /api/payments/easebuzz/webhook
```

Behavior:

- Accept form-encoded webhook fields.
- Enforce request size limits.
- Validate reverse hash and local correlation.
- Persist durably and idempotently.
- Return 200 after durable acceptance.
- Record invalid messages for security monitoring without processing them.
- Queue valid messages for processing and apply only allowed monotonic state transitions outside the webhook acknowledgement path.

### Browser Verification

```text
POST /api/payments/online/verify
```

Auth:

- Active authenticated resident with access to the payment's flat.

Request:

- Local `paymentId` or locally known `txnid`.

Behavior:

- Ignore any browser-supplied amount or success status.
- Retrieve the local attempt.
- Call the pinned Transaction V2 API contract.
- Verify the server response.
- Apply the local transition.
- Run finalization when authoritative status is successful.

### Payment Status

```text
GET /api/payments/:id/status
```

Auth:

- Resident must own or have permitted access to the payment's flat.
- Admin/manager access follows existing payment permissions.

Response:

- Local status.
- Safe resident-facing message.
- Receipt identifier when available.
- Whether polling should continue.

Do not return raw gateway payloads, hashes, UDF values, or internal reconciliation errors.

### Reconciliation

Provide a protected scheduled process or worker that:

- Selects stale initiated/pending Easebuzz attempts in bounded batches.
- Claims work safely so two workers cannot finalize the same attempt concurrently.
- Uses explicit claim metadata or `FOR UPDATE SKIP LOCKED`, with stale-lock recovery, rather than holding database locks during HTTP calls.
- Calls Transaction API outside database transactions.
- Applies the state transition in a short transaction.
- Retries transient failures with bounded backoff.
- Escalates attempts that exceed age or retry thresholds.

The exact scheduling mechanism may use the application's existing scheduled-function pattern or a database-backed job. External HTTP calls must not be performed while payment rows are locked.

## Payment State Machine

Local status mapping:

| Easebuzz state          | Local state                           | Rule                                        |
| ----------------------- | ------------------------------------- | ------------------------------------------- |
| `initiated`             | `INITIATED` or `PENDING_VERIFICATION` | Continue reconciliation                     |
| `pending`               | `PENDING_VERIFICATION`                | Continue reconciliation                     |
| `success`               | `VERIFIED`                            | Only after integrity and amount checks      |
| `failure`               | `FAILED`                              | Unless payment is already verified          |
| `dropped`               | `FAILED`                              | Unless payment is already verified          |
| `bounced`               | `FAILED`                              | Unless payment is already verified          |
| `userCancelled`         | `CANCELLED`                           | Late authoritative success may still verify |
| refund/autorefund state | Refund workflow                       | Requires financial reversal                 |

Transition rules:

- `VERIFIED` must never regress to `FAILED` or `CANCELLED`.
- Repeated success must be a no-op after finalization.
- Failure or cancellation may transition to verified if a later authoritative success proves funds were captured.
- A pending browser callback must not overwrite a later successful webhook.
- Unknown Easebuzz statuses remain pending investigation and must not be treated as success.
- Status normalization should tolerate documented spelling/casing differences while preserving the raw status for audit.

## Verified Payment Finalization

Create one idempotent function, conceptually:

```text
finalizeVerifiedOnlinePaymentWithClient
```

Before calling the finalizer, persist the authoritative gateway observation on the attempt in its own short transaction, including the verified raw status, `easepayid`, amount, and gateway-paid timestamp. This preserves evidence that Easebuzz captured the money even if local financial finalization later rolls back. The local `payments` row remains `PENDING_VERIFICATION` until the complete finalization transaction succeeds.

Inside one short database transaction:

1. Lock the payment.
2. Confirm it is an Easebuzz online payment.
3. Validate expected amount, `txnid`, `easepayid`, and society/flat association.
4. Write gateway and bank references.
5. Set status to `VERIFIED`, record authoritative `gateway_paid_at`, and set local `verified_at`.
6. Allocate the payment using the existing allocation logic.
7. Assign exactly one receipt number.
8. Post exactly one gateway-clearing receipt journal.
9. Insert durable `RECEIPT_PDF` and `RECEIPT_NOTIFICATION` effect jobs.
10. Mark gateway finalization complete.
11. Commit.

Requirements:

- Allocation remains idempotent when allocations already exist.
- The verified gross amount must equal payment allocations plus any resident advance credit created from that payment, using paise-level rounding.
- Receipt numbering remains idempotent.
- Gateway-clearing journal creation remains idempotent by `payment_id` and the existing unique journal relationship.
- No gateway HTTP call occurs inside this transaction.
- Concurrent webhook, callback, browser verification, and reconciliation requests must converge on one result.
- If finalization rolls back, the attempt retains authoritative gateway-success evidence, the local payment remains pending, `retry_allowed` remains false, and reconciliation retries finalization without another Easebuzz charge.
- Online posting uses an explicit system/service actor or an approved nullable system-posting model; it must not impersonate the resident or an arbitrary administrator.
- Receipt and reporting dates use the authoritative gateway-paid timestamp converted according to the documented society timezone policy. Initiation time must not be substituted for payment time.

### Allocation Drift During Checkout

The dues state may change after initiation but before Easebuzz success is finalized. For example, an administrator may record a manual payment, apply an advance, waive a charge, or correct a due while the resident is in checkout.

Required policy:

- Store the resident's allocation intent and initiation preview for audit, but recompute actual allocation under lock during finalization.
- Preserve the selected allocation mode where still valid.
- Never allocate more than the remaining eligible balance of a due.
- If the verified amount exceeds the remaining selected dues, use the society's existing excess-payment policy. Create an advance only when that policy permits it.
- If the remainder cannot legally be allocated or retained as advance, keep the local payment `PENDING_VERIFICATION` with resident code `PAYMENT_RECEIVED_PROCESSING`, mark the attempt for manual review, and prevent another payment. Do not discard the captured money, mark it failed, or ask the resident to pay again.
- Test a manual payment, advance application, waiver, and due correction racing between online initiation and finalization.

After commit, durable workers:

- Generate and upload the receipt PDF.
- Enqueue the receipt-ready notification.
- Retry either operation if it fails.
- Do not reverse a verified payment merely because receipt upload or notification delivery failed.
- Periodically recover any verified payment missing its effect jobs, receipt file, notification event, allocation, receipt number, or journal.

## Gateway Accounting And Settlement

Easebuzz payment verification and Easebuzz settlement are distinct accounting events. The existing `postMaintenanceReceiptJournal` function is correct for manual money received directly into a configured bank account, but it must not be called unchanged for an Easebuzz capture.

### Journal At Verified Gateway Payment

Create a provider-neutral online-receipt posting function that uses the same allocation-derived maintenance, late-fee, and resident-advance amounts as the manual flow, but posts the debit to an active `Easebuzz Clearing` asset account rather than directly to a society bank account.

Conceptual entry for a gross payment:

```text
Debit   Easebuzz Clearing                 gross captured amount
Credit  Maintenance Income               allocated maintenance amount
Credit  Late Fee Income                  allocated late-fee amount
Credit  Resident Advance Liability       permitted excess/advance amount
```

The credits must total the verified gross payment and must remain compatible with the current allocation and advance-liability logic. Do not net gateway fees out of the resident receipt or reduce the resident's credited payment amount.

### Journal At Settlement

When an Easebuzz settlement is matched to the bank deposit, post a separate idempotent settlement journal. Conceptually:

```text
Debit   Society Bank                     net amount deposited
Debit   Payment Gateway Fee Expense      gateway fee, if applicable
Debit   Approved Tax/Input-Tax Account   tax amount, only per accounting policy
Debit/Credit Explicit Adjustment Account supported settlement adjustments
Credit  Easebuzz Clearing                gross amount settled
```

Requirements:

- Finance/accounting must approve the account heads and tax treatment before the production pilot.
- Settlement journals must link to the settlement header/items through additive relationships; they must not reuse `journal_entries.payment_id` for multiple settlement postings because that field is unique per payment.
- Every fee, tax, refund, chargeback, reserve, or adjustment must be represented explicitly. Unknown deductions remain unreconciled and require review; they must not be silently posted to a generic expense.
- The bank is debited only when the settlement is supported by a provider statement/API record and matched bank deposit.
- Settlement import and journal posting are idempotent by provider settlement identifier and source fingerprint.
- A settlement batch cannot be marked reconciled unless item gross totals and adjustments explain the net bank deposit exactly within the application's paise-level rounding rules.

### Settlement Operations

- Import or retrieve settlement data daily during the pilot and on every business day after general availability.
- Match by provider, settlement ID, `easepayid`, `txnid`, amount, currency, and expected date window.
- Surface captured-but-unsettled, settled-without-local-payment, duplicate, amount-mismatch, fee/tax mismatch, and bank-deposit mismatch cases.
- Keep settlement status separate from resident payment status. A resident payment remains verified after a normal delayed settlement, but overdue or mismatched settlement must alert operations.
- Record every manual settlement match, unmatch, adjustment classification, and retry as an audited action with a reason.
- Establish expected settlement timing from the executed Easebuzz merchant agreement; alert thresholds must be based on that contract rather than an assumed T+N period.

## Resident UI Requirements

### Existing Pay Buttons

Both desktop and mobile Pay buttons in `/my/dues` should call one shared handler.

Behavior:

- Respect existing `canPayNow`, balance, CAM advance, and linked-flat rules.
- Prevent repeat clicks while initiation is active.
- Reuse a stable idempotency key for retries of the same resident intent.
- Display the server-calculated amount and allocation preview before checkout where appropriate.
- Load the EaseCheckout script once and verify that its global constructor is available.
- Open EaseCheckout with the returned `access_key`.

### UI States

Required states:

- Ready to pay.
- Creating payment.
- Opening secure checkout.
- Payment verification pending.
- Payment verified and receipt being prepared.
- Payment successful.
- Payment failed.
- Payment cancelled.
- Checkout unavailable.

Pending copy should make clear:

```text
Your payment was submitted and is being verified. Do not pay again while verification is in progress.
```

Success should not be shown until the backend reports verified/finalized.

### Recovery

- Refreshing the page should recover the active attempt from the server when possible.
- Closing the iframe must not automatically mark a transaction failed.
- When online payments are disabled, Pay should show a controlled unavailable message while manual/admin recording remains functional.
- A stale pending attempt should offer status refresh, not immediate duplicate payment creation.

## Payment Failure And Recovery Requirements

Payment failure handling must tell the resident:

1. What happened in plain language.
2. Whether AJOWA has confirmed a debit.
3. Whether it is safe to try again.
4. What AJOWA will do next.
5. Which reference to provide if support is needed.

The UI must not display raw Easebuzz responses, exception messages, HTTP status text, stack traces, hash failures, or database errors.

### Failure Classification

| Scenario                                                                | Local treatment                                                                          | Resident description                                                                 | Resident action                                                               |
| ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------- |
| Checkout script cannot load                                             | No payment attempt sent to Easebuzz                                                      | `Secure checkout could not be loaded. No payment was started.`                       | Retry after checking the connection                                           |
| Initiation rejected before an `access_key` is created                   | Attempt failed before checkout                                                           | `We could not start your payment. No successful payment was created.`                | Retry is allowed                                                              |
| Initiation request times out after it may have reached Easebuzz         | `PENDING_VERIFICATION`                                                                   | `We could not confirm whether checkout started. We are checking the payment status.` | Do not pay again; wait for verification                                       |
| Resident closes or cancels EaseCheckout                                 | `CANCELLED` only when confirmed                                                          | `You cancelled the checkout. No successful payment has been confirmed.`              | Retry is allowed only after status reconciliation                             |
| Bank or gateway authoritatively declines the payment                    | `FAILED`                                                                                 | `The payment was not completed by the bank or payment provider.`                     | Try again or use another method; if debited, do not retry and contact support |
| Easebuzz reports pending/initiated                                      | `PENDING_VERIFICATION`                                                                   | `Your payment is still being processed. Please do not pay again.`                    | AJOWA polls and reconciles automatically                                      |
| Browser reports success but server verification is delayed              | `PENDING_VERIFICATION`                                                                   | `Your payment response was received and is being verified. Please do not pay again.` | Wait or refresh status                                                        |
| Easebuzz verifies success but the atomic local finalizer must retry     | Keep the payment locally pending while the attempt records authoritative gateway success | `Payment received. We are updating your dues and preparing the receipt.`             | Do not pay again; AJOWA retries finalization                                  |
| Callback/webhook integrity or amount validation fails                   | Hold for investigation; never verify from that message                                   | `We could not safely verify this payment. It is under review.`                       | Do not pay again; contact support with the reference                          |
| Reconciliation exceeds its retry/age threshold                          | Pending manual review                                                                    | `Payment verification is taking longer than expected. Our team needs to review it.`  | Do not pay again; contact support with the reference                          |
| Receipt PDF or notification fails after complete financial finalization | Payment remains verified                                                                 | `Payment is complete. Your receipt is being prepared and will be available shortly.` | No payment retry; retry document/notification work internally                 |

The system must never state that money was not debited unless it knows the payment request was never sent to Easebuzz. Network timeouts, closed browsers, and missing callbacks are unknown outcomes and must be shown as pending verification.

### Stable Failure Codes

Resident APIs should return stable application codes independently of Easebuzz wording:

- `PAYMENT_CHECKOUT_UNAVAILABLE`
- `PAYMENT_INITIATION_FAILED`
- `PAYMENT_STATUS_UNKNOWN`
- `PAYMENT_CANCELLED`
- `PAYMENT_DECLINED`
- `PAYMENT_PENDING`
- `PAYMENT_VERIFICATION_DELAYED`
- `PAYMENT_UNDER_REVIEW`
- `PAYMENT_RECEIVED_PROCESSING`
- `PAYMENT_RECEIPT_PENDING`

Each status response should provide:

```json
{
  "status": "PENDING_VERIFICATION",
  "code": "PAYMENT_VERIFICATION_DELAYED",
  "title": "Payment verification in progress",
  "message": "Your payment response was received and is being verified. Please do not pay again.",
  "paymentId": "local-payment-uuid",
  "transactionReference": "merchant-txnid",
  "retryAllowed": false,
  "pollAfterMs": 5000
}
```

Rules:

- `message` is safe, specific, and actionable.
- `transactionReference` is always shown once a local attempt exists.
- `retryAllowed` is false for every unknown, pending, under-review, or financially successful state.
- `pollAfterMs` is present only while polling is useful.
- Technical cause, provider response, and internal retry details remain server/admin-only.
- Error descriptions must be consistent across the callback result, dues page, receipts page, and payment-status endpoint.

### Failure Persistence

`payment_gateway_attempts` should retain sanitized failure details:

- Failure stage: script, initiation, callback, webhook, verification, finalization, receipt, or notification.
- Stable application failure code.
- Redacted provider status and provider error code.
- Safe resident-facing description.
- Technical description for authorized operations users.
- Whether retry is safe.
- Attempt count and last retry time.
- Next reconciliation time.
- When manual review became required.

Secrets, full hashes, card information, unmasked VPA, and raw personally identifiable data must not be stored in failure descriptions.

### Failure Processing Rules

- A browser `onResponse` failure is not automatically authoritative if the transaction outcome is unknown.
- Only a verified webhook or Transaction API response may confirm a terminal gateway failure.
- `FAILED` and `CANCELLED` payments receive no allocations, receipt number, journal, or receipt-ready notification.
- `PENDING_VERIFICATION` payments do not reduce dues and cannot create a second attempt through an accidental repeat click.
- If Easebuzz later reports success, a failed or cancelled attempt may transition to verified according to the monotonic state rules.
- If gateway success is confirmed but local finalization fails, the resident must never be told to pay again.
- Internal retries must be idempotent and must not create a second receipt, allocation, journal, or notification.

### Support And Admin Visibility

Residents should see:

- Plain-language status.
- Amount and payment date/time.
- Local payment reference and `txnid`.
- Whether they may safely retry.
- A support action when manual review is required.

Authorized admin/operations users should additionally see:

- Failure stage and stable code.
- Redacted Easebuzz status/code.
- Hash-validation result without hash contents.
- Last webhook/callback/reconciliation time.
- Retry count and next retry time.
- Finalization sub-step that failed.
- Safe reconcile/retry action.

No admin action may force a payment to verified without authoritative transaction evidence and an audited reason.

### Content Security Policy

Add explicit allowlists required by the tested EaseCheckout implementation:

- Official EaseCheckout script host.
- Verified Easebuzz test and production payment hosts.
- Required frame, connect, and form-action destinations.

Do not use wildcard CSP allowances. Capture actual sandbox network requests before finalizing the policy.

## Configuration

Recommended server-only environment variables:

```text
ONLINE_PAYMENTS_ENABLED=false
EASEBUZZ_ENV=test
EASEBUZZ_KEY=
EASEBUZZ_SALT=
PAYMENT_RECONCILIATION_WORKER_SECRET=
```

Rules:

- `EASEBUZZ_SALT` is always server-only.
- Credentials must be configured independently for test and production deployments.
- Production must refuse Easebuzz initiation when required configuration is missing.
- Missing Easebuzz configuration must not prevent unrelated application routes or manual payments from starting.
- Missing worker configuration must disable and alert only the online reconciliation worker; it must not prevent application startup or manual collection.
- Do not log credentials, request hash source strings, full callbacks, or raw payment instruments.
- Merchant key/environment may be returned only as required by the official EaseCheckout browser contract.
- No Razorpay provider option or fallback configuration should remain.
- The production state supports Easebuzz or disabled online payments.

## Security Requirements

- Generate all request hashes server-side.
- Use SHA-512 with exact documented field ordering.
- Use timing-safe hash comparison.
- Check decoded hash lengths before calling the timing-safe comparison so malformed input cannot trigger an exception-based denial of service.
- Validate merchant key, `txnid`, amount, currency, product information, local payment ID, flat, society, and provider.
- Recalculate payment allocation and authorization on the server.
- Never trust browser-provided success, amount, user, flat, or gateway identifier.
- Enforce linked-flat authorization on initiation, verification, and status APIs.
- Rate-limit public callback/webhook endpoints where this does not interfere with legitimate retries.
- Apply strict request-size and parsing limits.
- Store only redacted gateway payloads.
- Mask phone, email, card metadata, VPA, and bank information in logs and admin error views.
- Set a documented retention period for gateway event payloads.
- Enable RLS and explicit privilege revocation on internal gateway tables.
- Keep the Supabase service-role key and Easebuzz salt out of public runtime configuration.
- Audit administrative reconciliation or override actions.
- Do not add a force-verify admin action that bypasses transaction evidence.

## Idempotency And Concurrency

### Initiation

- One idempotency key maps to one logical local payment.
- One provider/idempotency pair maps to one stable gateway attempt and `txnid`.
- The same key with a different canonical request fingerprint returns `409 CONFLICT` before any gateway call.
- A repeated request returns or refreshes the existing attempt instead of creating a new charge.
- Easebuzz duplicate-`txnid` responses trigger retrieval/reconciliation rather than generating a new `txnid` automatically.
- An unresolved attempt blocks accidental repeat initiation for the same resident intent, while a new intentional retry after an authoritative terminal failure receives a new idempotency key, payment, attempt, and `txnid` linked to the prior attempt for audit.

### Event Receipt

- Event fingerprint uniqueness prevents duplicate processing.
- Duplicate delivery increments receipt metadata but does not repeat financial work.
- Callback, webhook, browser verification, and scheduled reconciliation may race safely.

### Finalization

- Lock the payment only for local state changes.
- Use atomic upsert or insert-on-conflict patterns for event and attempt records.
- Use provider-scoped unique constraints.
- Keep transactions short.
- Use deterministic lock ordering if more than one table/row is locked.
- Create durable effect jobs in the finalization transaction so post-commit work cannot be lost.

### Settlement

- Provider settlement IDs and source fingerprints are unique within provider scope.
- Reimporting the same statement or receiving the same settlement data is a no-op except for receipt metadata.
- Settlement item matching and settlement journal posting are transactional and idempotent.
- Concurrent settlement workers must use the same bounded claim and stale-lock recovery principles as payment reconciliation.

## Observability And Reconciliation

Operational metrics:

- Initiation requests and initiation success rate.
- EaseCheckout open failures.
- Payment success, failure, cancellation, and pending rates.
- Initiated and pending age buckets.
- Callback and webhook volume.
- Hash validation failures.
- Unknown transaction and amount-mismatch events.
- Duplicate event count.
- Transaction API latency and error rate.
- Time from gateway success to local finalization.
- Allocation, receipt-number, journal, PDF, and notification failures.
- Gateway-clearing balance and captured-but-unsettled age buckets.
- Settlement gross, fee, tax, adjustment, and net mismatches.
- Verified payments missing allocations.
- Verified payments missing journal entries.
- Verified payments missing receipt numbers or files.
- Gateway settlement totals versus local verified totals.

Operational views or protected queries should support:

- Pending Easebuzz attempts older than a threshold.
- Failed finalizations requiring retry.
- Verified payment invariant violations.
- Invalid webhook attempts.
- Gateway-clearing balance by payment and settlement-age bucket.
- Settlement batches with unmatched items, unexplained deductions, or unmatched bank deposits.

Alerts should be actionable and must not include raw secrets or sensitive payment data.

## Testing Strategy

### Unit Tests

- Initiate hash generation with fixed official-compatible vectors.
- Pinned Transaction V2 request and response fixtures captured from merchant-approved documentation or sandbox traffic.
- Reverse-hash generation and timing-safe comparison.
- Exact amount canonicalization.
- `txnid` generation and length/character validation.
- Form-encoded callback parsing.
- Status normalization and transition matrix.
- Stable failure-code mapping.
- Resident-message and retry-allowed mapping.
- Unknown-outcome handling that never claims a definite failure.
- Event fingerprint generation.
- Payload redaction.
- Canonical request-fingerprint stability and mismatch rejection.
- Gateway-paid timestamp and society-timezone conversion.

### Database And Service Tests

- Idempotent payment and attempt creation.
- Concurrent initiation with the same idempotency key.
- Same idempotency key with changed amount, flat, allocation mode, or due selection is rejected before a gateway call.
- Recovery after Easebuzz returns an access key but the initiating process fails before responding.
- Provider-scoped gateway identifier uniqueness.
- Duplicate and out-of-order event handling.
- Exactly-once allocation.
- Exactly-once receipt numbering.
- Exactly-once finance journal posting.
- Verified online payment debits gateway clearing rather than a bank account.
- Settlement posts net bank, fees, approved taxes, adjustments, and clearing without changing the resident's gross credited amount.
- Duplicate settlement import and concurrent settlement processing remain idempotent.
- Captured-but-unsettled and settlement-mismatch cases remain visible and do not alter resident payment verification.
- Durable effect jobs recover after a process crash between finalization commit and worker execution.
- Failed/cancelled payments create no allocation, receipt, journal, or notification.
- Pending payments do not reduce dues or appear in verified totals.
- Gateway-success finalization retry keeps the payment out of verified reports until the atomic finalizer commits.
- Manual payment, advance application, waiver, and due correction racing with online checkout follow the allocation-drift policy without losing captured funds.
- Prototype cleanup aborts when unexpected Razorpay event/payment data exists.
- Verified payment invariant queries.
- RLS and privilege tests showing `anon` and `authenticated` cannot access gateway tables.

### API Tests

- Linked-flat authorization.
- Unauthorized initiation and status access.
- Initiation success and Easebuzz error mapping.
- Initiation timeout returns unknown/pending rather than retry-safe failure.
- Idempotency fingerprint mismatch returns a safe conflict.
- Invalid callback hash.
- Invalid webhook hash.
- Amount, key, `txnid`, provider, and local-correlation mismatch.
- Browser verification that ignores client-supplied status.
- Status responses include safe description, transaction reference, and correct `retryAllowed`.
- Raw provider or internal errors never reach resident responses.
- Pending status polling.
- Reconciliation recovery after callback/webhook loss.
- Callback and webhook acknowledgement paths do not wait for slow transaction retrieval, PDF generation, notifications, or settlement processing.

### Sandbox End-To-End Matrix

- Successful payment.
- Failed payment.
- User cancellation.
- Pending payment.
- Checkout script load failure with a safe retry message.
- Explicit initiation rejection with a safe retry message.
- Initiation timeout with a do-not-retry pending message.
- Authoritative bank decline with a clear description and reference.
- Verification delay with automatic polling and no duplicate-payment action.
- Gateway success followed by local finalization retry.
- Integrity/amount mismatch routed to manual review without exposing technical details.
- Late success after pending/cancellation.
- Duplicate Pay click.
- Browser refresh during checkout.
- Browser closed after bank debit.
- Webhook before browser callback.
- Browser callback before webhook.
- Duplicate webhook.
- Out-of-order failure after success.
- Delayed or missing webhook.
- Transaction API timeout.
- Receipt PDF upload failure.
- Notification failure.
- Process termination immediately after financial finalization commit.
- Gross settlement with fee and tax deductions.
- Multi-payment settlement batch and partial/unmatched settlement statement.
- All payment allocation modes.
- Partial payment.
- Excess or advance handling according to society policy.
- Multiple linked flats and unauthorized flat attempts.

### Regression Tests

- Manual cash payment.
- Manual cheque payment.
- Manual bank transfer and UPI.
- Duplicate UTR/reference checks.
- Dues allocation and balance calculation.
- CAM advance coverage and partial adjustment behavior.
- Receipt listing and download.
- Receipt number sequencing.
- Finance journal and reports.
- Admin payment list and filters.
- Resident linked-flat and billing-contact authorization.
- Existing notifications.
- Database reset from migration history.

### Required Verification Commands

Before merge:

```text
npm test
npm run lint
npm run typecheck
npm run format:check
npm run build
```

The existing pre-implementation test failure must be corrected before gateway work is used as a non-regression baseline. The payment and settlement test suites added by this project must also be required before merge.

For schema changes:

```text
supabase db reset
supabase migration list --local
supabase db advisors
```

Use the exact commands supported by the installed Supabase CLI version and discover flags through `--help`.

## Rollout Plan

### Phase 0: Confirm The Razorpay Prototype Is Unused

- Back up production database and receipt storage.
- Confirm that no resident checkout ever loaded or called Razorpay.
- Confirm that no production Razorpay merchant credentials or webhook are active.
- Query `payments` for any online rows carrying Razorpay order, payment, or webhook identifiers.
- Query `razorpay_webhook_events` and confirm it contains no real production event.
- Confirm that no receipt, allocation, or journal is tied to a Razorpay identifier.
- Stop cleanup and investigate if any unexpected row exists.

Exit criteria:

- The absence of real Razorpay transactions is documented.
- Backups are verified.
- Razorpay can be removed without migrating financial records.

### Phase 1: Remove The Unused Razorpay Prototype

- Remove Razorpay server routes and signature verification.
- Remove Razorpay runtime config and environment documentation.
- Remove the `razorpay` dependency and regenerate lockfiles.
- Generalize Razorpay-specific audit routing.
- Drop the empty prototype webhook table through a new migration.
- Do not rewrite the previously applied migration file.

Exit criteria:

- No Razorpay executable code, route, dependency, or configuration remains.
- Database reset succeeds through the full migration history.
- The cleanup migration's non-empty-data abort condition is tested.
- Existing manual payments, receipts, and reports remain unchanged.

### Phase 2: Additive Payment Core

- Add provider-neutral schema.
- Create the Easebuzz provider adapter boundary.
- Create unified verified-payment finalization.
- Add gateway-clearing accounts/posting, durable payment-effect jobs, and settlement data structures without changing manual journal behavior.
- Add invariant and idempotency tests.
- Leave resident online payment disabled.

Exit criteria:

- Manual payment regression suite passes.
- Existing payment totals remain unchanged.
- Schema reset and migration verification pass.
- Gateway tables are inaccessible to public roles.
- Online payments remain disabled by default.

### Phase 3: Easebuzz Server Integration

- Add hash utilities.
- Add Initiate Payment integration.
- Add callback and webhook endpoints.
- Add the pinned Transaction V2 integration.
- Add reconciliation.
- Keep the feature flag disabled in production.

Exit criteria:

- Unit and API tests pass.
- Invalid messages cannot verify a payment.
- Repeated events do not duplicate financial effects.
- Every failure category returns the required safe description and retry rule.

### Phase 4: Resident EaseCheckout UI

- Connect both Pay buttons.
- Add the official script loader.
- Add pending verification and recovery UX.
- Add CSP allowlists.
- Validate desktop and mobile behavior.

Exit criteria:

- Resident sandbox flow passes the complete matrix.
- Accessibility and error states are reviewed.
- Browser close/refresh recovery works.
- Pending and failure messages clearly prevent unsafe duplicate payment.

### Phase 5: Controlled Production Pilot

- Confirm Easebuzz merchant onboarding and permitted payment modes.
- Confirm production callback and webhook URLs.
- Configure production credentials and webhooks.
- Configure and approve gateway-clearing, gateway-fee, tax, adjustment, and settlement bank accounts.
- Enable Easebuzz for an internal or limited user allowlist.
- Monitor every pilot payment through Easebuzz settlement and local accounting.
- Import or retrieve each pilot settlement and reconcile gross payments, deductions, and the net bank deposit.
- Disable online payments if a stop-the-line condition occurs; do not fall back to Razorpay.
- Define success and stop-the-line thresholds.

Exit criteria:

- Pilot payments have correct gateway, allocation, receipt, journal, and notification records.
- No unexplained settlement difference exists.
- Gateway clearing equals captured-but-unsettled items and every settled batch has an idempotent settlement journal.
- Pending and failure handling has been exercised.
- Every existing non-regression suite remains green against the production candidate.

### Phase 6: Easebuzz General Availability

- Route all new online payments to Easebuzz.
- Remove the pilot allowlist.
- Continue scheduled reconciliation and invariant monitoring.
- Continue daily settlement import/retrieval, clearing reconciliation, and bank-deposit matching.
- Keep the global online-payments kill switch available.

Exit criteria:

- Easebuzz reliability remains within launch thresholds.
- Manual collection remains available if online payments are disabled.
- All Non-Regression Requirements and Failure Handling acceptance criteria pass.

## Rollback Plan

### Before Easebuzz Is Enabled

- Leave `ONLINE_PAYMENTS_ENABLED=false` if validation fails.
- Continue manual payment workflows.
- Keep additive schema; do not roll it back destructively.

### During Controlled Pilot

- Disable new Easebuzz initiation immediately.
- Reconcile every initiated Easebuzz `txnid`.
- Leave existing attempts and events intact.
- Continue reconciliation, durable payment-effect workers, and settlement processing for already initiated or captured payments.
- Keep manual payment collection available.
- Never route payments to Razorpay.

### After General Availability

- Set `ONLINE_PAYMENTS_ENABLED=false` to stop new checkout initiation.
- Keep Easebuzz callback, webhook, status, and reconciliation handling active for already initiated transactions.
- Keep payment-effect and settlement workers active until every captured transaction, receipt, notification, clearing balance, and settlement is resolved.
- Never delete or rewrite successful Easebuzz payments.
- Continue manual payment collection until the issue is resolved.

Stop-the-line conditions should include:

- Invalid hashes being accepted.
- Duplicate allocations, receipts, or journals.
- Verified amount mismatch.
- Settlement mismatch without explanation.
- Excessive pending-payment age.
- Unrecoverable callback/webhook processing failures.

## Unused Razorpay Prototype Removal Checklist

- [ ] Production database contains no real Razorpay payment or webhook record.
- [ ] No production Razorpay merchant account configuration or webhook is active.
- [ ] Any unused Razorpay test keys are revoked.
- [ ] `server/api/razorpay/orders.post.ts` is removed.
- [ ] `server/api/razorpay/webhook.post.ts` is removed.
- [ ] Razorpay signature utility is removed.
- [ ] Razorpay runtime config is removed from `nuxt.config.ts`.
- [ ] Razorpay validation/config is removed from `server/utils/env.ts`.
- [ ] Razorpay entries are removed from `.env.example`.
- [ ] Razorpay-specific audit path matching is removed or generalized.
- [ ] `razorpay` is removed from `package.json`.
- [ ] `package-lock.json` no longer resolves Razorpay.
- [ ] `deno.lock` no longer resolves Razorpay.
- [ ] Empty prototype webhook table is dropped through a new migration.
- [ ] Production documentation references only Easebuzz.
- [ ] Repository-wide case-insensitive Razorpay search is reviewed.

Applied migration history must not be silently rewritten. If the organization requires zero textual Razorpay references, migration-history re-baselining must be a separate, tested database-recovery project.

## Acceptance Criteria

### Successful Payment

A successful Easebuzz transaction produces exactly:

- One local payment.
- One gateway attempt for the idempotency key.
- One `txnid`.
- One stored `easepayid`.
- One complete financial disposition whose allocations plus permitted advance equal the verified gross amount.
- One receipt number.
- One receipt PDF, eventually.
- One posted gateway-clearing receipt journal.
- One durable receipt-PDF job and one durable notification-enqueue job.
- One resident receipt-ready notification, eventually.

When Easebuzz settles the transaction, it additionally produces exactly one matched settlement item and its share of one idempotent settlement journal without changing the resident's gross receipt amount.

### Verification Integrity

- Browser callback alone cannot mark a payment verified.
- Invalid reverse hash cannot change financial state.
- Amount, merchant key, `txnid`, or local-correlation mismatch cannot verify a payment.
- Transaction API and valid webhook processing converge on the same result.

### Idempotency

- Repeated initiation does not create another charge.
- Duplicate callback/webhook delivery does not duplicate financial work.
- Concurrent callback, webhook, browser verification, and reconciliation do not duplicate financial work.
- Verified payments do not regress because of late events.

### Failure Handling

- Every non-success state has a stable code and plain-language resident description.
- Every failure or pending response states whether retry is allowed.
- Every attempt displays a support reference once a `txnid` exists.
- Network timeout, closed browser, or missing callback is treated as unknown/pending rather than definite failure.
- The UI never states that no debit occurred unless the request was never sent to Easebuzz.
- Pending, failed, and cancelled payments do not reduce dues or enter verified reports.
- A confirmed gateway success with local finalization retry tells the resident not to pay again.
- Receipt or notification failure after payment completion does not change payment status.
- Raw gateway, security, database, and stack-trace details never appear in resident-facing descriptions.
- Manual-review cases are visible to authorized operations users with retry and reconciliation history.

### Functional Preservation

- Manual payments continue to work.
- Cash, cheque, bank transfer, and manually recorded UPI retain their existing validation and authorization.
- Duplicate UTR/reference handling remains unchanged.
- All allocation modes continue to work.
- CAM advance and existing dues calculations remain unchanged.
- Existing receipt history remains available.
- Receipt numbering remains sequential and duplicate-safe.
- Finance journals and reports contain every verified online payment exactly once.
- Manual payments continue to debit their selected bank account directly; online payments debit gateway clearing until settlement.
- Settlement journals explain gross collections, fees, approved taxes, adjustments, and net bank deposits without duplicating income.
- Existing manual-payment journal and report totals do not change after deployment.
- Dues balances update only after verified finalization.
- Authentication, roles, permissions, linked-flat access, notifications, and storage continue to work.
- Disabling online payments leaves all manual-payment and non-payment application functionality available.
- Removing the unused Razorpay prototype does not change any existing manual-payment record.

### Security

- Easebuzz salt is not present in browser bundles, resident APIs, or logs.
- Public Supabase roles cannot access gateway attempts or events.
- Public Supabase roles cannot access payment-effect jobs, settlement headers, or settlement items.
- Raw sensitive callback data is not exposed.
- Callback and webhook hashes use timing-safe verification.

### Final Decommission

The unused Razorpay prototype is considered removed when:

- No Razorpay credential or dashboard webhook is active.
- No Razorpay transaction can be initiated.
- No Razorpay route is active.
- No Razorpay dependency is installed.
- No executable application code imports or calls Razorpay.
- Existing manual-payment and financial data remains intact.

## Risks And Mitigations

| Risk                                               | Impact                                 | Mitigation                                                                                 |
| -------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------ |
| Browser reports success but server cannot confirm  | Resident uncertainty or false credit   | Show pending; verify using webhook and Transaction API                                     |
| Duplicate initiation                               | Multiple charges                       | Durable local attempt and stable `txnid` before external call                              |
| Duplicate/out-of-order events                      | Duplicate or regressed accounting      | Event fingerprint, row locks, monotonic state machine                                      |
| Process failure during finalization                | Partial payment state                  | One atomic database finalizer plus retryable post-commit work                              |
| Missing finance journal                            | Reporting mismatch                     | Include the gateway-clearing journal in the unified finalizer                              |
| Gateway capture posted directly to bank            | Bank and cash balances overstated      | Debit gateway clearing at capture; debit bank only at settlement                           |
| Settlement fees/taxes netted from resident receipt | Incorrect resident credit or income    | Credit the resident at gross and post deductions only in settlement accounting             |
| Lost receipt/notification follow-up after commit   | Verified payment lacks expected output | Create durable effect jobs in the finalization transaction                                 |
| Dues change while checkout is open                 | Captured amount cannot follow preview  | Recompute under lock and apply the documented allocation-drift policy                      |
| Lost initiation response/access key                | Duplicate checkout or stranded attempt | Stable `txnid`, fingerprinted idempotency, bounded access-key recovery, and reconciliation |
| Webhook outage                                     | Delayed verification                   | Scheduled Transaction API reconciliation                                                   |
| Sensitive payload exposure                         | Privacy/security incident              | RLS, privilege revocation, redaction, retention, safe logging                              |
| Easebuzz launch failure                            | Payment outage                         | Feature flag, controlled pilot, manual-payment continuity                                  |
| Misleading failure description                     | Resident retries an uncertain payment  | Stable failure taxonomy, retry flag, reference, reconciliation                             |
| Regression in existing payment/accounting flows    | Incorrect dues, receipts, or reports   | Mandatory snapshot comparison and full non-regression gate                                 |
| Unexpected Razorpay prototype data                 | Accidental data loss during cleanup    | Query and investigate before dropping provider-specific data                               |
| Refund without accounting reversal                 | Incorrect dues and ledger              | Separate audited refund/reversal workflow                                                  |

## Operational Decisions Required Before Implementation

- Easebuzz merchant key and salt for sandbox and production.
- The exact merchant-approved Transaction V2 endpoint, fields, hashes, statuses, and redacted sandbox fixtures.
- Approved production `surl`, `furl`, and webhook URLs.
- Payment modes enabled in the Easebuzz account.
- Confirmed access-key lifetime and same-`txnid` re-initiation/recovery behavior.
- Stop-the-line thresholds for success rate, pending age, and settlement mismatch.
- Gateway-event payload retention period.
- Approved Easebuzz clearing, fee-expense, tax, adjustment, and settlement bank accounts.
- Approved tax treatment for Easebuzz fees and settlement deductions.
- Settlement source (API or protected statement import), expected settlement timing, and daily reconciliation owner.
- Approved online journal system-actor/posting-source model.
- Refund automation scope and accounting reversal policy.
- Owner for daily reconciliation during the pilot and general-availability launch.
- Whether the first pilot is user-allowlisted, society-wide during a maintenance window, or both.

## References

- [Easebuzz integration overview](https://docs.easebuzz.in/#integrations-section)
- [EaseCheckout iframe integration](https://docs.easebuzz.in/docs/payment-gateway/7zfogdgdwb9c8-i-frame-integration-ease-checkout)
- [Easebuzz Initiate Payment API](https://docs.easebuzz.in/docs/payment-gateway/8ec545c331e6f-initiate-payment-api)
- [Easebuzz Transaction Webhook](https://docs.easebuzz.in/docs/payment-gateway/paw9n1qc3kuoz-transaction-webhook)
- [Easebuzz webhook overview](https://docs.easebuzz.in/docs/payment-gateway/587zy3v064so6-what-are-webhooks)
- [Easebuzz testing credentials](https://docs.easebuzz.in/docs/payment-gateway/wlt03odp7gzk5-testing-credentials)
- [Easebuzz go-live steps](https://docs.easebuzz.in/docs/payment-gateway/hjcp8ib4tgx0s-go-live-steps)
- [Official Easebuzz integration kit](https://github.com/easebuzz/paywitheasebuzz-php-lib)
- [Supabase Data API security](https://supabase.com/docs/guides/api/securing-your-api)
- [Supabase Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security)
