-- Resident statistics only read resident-visible requests. Partial indexes keep
-- the reporting paths small without increasing write cost for internal tickets.
create index if not exists service_requests_resident_created_idx
  on service_requests (society_id, created_at)
  where visibility = 'RESIDENT_VISIBLE';

create index if not exists service_requests_resident_resolved_idx
  on service_requests (society_id, resolved_at)
  where visibility = 'RESIDENT_VISIBLE' and resolved_at is not null;

create index if not exists service_requests_resident_closed_idx
  on service_requests (society_id, closed_at)
  where visibility = 'RESIDENT_VISIBLE' and closed_at is not null;

create index if not exists service_requests_resident_reopened_idx
  on service_requests (society_id, reopened_at)
  where visibility = 'RESIDENT_VISIBLE' and reopened_at is not null;

create index if not exists service_requests_resident_active_due_idx
  on service_requests (society_id, status, due_by_at)
  where visibility = 'RESIDENT_VISIBLE'
    and status in (
      'OPEN',
      'ASSIGNED',
      'ACKNOWLEDGED',
      'IN_PROGRESS',
      'ON_HOLD',
      'REOPENED',
      'NEEDS_REASSIGNMENT'
    );
