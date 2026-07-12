update public.amenities
set booking_rules = jsonb_set(
      coalesce(booking_rules, '{}'::jsonb),
      '{minimumLeadHours}',
      '0'::jsonb,
      true
    ),
    updated_at = now()
where not (coalesce(booking_rules, '{}'::jsonb) ? 'minimumLeadHours')
  or booking_rules->>'minimumLeadHours' = '24';

with amenity_defaults as (
  select
    '{
      "monday": [{"start": "09:00", "end": "22:00"}],
      "tuesday": [{"start": "09:00", "end": "22:00"}],
      "wednesday": [{"start": "09:00", "end": "22:00"}],
      "thursday": [{"start": "09:00", "end": "22:00"}],
      "friday": [{"start": "09:00", "end": "22:00"}],
      "saturday": [{"start": "09:00", "end": "23:00"}],
      "sunday": [{"start": "09:00", "end": "23:00"}]
    }'::jsonb as operating_hours,
    '{
      "minDurationMinutes": 60,
      "maxDurationMinutes": 240,
      "slotIntervalMinutes": 30,
      "minimumLeadHours": 0,
      "maximumAdvanceDays": 60,
      "cancellationCutoffHours": 24
    }'::jsonb as booking_rules,
    'Bookings require society approval. Residents must follow amenity timing, guest, cleanliness, and noise rules.'::text as rules_text
),
amenity_seed(code, name, description, location, capacity) as (
  values
    (
      'THEATRE',
      'Theatre',
      'Theatre room for movie screenings, presentations, and society-approved resident events.',
      'Theatre',
      30
    ),
    (
      'CARROM_ROOM',
      'Carrom Room',
      'Indoor carrom room for resident recreation and small group play.',
      'Carrom Room',
      12
    ),
    (
      'POOL_ROOM',
      'Pool Room',
      'Pool table room for resident recreation and approved guest play.',
      'Pool Room',
      12
    )
)
insert into public.amenities (
  society_id,
  code,
  name,
  description,
  location,
  capacity,
  is_active,
  is_bookable,
  requires_approval,
  operating_hours,
  booking_rules,
  rules_text
)
select
  sp.id,
  seed.code,
  seed.name,
  seed.description,
  seed.location,
  seed.capacity,
  true,
  true,
  true,
  defaults.operating_hours,
  defaults.booking_rules,
  defaults.rules_text
from public.society_profile sp
cross join amenity_defaults defaults
cross join amenity_seed seed
on conflict do nothing;
