do $$
declare
  v_password_hash constant text := '80422bebafce1c67b5d66eecd3b71988:53d879946dbd6816c6bb41112da91eb2683c48246129f3406ed9df79b1740e08b415ae14662095ee02f09741f9c442eb532afb646443d4efe537d752fcf9e92c';
begin
  insert into society_profile (
    id,
    code,
    name,
    registration_number,
    address_line_1,
    city,
    state,
    pincode,
    contact_email,
    contact_phone,
    timezone,
    settings
  )
  values (
    '11111111-1111-1111-1111-111111111111',
    'AJOWA',
    'AJOWA Society',
    'AJOWA-REG-001',
    'AJOWA Main Office',
    'Mohali',
    'Punjab',
    '160055',
    'admin@ajowa.local',
    '+919999999999',
    'Asia/Kolkata',
    jsonb_build_object(
      'signup', jsonb_build_object('controlled', true),
      'tenantPaymentPerFlat', true,
      'familyAccess', true,
      'advanceCredit', true,
      'financeApprovalRequired', true,
      'attachmentsRequired', true,
      'highValueConfirmation', true,
      'ticketClosureRequiresReview', true,
      'managerBroadcastScope', 'CONFIGURABLE'
    )
  )
  on conflict (id) do update
    set code = excluded.code,
        name = excluded.name,
        registration_number = excluded.registration_number,
        address_line_1 = excluded.address_line_1,
        city = excluded.city,
        state = excluded.state,
        pincode = excluded.pincode,
        contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone,
        timezone = excluded.timezone,
        settings = excluded.settings;

  insert into auth_users (id, name, email, email_verified, created_at, updated_at)
  values
    ('20000000-0000-0000-0000-000000000001', 'AJOWA Admin', 'admin@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000002', 'AJOWA Manager', 'manager@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000003', 'Aarav Owner', 'owner1@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000004', 'Anaya Co-Owner', 'owner2@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000005', 'Rohan Tenant', 'tenant@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000006', 'Ishita Family', 'family@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000007', 'Gate Guard', 'guard@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000008', 'Electric Staff', 'service1@ajowa.local', true, now(), now()),
    ('20000000-0000-0000-0000-000000000009', 'Housekeeping Staff', 'service2@ajowa.local', true, now(), now())
  on conflict (id) do update
    set name = excluded.name,
        email = excluded.email,
        email_verified = excluded.email_verified,
        updated_at = now();

  insert into auth_accounts (id, account_id, provider_id, user_id, password, created_at, updated_at)
  values
    ('21000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'credential', '20000000-0000-0000-0000-000000000001', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'credential', '20000000-0000-0000-0000-000000000002', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', 'credential', '20000000-0000-0000-0000-000000000003', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000004', 'credential', '20000000-0000-0000-0000-000000000004', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000005', 'credential', '20000000-0000-0000-0000-000000000005', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000006', 'credential', '20000000-0000-0000-0000-000000000006', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000007', 'credential', '20000000-0000-0000-0000-000000000007', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000008', 'credential', '20000000-0000-0000-0000-000000000008', v_password_hash, now(), now()),
    ('21000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000009', 'credential', '20000000-0000-0000-0000-000000000009', v_password_hash, now(), now())
  on conflict (id) do update
    set password = excluded.password,
        updated_at = now();

  insert into users (
    id,
    society_id,
    auth_user_id,
    role,
    full_name,
    email,
    mobile_number,
    whatsapp_number,
    can_login,
    must_change_password,
    email_verified,
    is_active,
    kyc_status,
    police_verification_status,
    preferred_notification_channels
  )
  values
    ('30000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000001', 'ADMIN', 'AJOWA Admin', 'admin@ajowa.local', '+919999999991', '+919999999991', true, true, true, true, 'VERIFIED', 'NOT_REQUIRED', 'ALL_CHANNELS'),
    ('30000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000002', 'MANAGER', 'AJOWA Manager', 'manager@ajowa.local', '+919999999992', '+919999999992', true, true, true, true, 'VERIFIED', 'NOT_REQUIRED', 'PUSH_EMAIL_WHATSAPP'),
    ('30000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000003', 'RESIDENT', 'Aarav Owner', 'owner1@ajowa.local', '+919999999993', '+919999999993', true, true, true, true, 'VERIFIED', 'NOT_REQUIRED', 'ALL_CHANNELS'),
    ('30000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000004', 'RESIDENT', 'Anaya Co-Owner', 'owner2@ajowa.local', '+919999999994', '+919999999994', true, true, true, true, 'VERIFIED', 'NOT_REQUIRED', 'PUSH_AND_EMAIL'),
    ('30000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000005', 'RESIDENT', 'Rohan Tenant', 'tenant@ajowa.local', '+919999999995', '+919999999995', true, true, true, true, 'PENDING', 'PENDING', 'ALL_CHANNELS'),
    ('30000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000006', 'RESIDENT', 'Ishita Family', 'family@ajowa.local', '+919999999996', '+919999999996', true, true, true, true, 'NOT_REQUIRED', 'NOT_REQUIRED', 'PUSH_AND_EMAIL'),
    ('30000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000007', 'GUARD', 'Gate Guard', 'guard@ajowa.local', '+919999999997', '+919999999997', true, true, true, true, 'NOT_REQUIRED', 'NOT_REQUIRED', 'PUSH'),
    ('30000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000008', 'SERVICE_STAFF', 'Electric Staff', 'service1@ajowa.local', '+919999999998', '+919999999998', true, true, true, true, 'NOT_REQUIRED', 'NOT_REQUIRED', 'PUSH_AND_EMAIL'),
    ('30000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', '20000000-0000-0000-0000-000000000009', 'SERVICE_STAFF', 'Housekeeping Staff', 'service2@ajowa.local', '+919999999989', '+919999999989', true, true, true, true, 'NOT_REQUIRED', 'NOT_REQUIRED', 'PUSH_AND_EMAIL')
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
        email = excluded.email,
        mobile_number = excluded.mobile_number,
        whatsapp_number = excluded.whatsapp_number,
        can_login = excluded.can_login,
        must_change_password = excluded.must_change_password,
        email_verified = excluded.email_verified,
        is_active = excluded.is_active,
        kyc_status = excluded.kyc_status,
        police_verification_status = excluded.police_verification_status,
        preferred_notification_channels = excluded.preferred_notification_channels,
        updated_at = now();

  insert into blocks (id, society_id, code, name, sort_order)
  values
    ('40000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'A', 'A Wing', 1),
    ('40000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'B', 'B Wing', 2)
  on conflict (id) do update
    set code = excluded.code,
        name = excluded.name,
        sort_order = excluded.sort_order,
        updated_at = now();

  insert into flats (id, society_id, block_id, flat_number, floor_label, unit_type, area_sq_ft, occupancy_status)
  values
    ('41000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'A-101', '1', '2BHK', 1250.00, 'SELF_OCCUPIED'),
    ('41000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000001', 'A-302', '3', '3BHK', 1540.00, 'TENANTED'),
    ('41000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000002', 'B-204', '2', '2BHK', 1180.00, 'SELF_OCCUPIED'),
    ('41000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '40000000-0000-0000-0000-000000000002', 'B-501', '5', 'Shop', 860.00, 'SELF_OCCUPIED')
  on conflict (id) do update
    set flat_number = excluded.flat_number,
        floor_label = excluded.floor_label,
        unit_type = excluded.unit_type,
        area_sq_ft = excluded.area_sq_ft,
        occupancy_status = excluded.occupancy_status,
        updated_at = now();

  -- Seed Tower 1 to 12 blocks and flats
  declare
    v_society_id uuid := '11111111-1111-1111-1111-111111111111';
    v_block_id uuid;
    v_tower_num integer;
    v_floor_num integer;
    v_flat_num integer;
    v_flat_number text;
    v_floor_label text;
    v_unit_type text;
    v_area numeric;
  begin
    for v_tower_num in 1..12 loop
      insert into blocks (id, society_id, code, name, sort_order)
      values (
        ('40000000-0000-0000-0000-000000000' || lpad(v_tower_num::text, 3, '0'))::uuid,
        v_society_id,
        'T' || v_tower_num,
        'Tower ' || v_tower_num,
        v_tower_num + 2
      )
      on conflict (id) do update
        set code = excluded.code,
            name = excluded.name,
            sort_order = excluded.sort_order,
            updated_at = now()
      returning id into v_block_id;

      if v_tower_num <= 6 then
        for v_floor_num in 1..14 loop
          v_floor_label := v_floor_num::text;
          for v_flat_num in 1..4 loop
            v_flat_number := 'T' || v_tower_num || '-' || (v_floor_num * 100 + v_flat_num)::text;
            
            if v_flat_num % 2 = 1 then
              v_unit_type := '2BHK';
              v_area := 1250.00;
            else
              v_unit_type := '3BHK';
              v_area := 1600.00;
            end if;

            insert into flats (
              id,
              society_id,
              block_id,
              flat_number,
              floor_label,
              unit_type,
              area_sq_ft,
              occupancy_status
            )
            values (
              ('41000000-0000-0000-' || lpad(v_tower_num::text, 4, '0') || '-' || lpad((v_floor_num * 100 + v_flat_num)::text, 12, '0'))::uuid,
              v_society_id,
              v_block_id,
              v_flat_number,
              v_floor_label,
              v_unit_type,
              v_area,
              'VACANT'
            )
            on conflict (block_id, flat_number) do update
              set floor_label = excluded.floor_label,
                  unit_type = excluded.unit_type,
                  area_sq_ft = excluded.area_sq_ft,
                  updated_at = now();
          end loop;
        end loop;
      else
        for v_floor_num in 1..9 loop
          v_floor_label := v_floor_num::text;
          for v_flat_num in 1..4 loop
            v_flat_number := 'T' || v_tower_num || '-' || (v_floor_num * 100 + v_flat_num)::text;
            
            if v_flat_num % 2 = 1 then
              v_unit_type := '2BHK';
              v_area := 1250.00;
            else
              v_unit_type := '3BHK';
              v_area := 1600.00;
            end if;

            insert into flats (
              id,
              society_id,
              block_id,
              flat_number,
              floor_label,
              unit_type,
              area_sq_ft,
              occupancy_status
            )
            values (
              ('41000000-0000-0000-' || lpad(v_tower_num::text, 4, '0') || '-' || lpad((v_floor_num * 100 + v_flat_num)::text, 12, '0'))::uuid,
              v_society_id,
              v_block_id,
              v_flat_number,
              v_floor_label,
              v_unit_type,
              v_area,
              'VACANT'
            )
            on conflict (block_id, flat_number) do update
              set floor_label = excluded.floor_label,
                  unit_type = excluded.unit_type,
                  area_sq_ft = excluded.area_sq_ft,
                  updated_at = now();
          end loop;
        end loop;
      end if;
    end loop;
  end;

  insert into flat_residents (
    id,
    flat_id,
    user_id,
    relationship_type,
    is_primary_contact,
    is_billing_contact,
    can_login,
    is_active,
    ownership_start_date,
    lease_start_date,
    lease_end_date,
    occupancy_status,
    access_scope
  )
  values
    ('42000000-0000-0000-0000-000000000001', '41000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', 'OWNER', true, true, true, true, '2024-01-01', null, null, 'SELF_OCCUPIED', 'OWNERSHIP'),
    ('42000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000004', 'OWNER', true, true, true, true, '2024-01-01', null, null, 'SELF_OCCUPIED', 'OWNERSHIP'),
    ('42000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000006', 'FAMILY_MEMBER', false, false, true, true, null, null, null, 'SELF_OCCUPIED', 'HOUSEHOLD'),
    ('42000000-0000-0000-0000-000000000004', '41000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000003', 'OWNER', false, true, true, true, '2023-06-01', null, null, 'TENANTED', 'OWNERSHIP'),
    ('42000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', 'TENANT', true, false, true, true, null, '2026-04-01', '2027-03-31', 'TENANTED', 'TENANCY')
  on conflict (id) do update
    set is_primary_contact = excluded.is_primary_contact,
        is_billing_contact = excluded.is_billing_contact,
        can_login = excluded.can_login,
        is_active = excluded.is_active,
        ownership_start_date = excluded.ownership_start_date,
        lease_start_date = excluded.lease_start_date,
        lease_end_date = excluded.lease_end_date,
        occupancy_status = excluded.occupancy_status,
        access_scope = excluded.access_scope,
        updated_at = now();

  insert into billing_periods (id, society_id, label, frequency, start_date, end_date, due_date, is_locked)
  values
    ('43000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'May 2026', 'MONTHLY', '2026-05-01', '2026-05-31', '2026-05-10', true),
    ('43000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'June 2026', 'MONTHLY', '2026-06-01', '2026-06-30', '2026-06-10', false),
    ('43000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'July 2026', 'MONTHLY', '2026-07-01', '2026-07-31', '2026-07-10', false)
  on conflict (id) do update
    set label = excluded.label,
        frequency = excluded.frequency,
        start_date = excluded.start_date,
        end_date = excluded.end_date,
        due_date = excluded.due_date,
        is_locked = excluded.is_locked,
        updated_at = now();

  insert into maintenance_charges (
    id,
    society_id,
    billing_period_id,
    scope,
    flat_type,
    flat_id,
    charge_name,
    amount,
    charge_breakdown
  )
  values
    ('44000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000002', 'FLAT_TYPE', '2BHK', null, 'Monthly CAM - 2BHK', 2500.00, '[{"label":"CAM Charges","amount":2500}]'::jsonb),
    ('44000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000002', 'FLAT_TYPE', '3BHK', null, 'Monthly CAM - 3BHK', 3200.00, '[{"label":"CAM Charges","amount":3200}]'::jsonb),
    ('44000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000003', 'FLAT_TYPE', '2BHK', null, 'Monthly CAM - 2BHK', 2500.00, '[{"label":"CAM Charges","amount":2500}]'::jsonb),
    ('44000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000003', 'FLAT_TYPE', '3BHK', null, 'Monthly CAM - 3BHK', 3200.00, '[{"label":"CAM Charges","amount":3200}]'::jsonb)
  on conflict (id) do update
    set amount = excluded.amount,
        charge_breakdown = excluded.charge_breakdown,
        updated_at = now();

  insert into maintenance_dues (
    id,
    society_id,
    billing_period_id,
    flat_id,
    due_date,
    base_amount,
    late_fee_amount,
    waived_amount,
    paid_amount,
    total_amount,
    balance_amount,
    status,
    charge_breakdown
  )
  values
    ('45000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000001', '2026-06-10', 2500.00, 0.00, 0.00, 2500.00, 2500.00, 0.00, 'PAID', '[{"label":"CAM Charges","amount":2500}]'::jsonb),
    ('45000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000002', '41000000-0000-0000-0000-000000000002', '2026-06-10', 3200.00, 0.00, 0.00, 1000.00, 3200.00, 2200.00, 'PARTIALLY_PAID', '[{"label":"CAM Charges","amount":3200}]'::jsonb),
    ('45000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', '2026-07-10', 2500.00, 0.00, 0.00, 0.00, 2500.00, 2500.00, 'OPEN', '[{"label":"CAM Charges","amount":2500}]'::jsonb),
    ('45000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', '43000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000002', '2026-07-10', 3200.00, 0.00, 0.00, 0.00, 3200.00, 3200.00, 'OPEN', '[{"label":"CAM Charges","amount":3200}]'::jsonb)
  on conflict (id) do update
    set paid_amount = excluded.paid_amount,
        total_amount = excluded.total_amount,
        balance_amount = excluded.balance_amount,
        status = excluded.status,
        updated_at = now();

  insert into payments (
    id,
    society_id,
    payer_user_id,
    received_for_flat_id,
    mode,
    status,
    payment_date,
    amount,
    late_fee_component,
    utr_reference,
    bank_reference,
    is_default_utr,
    receipt_number,
    notes,
    verified_by_user_id,
    verified_at
  )
  values
    ('46000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', 'BANK_TRANSFER', 'VERIFIED', '2026-06-08', 2500.00, 0.00, 'UTR-JUN-0001', 'BANK-REF-0001', true, 'AJOWA-2026-00001', 'June due settled in full', '30000000-0000-0000-0000-000000000001', now()),
    ('46000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000005', '41000000-0000-0000-0000-000000000002', 'UPI', 'VERIFIED', '2026-06-12', 1500.00, 0.00, 'UTR-JUN-0002', 'UPI-REF-0002', true, 'AJOWA-2026-00002', 'Partial payment for tenanted flat', '30000000-0000-0000-0000-000000000002', now())
  on conflict (id) do update
    set status = excluded.status,
        amount = excluded.amount,
        receipt_number = excluded.receipt_number,
        notes = excluded.notes,
        updated_at = now();

  insert into payment_allocations (id, payment_id, maintenance_due_id, allocated_amount, allocation_order)
  values
    ('47000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000001', '45000000-0000-0000-0000-000000000001', 2500.00, 1),
    ('47000000-0000-0000-0000-000000000002', '46000000-0000-0000-0000-000000000002', '45000000-0000-0000-0000-000000000002', 1000.00, 1)
  on conflict (id) do update
    set allocated_amount = excluded.allocated_amount,
        allocation_order = excluded.allocation_order;

  insert into resident_advance_credits (
    id,
    society_id,
    user_id,
    flat_id,
    source_payment_id,
    original_amount,
    current_balance,
    status,
    notes
  )
  values
    ('48000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', '46000000-0000-0000-0000-000000000001', 500.00, 500.00, 'ACTIVE', 'Sample advance credit balance')
  on conflict (id) do update
    set current_balance = excluded.current_balance,
        status = excluded.status,
        notes = excluded.notes,
        updated_at = now();

  insert into resident_advance_credit_history (id, credit_id, action, amount, payment_id, actor_user_id, notes)
  values
    ('49000000-0000-0000-0000-000000000001', '48000000-0000-0000-0000-000000000001', 'CREATED', 500.00, '46000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'Seeded demo advance credit')
  on conflict (id) do nothing;

  insert into user_access_status (
    id,
    society_id,
    user_id,
    billing_period_id,
    is_access_granted,
    access_basis,
    unpaid_flat_numbers,
    total_flats,
    total_paid_flats,
    total_unpaid_flats,
    total_due_all_flats,
    total_paid_all_flats,
    total_balance_all_flats
  )
  values
    ('50000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000002', false, 'OWNERSHIP', array['A-302'], 2, 1, 1, 5700.00, 3500.00, 2200.00),
    ('50000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000005', '43000000-0000-0000-0000-000000000002', false, 'TENANCY', array['A-302'], 1, 0, 1, 3200.00, 1000.00, 2200.00)
  on conflict (id) do update
    set is_access_granted = excluded.is_access_granted,
        unpaid_flat_numbers = excluded.unpaid_flat_numbers,
        total_balance_all_flats = excluded.total_balance_all_flats,
        updated_at = now();

  insert into access_tokens (
    id,
    society_id,
    user_id,
    billing_period_id,
    token_hash,
    qr_payload,
    status,
    is_valid,
    generated_at
  )
  values
    ('51000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000003', '43000000-0000-0000-0000-000000000001', encode(digest('owner-june-paid', 'sha256'), 'hex'), '{"flatNumbers":["A-101"],"period":"May 2026"}'::jsonb, 'ACTIVE', true, now()),
    ('51000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', '30000000-0000-0000-0000-000000000005', '43000000-0000-0000-0000-000000000002', encode(digest('tenant-june-blocked', 'sha256'), 'hex'), '{"flatNumbers":["A-302"],"period":"June 2026"}'::jsonb, 'REVOKED', false, now())
  on conflict (id) do update
    set status = excluded.status,
        is_valid = excluded.is_valid,
        qr_payload = excluded.qr_payload,
        updated_at = now();

  insert into account_heads (id, society_id, parent_id, code, name, head_type, is_system, allows_manual_entries)
  values
    ('60000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'AST-CASH', 'Cash in Hand', 'ASSET', true, true),
    ('60000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', null, 'AST-BANK', 'Bank Account', 'ASSET', true, true),
    ('60000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', null, 'INC-MAINT', 'Maintenance Income', 'INCOME', true, true),
    ('60000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', null, 'INC-LATEFEE', 'Late Fee Income', 'INCOME', true, true),
    ('60000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', null, 'EXP-GENERAL', 'General Expense', 'EXPENSE', true, true)
  on conflict (id) do update
    set name = excluded.name,
        head_type = excluded.head_type,
        updated_at = now();

  insert into society_bank_accounts (
    id,
    society_id,
    account_head_id,
    bank_name,
    account_name,
    account_number,
    ifsc_code,
    branch_name,
    upi_id,
    opening_balance,
    is_default
  )
  values
    ('61000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', '60000000-0000-0000-0000-000000000002', 'Punjab National Bank', 'AJOWA Society Main Account', '000123456789', 'PUNB0000123', 'Mohali', 'ajowa@upi', 150000.00, true)
  on conflict (id) do update
    set bank_name = excluded.bank_name,
        account_name = excluded.account_name,
        opening_balance = excluded.opening_balance,
        is_default = excluded.is_default,
        updated_at = now();

  insert into transaction_categories (
    code,
    society_id,
    name,
    transaction_type,
    category_group,
    account_head_id,
    requires_attachment,
    is_system
  )
  values
    ('EXP-UTL-001', '11111111-1111-1111-1111-111111111111', 'Diesel Expenses - DG Set', 'EXPENSE', 'Utilities', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-UTL-002', '11111111-1111-1111-1111-111111111111', 'Electricity Expenses - PSPCL', 'EXPENSE', 'Utilities', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-UTL-003', '11111111-1111-1111-1111-111111111111', 'Restaurant Electricity Bill', 'EXPENSE', 'Utilities', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-UTL-004', '11111111-1111-1111-1111-111111111111', 'Vegetable Shop Electricity Bill', 'EXPENSE', 'Utilities', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-UTL-005', '11111111-1111-1111-1111-111111111111', 'Iron Press Vendor Electricity Bill', 'EXPENSE', 'Utilities', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-STF-001', '11111111-1111-1111-1111-111111111111', 'Housekeeping Expenses', 'EXPENSE', 'Staff & Services', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-STF-002', '11111111-1111-1111-1111-111111111111', 'Security Expenses', 'EXPENSE', 'Staff & Services', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-STF-003', '11111111-1111-1111-1111-111111111111', 'Salary Expenses', 'EXPENSE', 'Staff & Services', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-STF-004', '11111111-1111-1111-1111-111111111111', 'MyGate Services Expenses', 'EXPENSE', 'Staff & Services', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-STF-005', '11111111-1111-1111-1111-111111111111', 'Park Plus Expenses', 'EXPENSE', 'Staff & Services', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-AMC-001', '11111111-1111-1111-1111-111111111111', 'JLPL Bill CAM Water Sewarage', 'EXPENSE', 'Maintenance & AMC', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-AMC-002', '11111111-1111-1111-1111-111111111111', 'Maintenance Expenses', 'EXPENSE', 'Maintenance & AMC', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-AMC-003', '11111111-1111-1111-1111-111111111111', 'AMC Schindler Elevators', 'EXPENSE', 'Maintenance & AMC', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-AMC-004', '11111111-1111-1111-1111-111111111111', 'AMC Kone Elevators', 'EXPENSE', 'Maintenance & AMC', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-PRO-001', '11111111-1111-1111-1111-111111111111', 'CA Service Charges', 'EXPENSE', 'Professional', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-PRO-002', '11111111-1111-1111-1111-111111111111', 'Legal Services Expenses', 'EXPENSE', 'Professional', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-ADM-001', '11111111-1111-1111-1111-111111111111', 'Office Expenses', 'EXPENSE', 'Admin & Office', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-ADM-002', '11111111-1111-1111-1111-111111111111', 'Bank Charges', 'EXPENSE', 'Admin & Office', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-ADM-003', '11111111-1111-1111-1111-111111111111', 'Imprest Advance', 'EXPENSE', 'Admin & Office', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-ADM-004', '11111111-1111-1111-1111-111111111111', 'Imprest Advance FY Closure', 'EXPENSE', 'Admin & Office', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-ADM-005', '11111111-1111-1111-1111-111111111111', 'Club House Security FFSLLP Refund', 'EXPENSE', 'Admin & Office', '60000000-0000-0000-0000-000000000005', true, true),
    ('EXP-EVT-001', '11111111-1111-1111-1111-111111111111', 'Festival Expenses', 'EXPENSE', 'Events', '60000000-0000-0000-0000-000000000005', true, true),
    ('INC-MNT-001', '11111111-1111-1111-1111-111111111111', 'CAM Charges', 'INCOME', 'Maintenance', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MNT-002', '11111111-1111-1111-1111-111111111111', 'DG Set Backup Charges', 'INCOME', 'Maintenance', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MNT-003', '11111111-1111-1111-1111-111111111111', 'DG Set Automatic Changeover', 'INCOME', 'Maintenance', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-FAC-001', '11111111-1111-1111-1111-111111111111', 'Club House Charges', 'INCOME', 'Facility', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-FAC-002', '11111111-1111-1111-1111-111111111111', 'Restaurant Rent', 'INCOME', 'Facility', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-FAC-003', '11111111-1111-1111-1111-111111111111', 'Vegetable Shop Rent', 'INCOME', 'Facility', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-FAC-004', '11111111-1111-1111-1111-111111111111', 'Parking Commission', 'INCOME', 'Facility', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-FAC-005', '11111111-1111-1111-1111-111111111111', 'RFID Tags', 'INCOME', 'Facility', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MOV-001', '11111111-1111-1111-1111-111111111111', 'Move In-Out Facilitation Charges', 'INCOME', 'Move & Restoration', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MOV-002', '11111111-1111-1111-1111-111111111111', 'Restoration Charges', 'INCOME', 'Move & Restoration', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MSC-001', '11111111-1111-1111-1111-111111111111', 'Scrap', 'INCOME', 'Miscellaneous', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MSC-002', '11111111-1111-1111-1111-111111111111', 'Festival Contribution', 'INCOME', 'Miscellaneous', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MSC-003', '11111111-1111-1111-1111-111111111111', 'Penalty Violation Society Guidelines', 'INCOME', 'Miscellaneous', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-MSC-004', '11111111-1111-1111-1111-111111111111', 'Recovery from Builder Shed Inst', 'INCOME', 'Miscellaneous', '60000000-0000-0000-0000-000000000003', false, true),
    ('INC-SUS-001', '11111111-1111-1111-1111-111111111111', 'Suspense', 'INCOME', 'Suspense', '60000000-0000-0000-0000-000000000003', false, true)
  on conflict (code) do update
    set name = excluded.name,
        transaction_type = excluded.transaction_type,
        category_group = excluded.category_group,
        account_head_id = excluded.account_head_id,
        requires_attachment = excluded.requires_attachment,
        is_system = excluded.is_system,
        updated_at = now();

  insert into service_departments (id, society_id, code, name, description, allows_queue_visibility)
  values
    ('70000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PLUMBING', 'Plumbing', 'Water, leak, and sanitary issues', true),
    ('70000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'ELECTRICAL', 'Electrical', 'Power, fixtures, and wiring issues', true),
    ('70000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'HOUSEKEEPING', 'Housekeeping', 'Cleaning and common-area upkeep', true),
    ('70000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'SECURITY', 'Security', 'Guarding and access complaints', true),
    ('70000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'LIFT', 'Lift', 'Lift and vertical transport issues', true),
    ('70000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'CIVIL', 'Civil / Maintenance', 'Civil, structural, and repair work', true)
  on conflict (id) do update
    set code = excluded.code,
        name = excluded.name,
        description = excluded.description,
        allows_queue_visibility = excluded.allows_queue_visibility,
        updated_at = now();

  insert into service_staff_assignments (id, department_id, user_id, is_primary, is_active)
  values
    ('71000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000008', true, true),
    ('71000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000009', true, true)
  on conflict (id) do update
    set is_primary = excluded.is_primary,
        is_active = excluded.is_active,
        updated_at = now();

  insert into service_category_routes (
    id,
    society_id,
    category_key,
    category_label,
    location_type,
    department_id,
    default_priority
  )
  values
    ('72000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'PLUMBING', 'Plumbing', 'FLAT', '70000000-0000-0000-0000-000000000001', 'MEDIUM'),
    ('72000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'ELECTRICAL', 'Electrical', 'FLAT', '70000000-0000-0000-0000-000000000002', 'MEDIUM'),
    ('72000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'CLEANING', 'Cleaning', 'COMMON_AREA', '70000000-0000-0000-0000-000000000003', 'MEDIUM'),
    ('72000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'HOUSEKEEPING', 'Housekeeping', 'COMMON_AREA', '70000000-0000-0000-0000-000000000003', 'MEDIUM'),
    ('72000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'SECURITY', 'Security', 'COMMON_AREA', '70000000-0000-0000-0000-000000000004', 'HIGH'),
    ('72000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'LIFT', 'Lift', 'SOCIETY_ASSET', '70000000-0000-0000-0000-000000000005', 'EMERGENCY'),
    ('72000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'CIVIL', 'Civil', 'COMMON_AREA', '70000000-0000-0000-0000-000000000006', 'MEDIUM'),
    ('72000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'OTHER', 'Other', null, '70000000-0000-0000-0000-000000000006', 'LOW')
  on conflict (id) do update
    set department_id = excluded.department_id,
        default_priority = excluded.default_priority,
        updated_at = now();

  insert into service_sla_rules (
    id,
    society_id,
    department_id,
    priority,
    acknowledge_within_minutes,
    resolve_within_minutes,
    is_active
  )
  values
    ('73000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', null, 'LOW', 240, 7200, true),
    ('73000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', null, 'MEDIUM', 120, 2880, true),
    ('73000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', null, 'HIGH', 60, 720, true),
    ('73000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', null, 'EMERGENCY', 15, 240, true)
  on conflict (id) do update
    set acknowledge_within_minutes = excluded.acknowledge_within_minutes,
        resolve_within_minutes = excluded.resolve_within_minutes,
        is_active = excluded.is_active,
        updated_at = now();

  insert into service_requests (
    id,
    society_id,
    request_number,
    requester_user_id,
    flat_id,
    department_id,
    assignee_user_id,
    category,
    title,
    description,
    source_type,
    location_type,
    area_name,
    asset_reference,
    priority,
    status,
    visibility,
    due_by_at
  )
  values
    ('74000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'AJOWA-2026-00001', '30000000-0000-0000-0000-000000000003', '41000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000008', 'Electrical', 'Bedroom switchboard issue', 'Bedroom switchboard is sparking intermittently.', 'RESIDENT_REQUEST', 'FLAT', null, null, 'HIGH', 'IN_PROGRESS', 'RESIDENT_VISIBLE', now() + interval '6 hour'),
    ('74000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'AJOWA-2026-00002', '30000000-0000-0000-0000-000000000002', null, '70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000009', 'Cleaning', 'Lobby garbage overflow', 'Common area cleaning issue near Tower B lobby.', 'COMMON_AREA_REPORT', 'COMMON_AREA', 'Tower B Lobby', null, 'MEDIUM', 'OPEN', 'INTERNAL_ONLY', now() + interval '1 day')
  on conflict (id) do update
    set status = excluded.status,
        assignee_user_id = excluded.assignee_user_id,
        due_by_at = excluded.due_by_at,
        updated_at = now();

  insert into service_request_assignments (
    id,
    service_request_id,
    department_id,
    assignee_user_id,
    assigned_by_user_id,
    notes
  )
  values
    ('75000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', '70000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000008', '30000000-0000-0000-0000-000000000002', 'Assigned to electrician'),
    ('75000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000002', '70000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000009', '30000000-0000-0000-0000-000000000002', 'Assigned to housekeeping queue')
  on conflict (id) do update
    set assignee_user_id = excluded.assignee_user_id,
        notes = excluded.notes;

  insert into service_request_events (
    id,
    service_request_id,
    event_type,
    actor_user_id,
    visibility,
    metadata
  )
  values
    ('76000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', 'CREATED', '30000000-0000-0000-0000-000000000003', 'RESIDENT_VISIBLE', '{"message":"Ticket created by resident"}'::jsonb),
    ('76000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000001', 'ASSIGNED', '30000000-0000-0000-0000-000000000002', 'SYSTEM', '{"department":"Electrical","assignee":"Electric Staff"}'::jsonb)
  on conflict (id) do nothing;

  insert into service_request_comments (id, service_request_id, author_user_id, visibility, comment_body)
  values
    ('77000000-0000-0000-0000-000000000001', '74000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000008', 'RESIDENT_VISIBLE', 'Technician will visit in the afternoon.'),
    ('77000000-0000-0000-0000-000000000002', '74000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000009', 'INTERNAL_NOTE', 'Need extra pickup near service lift.')
  on conflict (id) do nothing;

  insert into notices (
    id,
    society_id,
    title,
    summary,
    body,
    priority,
    status,
    audience_scope,
    is_pinned,
    published_at,
    created_by_user_id
  )
  values
    ('78000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'June Maintenance Reminder', 'Please clear pending June dues before July 10.', 'Residents with pending balances should pay before the July due date to avoid access restrictions.', 'HIGH', 'PUBLISHED', 'ALL_RESIDENTS', true, now(), '30000000-0000-0000-0000-000000000002')
  on conflict (id) do update
    set title = excluded.title,
        summary = excluded.summary,
        body = excluded.body,
        status = excluded.status,
        updated_at = now();

  insert into notification_event_settings (
    id,
    society_id,
    event_key,
    category,
    push_enabled,
    email_enabled,
    whatsapp_enabled,
    in_app_enabled,
    recipient_scope,
    cooldown_minutes,
    priority
  )
  values
    ('79000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'due_created', 'BILLING', true, true, true, true, 'BILLING_CONTACT', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'maintenance_reminder', 'BILLING', true, false, true, true, 'BILLING_CONTACT', 1440, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000003', '11111111-1111-1111-1111-111111111111', 'due_date_reached', 'BILLING', true, true, true, true, 'BILLING_CONTACT', 1440, 'HIGH'),
    ('79000000-0000-0000-0000-000000000004', '11111111-1111-1111-1111-111111111111', 'overdue_alert', 'BILLING', true, true, true, true, 'BILLING_CONTACT', 4320, 'HIGH'),
    ('79000000-0000-0000-0000-000000000005', '11111111-1111-1111-1111-111111111111', 'payment_received', 'PAYMENTS', true, true, false, true, 'PAYING_RESIDENT', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000006', '11111111-1111-1111-1111-111111111111', 'receipt_ready', 'PAYMENTS', false, true, false, true, 'PAYING_RESIDENT', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000007', '11111111-1111-1111-1111-111111111111', 'qr_generated', 'ACCESS_QR', true, true, true, true, 'ELIGIBLE_RESIDENT', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000008', '11111111-1111-1111-1111-111111111111', 'qr_revoked', 'ACCESS_QR', true, true, true, true, 'ELIGIBLE_RESIDENT', 0, 'HIGH'),
    ('79000000-0000-0000-0000-000000000009', '11111111-1111-1111-1111-111111111111', 'service_request_created', 'SERVICE_REQUESTS', true, true, false, true, 'ADMIN_MANAGER', 0, 'HIGH'),
    ('79000000-0000-0000-0000-000000000010', '11111111-1111-1111-1111-111111111111', 'service_request_status_changed', 'SERVICE_REQUESTS', true, true, false, true, 'REQUESTER', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000011', '11111111-1111-1111-1111-111111111111', 'notice_broadcast', 'NOTICES_ANNOUNCEMENTS', true, false, false, true, 'SELECTED_AUDIENCE', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000012', '11111111-1111-1111-1111-111111111111', 'welcome_invite', 'ACCOUNT_ONBOARDING', true, true, true, true, 'NEW_USER', 0, 'MEDIUM'),
    ('79000000-0000-0000-0000-000000000013', '11111111-1111-1111-1111-111111111111', 'password_reset_or_verify', 'ACCOUNT_ONBOARDING', false, true, false, true, 'RELEVANT_USER', 0, 'HIGH'),
    ('79000000-0000-0000-0000-000000000014', '11111111-1111-1111-1111-111111111111', 'emergency_alert', 'EMERGENCY_ALERTS', true, true, true, true, 'ALL_RELEVANT', 0, 'EMERGENCY')
  on conflict (id) do update
    set push_enabled = excluded.push_enabled,
        email_enabled = excluded.email_enabled,
        whatsapp_enabled = excluded.whatsapp_enabled,
        in_app_enabled = excluded.in_app_enabled,
        recipient_scope = excluded.recipient_scope,
        cooldown_minutes = excluded.cooldown_minutes,
        priority = excluded.priority,
        updated_at = now();

  insert into notification_templates (
    id,
    society_id,
    event_key,
    channel,
    version,
    template_name,
    subject_template,
    body_template,
    plain_text_template,
    variables_schema,
    is_active,
    is_default,
    status
  )
  select
    ('80000000-0000-0000-0000-' || lpad(row_number() over (order by event_key, channel)::text, 12, '0'))::uuid,
    '11111111-1111-1111-1111-111111111111',
    event_key,
    channel,
    1,
    initcap(replace(event_key, '_', ' ')) || ' ' || channel || ' v1',
    case when channel = 'EMAIL' then '{{societyName}}: ' || initcap(replace(event_key, '_', ' ')) else null end,
    'Hello {{residentName}}, this is the default ' || lower(channel::text) || ' template for ' || replace(event_key, '_', ' ') || '.',
    'Hello {{residentName}}, this is the default template for ' || replace(event_key, '_', ' ') || '.',
    '["residentName","flatNumber","amountDue","dueDate","receiptNumber","serviceRequestNumber","noticeTitle","deepLinkUrl"]'::jsonb,
    true,
    true,
    'ACTIVE'
  from (
    values
      ('due_created'),
      ('maintenance_reminder'),
      ('due_date_reached'),
      ('overdue_alert'),
      ('payment_received'),
      ('receipt_ready'),
      ('qr_generated'),
      ('qr_revoked'),
      ('service_request_created'),
      ('service_request_status_changed'),
      ('notice_broadcast'),
      ('welcome_invite'),
      ('password_reset_or_verify'),
      ('emergency_alert')
  ) as events(event_key)
  cross join (
    values
      ('PUSH'::notification_channel),
      ('EMAIL'::notification_channel),
      ('WHATSAPP'::notification_channel),
      ('IN_APP'::notification_channel)
  ) as channels(channel)
  on conflict (id) do update
    set body_template = excluded.body_template,
        plain_text_template = excluded.plain_text_template,
        is_active = excluded.is_active,
        is_default = excluded.is_default,
        status = excluded.status,
        updated_at = now();

  insert into user_notification_preferences (
    id,
    society_id,
    user_id,
    event_category,
    push_enabled,
    email_enabled,
    whatsapp_enabled,
    in_app_enabled,
    fallback_to_mobile_for_whatsapp,
    preferred_language
  )
  select
    ('81000000-0000-0000-0000-' || lpad((row_number() over (order by user_id, event_category))::text, 12, '0'))::uuid,
    '11111111-1111-1111-1111-111111111111',
    user_id,
    event_category,
    true,
    true,
    true,
    true,
    true,
    'en'
  from (
    values
      ('30000000-0000-0000-0000-000000000003'::uuid),
      ('30000000-0000-0000-0000-000000000004'::uuid),
      ('30000000-0000-0000-0000-000000000005'::uuid),
      ('30000000-0000-0000-0000-000000000006'::uuid)
  ) as demo_users(user_id)
  cross join (
    values
      ('BILLING'::notification_event_category),
      ('PAYMENTS'::notification_event_category),
      ('ACCESS_QR'::notification_event_category),
      ('SERVICE_REQUESTS'::notification_event_category),
      ('NOTICES_ANNOUNCEMENTS'::notification_event_category),
      ('ACCOUNT_ONBOARDING'::notification_event_category),
      ('EMERGENCY_ALERTS'::notification_event_category)
  ) as categories(event_category)
  on conflict (id) do update
    set push_enabled = excluded.push_enabled,
        email_enabled = excluded.email_enabled,
        whatsapp_enabled = excluded.whatsapp_enabled,
        in_app_enabled = excluded.in_app_enabled,
        fallback_to_mobile_for_whatsapp = excluded.fallback_to_mobile_for_whatsapp,
        preferred_language = excluded.preferred_language,
        updated_at = now();

  insert into document_sequences (id, document_type, sequence_year, last_value)
  values
    ('82000000-0000-0000-0000-000000000001', 'RECEIPT', 2026, 2),
    ('82000000-0000-0000-0000-000000000002', 'JOURNAL_VOUCHER', 2026, 0),
    ('82000000-0000-0000-0000-000000000003', 'SERVICE_REQUEST', 2026, 2)
  on conflict (id) do update
    set last_value = excluded.last_value,
        updated_at = now();

  insert into audit_events (
    id,
    society_id,
    module,
    event_key,
    action,
    severity,
    actor_user_id,
    actor_auth_user_id,
    target_user_id,
    metadata
  )
  values
    ('90000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'MASTER', 'seed.admin.created', 'CREATED', 'HIGH', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', '{"note":"Repeatable local seed admin"}'::jsonb),
    ('90000000-0000-0000-0000-000000000002', '11111111-1111-1111-1111-111111111111', 'PAYMENTS', 'seed.payment.imported', 'CREATED', 'MEDIUM', '30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000003', '{"paymentId":"46000000-0000-0000-0000-000000000001"}'::jsonb)
  on conflict (id) do nothing;

  insert into audit_event_entities (id, audit_event_id, entity_table, entity_id, entity_label)
  values
    ('91000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000001', 'users', '30000000-0000-0000-0000-000000000001', 'AJOWA Admin'),
    ('91000000-0000-0000-0000-000000000002', '90000000-0000-0000-0000-000000000002', 'payments', '46000000-0000-0000-0000-000000000001', 'June 2026 payment')
  on conflict (id) do nothing;
end;
$$;
