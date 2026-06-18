do $$
declare
  v_password_hash constant text := '83fc1288198e6f8b3b40b8c0defb7548:10b7066831355797e1a6b7b9f799b311337b3ad375a142609838916f18745908e2dc14d9de287efa542747de7203b350cb8cc50c2f04562eb21a2eed1120cc0f';
  v_society_id uuid;
  v_admin_auth_id uuid;
  v_admin_user_id uuid;
  v_period_id uuid;
begin
  create temporary table ajowa_unit_import (
    source_row integer not null,
    serial_number integer not null,
    owner_user_id uuid not null,
    owner_identity_key text not null,
    owner_name text not null,
    owner_mobile text,
    raw_contact text,
    raw_email text,
    owner_login_email citext,
    owner_can_login boolean not null,
    owner_email_source text not null,
    flat_number text not null,
    tower_code text not null,
    tower_number integer not null,
    floor_label text not null,
    unit_type text not null,
    area_sq_ft numeric(10,2) not null,
    rate_per_sq_ft numeric(10,2) not null,
    resident_status text not null,
    occupancy_status occupancy_status not null,
    occupancy_raw text,
    source_data jsonb not null
  ) on commit drop;

  insert into ajowa_unit_import (
    source_row,
    serial_number,
    owner_user_id,
    owner_identity_key,
    owner_name,
    owner_mobile,
    raw_contact,
    raw_email,
    owner_login_email,
    owner_can_login,
    owner_email_source,
    flat_number,
    tower_code,
    tower_number,
    floor_label,
    unit_type,
    area_sq_ft,
    rate_per_sq_ft,
    resident_status,
    occupancy_status,
    occupancy_raw,
    source_data
  )
  values
    (2, 1, '9025c6f9-0313-539d-ad18-879d82081d6f', 'owner-profile:pooja.sood:+919816668068', 'POOJA SOOD', '+919816668068', '9816668068', 'soodiron68@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T1-101', 'T1', 1, '1', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":1,"OWNER NAME":"POOJA SOOD","TOWER-\nFLATNO.":"T1-101","CONTACT DETAILS":9816668068,"EMAIL ID":"soodiron68@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2240,"RATE":3.25}'),
    (3, 2, 'b60efeeb-a69c-5a78-b723-dd0d26a36703', 'owner-email:mskhosa1@gmail.com', 'MANJIT KHOSA', '+918427004290', '8427004290', 'mskhosa1@gmail.com', 'mskhosa1@gmail.com', true, 'WORKBOOK', 'T1-102', 'T1', 1, '1', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":2,"OWNER NAME":"MANJIT KHOSA","TOWER-\nFLATNO.":"T1-102","CONTACT DETAILS":8427004290,"EMAIL ID":"mskhosa1@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (4, 3, '6a4345eb-8ed5-5b88-9862-3c6e31b3c48b', 'owner-email:gurmeetsgc@gmail.com', 'GURMEET SINGH / WINKY TALWAR', '+919814654123', '9814654123; 8198031117', 'gurmeetsgc@gmail.com', 'gurmeetsgc@gmail.com', true, 'WORKBOOK', 'T1-103', 'T1', 1, '1', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":3,"OWNER NAME":"GURMEET SINGH\nWINKY TALWAR","TOWER-\nFLATNO.":"T1-103","CONTACT DETAILS":"9814654123\n8198031117","EMAIL ID":"gurmeetsgc@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (5, 4, '9416a8ef-0b32-5c79-a330-f6ca74bc180e', 'owner-email:akashlohka@gmail.com', 'JASKARAN SINGH', '+919417780852', '9417780852', 'akashlohka@gmail.com', 'akashlohka@gmail.com', true, 'WORKBOOK', 'T1-201', 'T1', 1, '2', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":4,"OWNER NAME":"JASKARAN SINGH","TOWER-\nFLATNO.":"T1-201","CONTACT DETAILS":9417780852,"EMAIL ID":"akashlohka@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (6, 5, 'ef6a83bb-2897-5c0b-8a48-22010424c495', 'owner-email:hc_1987@yahoo.com', 'HEMANT KUMAR CHAWLA / AASTHA GOSWAMI', '+918283805544', '8283805544; 9041326544', 'hc_1987@yahoo.com', 'hc_1987@yahoo.com', true, 'WORKBOOK', 'T1-202', 'T1', 1, '2', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":5,"OWNER NAME":"HEMANT KUMAR CHAWLA\nAASTHA GOSWAMI","TOWER-\nFLATNO.":"T1-202","CONTACT DETAILS":"8283805544\n9041326544","EMAIL ID":"hc_1987@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (7, 6, '905bb059-7350-55ad-9404-1a45253e5bb1', 'owner-email:siraj.ccpl@gmail.com', 'SIRAJUDDIN AHAMD', '+919646210786', '9646210786', 'siraj.ccpl@gmail.com', 'siraj.ccpl@gmail.com', true, 'WORKBOOK', 'T1-203', 'T1', 1, '2', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":6,"OWNER NAME":"SIRAJUDDIN AHAMD","TOWER-\nFLATNO.":"T1-203","CONTACT DETAILS":9646210786,"EMAIL ID":"siraj.ccpl@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (8, 7, '025723dc-f28d-56a2-aafa-4db6c47ea31e', 'owner-email:hasanbrar24@gmail.com', 'SIMARJEET KAUR', '+919988999957', '9988999957; 9878600024', 'hasanbrar24@gmail.com', 'hasanbrar24@gmail.com', true, 'WORKBOOK', 'T1-301', 'T1', 1, '3', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":7,"OWNER NAME":"SIMARJEET KAUR","TOWER-\nFLATNO.":"T1-301","CONTACT DETAILS":"9988999957\n9878600024","EMAIL ID":"hasanbrar24@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (9, 8, '2c95ff46-6a32-5df6-b982-d79119d48422', 'owner-profile:dashmeet.singh:+919316015514', 'DASHMEET SINGH', '+919316015514', '9316015514', '--', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T1-302', 'T1', 1, '3', '2210 SQFT', 2210.00, 3.25, 'TENANT', 'TENANTED', 'RANBIR SINGH; SONAM DOGRA;', '{"S.No":8,"OWNER NAME":"DASHMEET SINGH","TOWER-\nFLATNO.":"T1-302","CONTACT DETAILS":9316015514,"EMAIL ID":"--","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RANBIR SINGH; SONAM DOGRA;","AREA":2210,"RATE":3.25}'),
    (10, 9, 'fb246c7f-4766-5050-9efa-c8d404afc7ec', 'owner-email:drrohiturology04@gmail.com', 'ASHU SOOD / APURVA SOOD', '+917087275550', '7087275550', 'drrohiturology04@gmail.com', 'drrohiturology04@gmail.com', true, 'WORKBOOK', 'T1-303', 'T1', 1, '3', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":9,"OWNER NAME":"ASHU SOOD\nAPURVA SOOD","TOWER-\nFLATNO.":"T1-303","CONTACT DETAILS":7087275550,"EMAIL ID":"drrohiturology04@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (11, 10, '7c46cf91-c425-51ab-a5ec-e5bf752d250a', 'owner-email:oberoijs@hotmail.com', 'JASPREET SINGH OBEROI / MANDIP OBEROI', '+919599436991', '9599436991', 'oberoijs@hotmail.com', 'oberoijs@hotmail.com', true, 'WORKBOOK', 'T1-401', 'T1', 1, '4', '2240 SQFT', 2240.00, 3.25, 'TENANT', 'TENANTED', 'ASHISH PANJETTA;', '{"S.No":10,"OWNER NAME":"JASPREET SINGH OBEROI\nMANDIP OBEROI","TOWER-\nFLATNO.":"T1-401","CONTACT DETAILS":9599436991,"EMAIL ID":"oberoijs@hotmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ASHISH PANJETTA;","AREA":2240,"RATE":3.25}'),
    (12, 11, '1b557e1a-18e9-5fa1-b5c9-21db37b5584b', 'owner-email:sayam36@yahoo.co.in', 'CHANDNI SAPRA', '+919872100036', '9872100036', 'sayam36@yahoo.co.in', 'sayam36@yahoo.co.in', true, 'WORKBOOK', 'T1-402', 'T1', 1, '4', '2210 SQFT', 2210.00, 3.25, 'TENANT', 'TENANTED', 'MANDEEP;', '{"S.No":11,"OWNER NAME":"CHANDNI SAPRA","TOWER-\nFLATNO.":"T1-402","CONTACT DETAILS":9872100036,"EMAIL ID":"sayam36@yahoo.co.in","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANDEEP;","AREA":2210,"RATE":3.25}'),
    (13, 12, 'a0be91af-f4e5-5376-93d6-5b39c8a59deb', 'owner-email:director.rhm@gmail.com', 'JAGDISH KAUR DHILLON / JASONPREET SINGH DHILLON', '+919815000595', '9815000595; 9815575550', 'director.rhm@gmail.com', 'director.rhm@gmail.com', true, 'WORKBOOK', 'T1-403', 'T1', 1, '4', '2240 SQFT', 2240.00, 3.25, 'TENANT', 'TENANTED', 'GURSEV SINGH;', '{"S.No":12,"OWNER NAME":"JAGDISH KAUR DHILLON\nJASONPREET SINGH DHILLON","TOWER-\nFLATNO.":"T1-403","CONTACT DETAILS":"9815000595\n9815575550","EMAIL ID":"director.rhm@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"GURSEV SINGH;","AREA":2240,"RATE":3.25}'),
    (14, 13, '06d09113-cc0a-5c98-aa02-ace02199b6f8', 'owner-email:anil.kumarsabharwal@gmail.com', 'ANIL KUMAR', '+917526820601', '7526820601', 'anil.kumarsabharwal@gmail.com', 'anil.kumarsabharwal@gmail.com', true, 'WORKBOOK', 'T1-501', 'T1', 1, '5', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":13,"OWNER NAME":"ANIL KUMAR","TOWER-\nFLATNO.":"T1-501","CONTACT DETAILS":7526820601,"EMAIL ID":"anil.kumarsabharwal@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (15, 14, 'e365dc8a-ba10-5157-a5b5-125b91da6743', 'owner-email:jasmeenakhtarldh28@gmail.com', 'JASMEEN AKHTAR', '+918437352765', '8437352765', 'jasmeenakhtarldh28@gmail.com', 'jasmeenakhtarldh28@gmail.com', true, 'WORKBOOK', 'T1-502', 'T1', 1, '5', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":14,"OWNER NAME":"JASMEEN AKHTAR","TOWER-\nFLATNO.":"T1-502","CONTACT DETAILS":8437352765,"EMAIL ID":"jasmeenakhtarldh28@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (16, 15, '72abe0b5-19c1-5ea9-9620-ef4e7ea1fe3c', 'owner-email:bindrakuldip@yahoo.com', 'NAVNEET KAUR BINDRA / AMARJOT SINGH BINDRA', '+918544966147', '8544966147', 'bindrakuldip@yahoo.com', 'bindrakuldip@yahoo.com', true, 'WORKBOOK', 'T1-503', 'T1', 1, '5', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-ABROAD-OCCASIONALLY', '{"S.No":15,"OWNER NAME":"NAVNEET KAUR BINDRA\nAMARJOT SINGH BINDRA","TOWER-\nFLATNO.":"T1-503","CONTACT DETAILS":8544966147,"EMAIL ID":"bindrakuldip@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-ABROAD-OCCASIONALLY","AREA":2240,"RATE":3.25}'),
    (17, 16, 'b5742911-649a-5e23-88f7-73dfa1828081', 'owner-email:mackharryshah@gmail.com', 'NARINDER SINGH SANDHU', '+919876052045', '9876052045; 7087110181', 'mackharryshah@gmail.com', 'mackharryshah@gmail.com', true, 'WORKBOOK', 'T1-601', 'T1', 1, '6', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":16,"OWNER NAME":"NARINDER SINGH SANDHU","TOWER-\nFLATNO.":"T1-601","CONTACT DETAILS":"9876052045\n7087110181","EMAIL ID":"mackharryshah@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (18, 17, 'b5742911-649a-5e23-88f7-73dfa1828081', 'owner-email:mackharryshah@gmail.com', 'NARINDER SINGH SANDHU', '+919876052045', '9876052045; 7087110181', 'mackharryshah@gmail.com', 'mackharryshah@gmail.com', true, 'WORKBOOK', 'T1-602', 'T1', 1, '6', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":17,"OWNER NAME":"NARINDER SINGH SANDHU","TOWER-\nFLATNO.":"T1-602","CONTACT DETAILS":"9876052045\n7087110181","EMAIL ID":"mackharryshah@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2210,"RATE":3.25}'),
    (19, 18, 'b5742911-649a-5e23-88f7-73dfa1828081', 'owner-email:mackharryshah@gmail.com', 'NARINDER SINGH SANDHU', '+919876052045', '9876052045; 7087110181', 'mackharryshah@gmail.com', 'mackharryshah@gmail.com', true, 'WORKBOOK', 'T1-603', 'T1', 1, '6', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":18,"OWNER NAME":"NARINDER SINGH SANDHU","TOWER-\nFLATNO.":"T1-603","CONTACT DETAILS":"9876052045\n7087110181","EMAIL ID":"mackharryshah@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (20, 19, '13816d8b-72cd-51b5-85aa-69a3b7720fa8', 'owner-email:anilshah0539@gmail.com', 'ANIL KUMAR SHAH / SANTOSH', '+919988100539', '9988100539', 'anilshah0539@gmail.com; khushbooshah470@gmail.com', 'anilshah0539@gmail.com', true, 'WORKBOOK', 'T1-701', 'T1', 1, '7', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":19,"OWNER NAME":"ANIL KUMAR SHAH\nSANTOSH","TOWER-\nFLATNO.":"T1-701","CONTACT DETAILS":9988100539,"EMAIL ID":"anilshah0539@gmail.com\nkhushbooshah470@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (21, 20, '6163e5b9-7e2f-5f07-a95e-1775963d8be5', 'owner-email:princekanwaljitsingh@gmail.com', 'RUPINDER SINGH GREWAL', '+919876533400', '9876533400', 'princekanwaljitsingh@gmail.com', 'princekanwaljitsingh@gmail.com', true, 'WORKBOOK', 'T1-702', 'T1', 1, '7', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":20,"OWNER NAME":"RUPINDER SINGH GREWAL","TOWER-\nFLATNO.":"T1-702","CONTACT DETAILS":9876533400,"EMAIL ID":"princekanwaljitsingh@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (22, 21, 'adc1b28c-12ff-5e6a-83ce-581f37cfbc6f', 'owner-email:jagdeep75@gmail.com', 'CHARANJIT SINGH', '+919646749790', '9646749790', 'jagdeep75@gmail.com', 'jagdeep75@gmail.com', true, 'WORKBOOK', 'T1-703', 'T1', 1, '7', '2240 SQFT', 2240.00, 3.25, 'TENANT', 'TENANTED', 'PRIYANSHU HOODA; RAHUL YADAV;', '{"S.No":21,"OWNER NAME":"CHARANJIT SINGH","TOWER-\nFLATNO.":"T1-703","CONTACT DETAILS":9646749790,"EMAIL ID":"jagdeep75@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PRIYANSHU HOODA; RAHUL YADAV;","AREA":2240,"RATE":3.25}'),
    (23, 22, 'ee55ec17-210c-5420-b551-e33a0da01af9', 'owner-email:camukeshchd@gmail.com', 'MUKESH KUMAR GUPTA', '+919814123005', '9814123005', 'camukeshchd@gmail.com', 'camukeshchd@gmail.com', true, 'WORKBOOK', 'T1-801', 'T1', 1, '8', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":22,"OWNER NAME":"MUKESH KUMAR GUPTA","TOWER-\nFLATNO.":"T1-801","CONTACT DETAILS":9814123005,"EMAIL ID":"camukeshchd@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (24, 23, '883916d7-3adb-5210-90f8-a91c3128a5d1', 'owner-email:deepsinghmuzic@gmail.com', 'RUPINDER SINGH GREWAL', '+919876533400', '9876533400', 'deepsinghmuzic@gmail.com', 'deepsinghmuzic@gmail.com', true, 'WORKBOOK', 'T1-802', 'T1', 1, '8', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; GURTEJBIR SINGH;', '{"S.No":23,"OWNER NAME":"RUPINDER SINGH GREWAL","TOWER-\nFLATNO.":"T1-802","CONTACT DETAILS":9876533400,"EMAIL ID":"deepsinghmuzic@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; GURTEJBIR SINGH;","AREA":2210,"RATE":3.25}'),
    (25, 24, 'd3be49b4-655b-58e3-88f5-a5a4df517576', 'owner-profile:arun.walia:+919814123005', 'ARUN WALIA', '+919814123005', '9814123005', 'rakeshdhawanofficial@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T1-803', 'T1', 1, '8', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; ARUN WALIA; SHEEL WALIA; SATISH WALIA; SUPRIYA RAJPAL; VINOD KUMAR; INDU;', '{"S.No":24,"OWNER NAME":"ARUN WALIA","TOWER-\nFLATNO.":"T1-803","CONTACT DETAILS":9814123005,"EMAIL ID":"rakeshdhawanofficial@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; ARUN WALIA; SHEEL WALIA; SATISH WALIA; SUPRIYA RAJPAL; VINOD KUMAR; INDU;","AREA":2240,"RATE":3.25}'),
    (26, 25, 'ceadf758-eee9-51ac-860b-95a0b1e4646f', 'owner-email:rajesh@nupuraudio.com', 'RACHNA GUPTA', '+919810023390', '9810023390', 'rajesh@nupuraudio.com', 'rajesh@nupuraudio.com', true, 'WORKBOOK', 'T1-901', 'T1', 1, '9', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":25,"OWNER NAME":"RACHNA GUPTA","TOWER-\nFLATNO.":"T1-901","CONTACT DETAILS":9810023390,"EMAIL ID":"rajesh@nupuraudio.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (27, 26, '733bf48b-0c35-57cc-be5e-2d57a7b391fe', 'owner-email:jordansandhuofficial271@gmail.com', 'JASMINDER SINGH', '+919780240800', '9780240800; 9814586721', 'Jordansandhuofficial271@gmail.com', 'jordansandhuofficial271@gmail.com', true, 'WORKBOOK', 'T1-902', 'T1', 1, '9', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":26,"OWNER NAME":"JASMINDER SINGH","TOWER-\nFLATNO.":"T1-902","CONTACT DETAILS":"9780240800\n9814586721","EMAIL ID":"Jordansandhuofficial271@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (28, 27, 'b7aa5d18-219b-59fb-867e-7a5fb00586ba', 'owner-profile:rakesh.kumar:+919854300079', 'RAKESH KUMAR', '+919854300079', '9854300079', 'rakeshdhawanofficial@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T1-903', 'T1', 1, '9', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":27,"OWNER NAME":"RAKESH KUMAR","TOWER-\nFLATNO.":"T1-903","CONTACT DETAILS":9854300079,"EMAIL ID":"rakeshdhawanofficial@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (29, 28, '0710d4ad-3f5b-5693-8d24-dc043a46ac7e', 'owner-profile:surinder.kumar:+919845022099', 'SURINDER KUMAR', '+919845022099', '9845022099', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T1-1001', 'T1', 1, '10', '2240 SQFT', 2240.00, 3.25, 'TENANT', 'TENANTED', 'GIRISH ARORA;', '{"S.No":28,"OWNER NAME":"SURINDER KUMAR","TOWER-\nFLATNO.":"T1-1001","CONTACT DETAILS":9845022099,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"GIRISH ARORA;","AREA":2240,"RATE":3.25}'),
    (30, 29, 'b3afe841-e308-5a3f-82e9-046187a8dc57', 'owner-email:mintybansal@gmail.com', 'GURVINDER KAUR / SATINDERJIT SINGH', '+919876123782', '9876123782', 'mintybansal@gmail.com', 'mintybansal@gmail.com', true, 'WORKBOOK', 'T1-1002', 'T1', 1, '10', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":29,"OWNER NAME":"GURVINDER KAUR\nSATINDERJIT SINGH","TOWER-\nFLATNO.":"T1-1002","CONTACT DETAILS":9876123782,"EMAIL ID":"mintybansal@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (31, 30, 'ecb52462-ef71-56aa-882d-cb813d5b6d21', 'owner-email:iamsharankaur27@gmail.com', 'SHARANJIT KAUR', '+919987514348', '9987514348; 6239600000', 'iamsharankaur27@gmail.com', 'iamsharankaur27@gmail.com', true, 'WORKBOOK', 'T1-1003', 'T1', 1, '10', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; MANPREET;', '{"S.No":30,"OWNER NAME":"SHARANJIT KAUR","TOWER-\nFLATNO.":"T1-1003","CONTACT DETAILS":"9987514348\n6239600000","EMAIL ID":"iamsharankaur27@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; MANPREET;","AREA":2240,"RATE":3.25}'),
    (32, 31, 'f89f968e-8e94-53ec-be6e-bda98653a45c', 'owner-email:djshantt@gmail.com', 'SHANTANU ARORA', '+919845022099', '9845022099', 'djshantt@gmail.com; shantanu@cryptogear.in; girisharorabase@gmail.com', 'djshantt@gmail.com', true, 'WORKBOOK', 'T1-1101', 'T1', 1, '11', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":31,"OWNER NAME":"SHANTANU ARORA","TOWER-\nFLATNO.":"T1-1101","CONTACT DETAILS":9845022099,"EMAIL ID":"djshantt@gmail.com\nshantanu@cryptogear.in\ngirisharorabase@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (33, 32, '06a66407-f8ef-505e-a21a-4effe9a8962c', 'owner-email:neha.rishi.gulati88@gmail.com', 'ARJUN GULATI / NEHA GULATI', '+919689182875', '9689182875', 'neha.rishi.gulati88@gmail.com', 'neha.rishi.gulati88@gmail.com', true, 'WORKBOOK', 'T1-1102', 'T1', 1, '11', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":32,"OWNER NAME":"ARJUN GULATI\nNEHA GULATI","TOWER-\nFLATNO.":"T1-1102","CONTACT DETAILS":9689182875,"EMAIL ID":"neha.rishi.gulati88@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (34, 33, '962d914c-7476-5bd1-9067-881e96b8cb78', 'owner-email:jaisminkaursandhu@gmail.com', 'JAISMIN KAUR', '+918847471870', '8847471870', 'jaisminkaursandhu@gmail.com', 'jaisminkaursandhu@gmail.com', true, 'WORKBOOK', 'T1-1103', 'T1', 1, '11', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":33,"OWNER NAME":"JAISMIN KAUR","TOWER-\nFLATNO.":"T1-1103","CONTACT DETAILS":8847471870,"EMAIL ID":"jaisminkaursandhu@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (35, 34, 'f8394300-fd70-54bd-ad1d-60a2992d5398', 'owner-email:anilkumarsonu1226786@gmail.com', 'USHA RANI', '+918427247101', '8427247101', 'anilkumarsonu1226786@gmail.com; srishav949@gmail.com', 'anilkumarsonu1226786@gmail.com', true, 'WORKBOOK', 'T1-1201', 'T1', 1, '12', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":34,"OWNER NAME":"USHA RANI","TOWER-\nFLATNO.":"T1-1201","CONTACT DETAILS":8427247101,"EMAIL ID":"anilkumarsonu1226786@gmail.com\nsrishav949@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (36, 35, 'ad7bf4af-21c1-5aab-8d98-94946ab2bd0d', 'owner-email:bakshiashmeet2012@gmail.com', 'CHARANPREET KAUR / PARMEET KAUR', '+919717525576', '9717525576; 9773800000', 'bakshiashmeet2012@gmail.com; ashmeetbakshi2012@gmail.com', 'bakshiashmeet2012@gmail.com', true, 'WORKBOOK', 'T1-1202', 'T1', 1, '12', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":35,"OWNER NAME":"CHARANPREET KAUR\nPARMEET KAUR","TOWER-\nFLATNO.":"T1-1202","CONTACT DETAILS":"9717525576\n9773800000","EMAIL ID":"bakshiashmeet2012@gmail.com\nashmeetbakshi2012@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (37, 36, '48ccb505-1712-5104-9b3d-c20c4d5e41cb', 'owner-email:rupuneet@gmai.com', 'RUPUNEET KAUR / HIMANSHU DHAMIJA', '+917875575588', '7875575588', 'rupuneet@gmai.com', 'rupuneet@gmai.com', true, 'WORKBOOK', 'T1-1203', 'T1', 1, '12', '2240 SQFT', 2240.00, 3.25, 'TENANT', 'VACANT', 'VACANT', '{"S.No":36,"OWNER NAME":"RUPUNEET KAUR\nHIMANSHU DHAMIJA","TOWER-\nFLATNO.":"T1-1203","CONTACT DETAILS":7875575588,"EMAIL ID":"rupuneet@gmai.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VACANT","AREA":2240,"RATE":3.25}'),
    (38, 37, 'd6d76d08-3f4d-5ad4-8436-b555a80b07f3', 'owner-email:gurvindermattu6070@gmail.com', 'BALJINDER KAUR', '+919815906070', '9815906070', 'gurvindermattu6070@gmail.com', 'gurvindermattu6070@gmail.com', true, 'WORKBOOK', 'T1-1401', 'T1', 1, '14', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":37,"OWNER NAME":"BALJINDER KAUR","TOWER-\nFLATNO.":"T1-1401","CONTACT DETAILS":9815906070,"EMAIL ID":"gurvindermattu6070@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2240,"RATE":3.25}'),
    (39, 38, '3d3514c8-c36b-5eca-b2e9-645cdfe12ad4', 'owner-email:jigarsamra063@gmail.com', 'JASPREET SINGH', '+919872507011', '9872507011', 'jigarsamra063@gmail.com', 'jigarsamra063@gmail.com', true, 'WORKBOOK', 'T1-1402', 'T1', 1, '14', '2210 SQFT', 2210.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":38,"OWNER NAME":"JASPREET SINGH","TOWER-\nFLATNO.":"T1-1402","CONTACT DETAILS":9872507011,"EMAIL ID":"jigarsamra063@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2210,"RATE":3.25}'),
    (40, 39, '06846926-a30f-5940-9bee-7a1997400f29', 'owner-email:amrikrandhawa@hotmail.com', 'AMRIK SINGH RANDHAWA', '+919888888890', '9888888890', 'amrikrandhawa@hotmail.com', 'amrikrandhawa@hotmail.com', true, 'WORKBOOK', 'T1-1403', 'T1', 1, '14', '2240 SQFT', 2240.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":39,"OWNER NAME":"AMRIK SINGH RANDHAWA","TOWER-\nFLATNO.":"T1-1403","CONTACT DETAILS":9888888890,"EMAIL ID":"amrikrandhawa@hotmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2240,"RATE":3.25}'),
    (41, 40, 'd5cb93d2-feba-53cc-9610-49df76029982', 'owner-email:supreet.malik1@gmail.com', 'SUPREET KAUR', '+919888155555', '9888155555', 'supreet.malik1@gmail.com', 'supreet.malik1@gmail.com', true, 'WORKBOOK', 'T2-101', 'T2', 2, '1', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":40,"OWNER NAME":"SUPREET KAUR","TOWER-\nFLATNO.":"T2-101","CONTACT DETAILS":9888155555,"EMAIL ID":"supreet.malik1@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (42, 41, '1d7de737-efd8-5dea-823e-35db81dd67b2', 'owner-email:parampreet479@gmail.com', 'PARAMPREET SINGH', '+919478806550', '9478806550', 'parampreet479@gmail.com', 'parampreet479@gmail.com', true, 'WORKBOOK', 'T2-102', 'T2', 2, '1', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":41,"OWNER NAME":"PARAMPREET SINGH","TOWER-\nFLATNO.":"T2-102","CONTACT DETAILS":9478806550,"EMAIL ID":"parampreet479@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (43, 42, '86b38813-f795-5f89-a8c7-179f6aaf7d6e', 'owner-email:ashoksethwrong@gmail.com', 'MAMTA SETH', '+919463606005', '9463606005', 'ashoksethwrong@gmail.com', 'ashoksethwrong@gmail.com', true, 'WORKBOOK', 'T2-103', 'T2', 2, '1', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":42,"OWNER NAME":"MAMTA SETH","TOWER-\nFLATNO.":"T2-103","CONTACT DETAILS":9463606005,"EMAIL ID":"ashoksethwrong@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (44, 43, 'b24c3f16-19e3-5164-b2a1-7c45b0401ac4', 'owner-email:rajinder.malik51@gmail.com', 'PREM MALIK', '+919888155555', '9888155555', 'rajinder.malik51@gmail.com', 'rajinder.malik51@gmail.com', true, 'WORKBOOK', 'T2-201', 'T2', 2, '2', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":43,"OWNER NAME":"PREM MALIK","TOWER-\nFLATNO.":"T2-201","CONTACT DETAILS":9888155555,"EMAIL ID":"rajinder.malik51@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (45, 44, '7f8ffc8b-e656-5a87-9c0f-1009a6fbaa60', 'owner-email:rishisharma46@rediffmail.com', 'RISHI SHARMA / PAWAN KUMAR', '+917640000073', '7640000073', 'rishisharma46@rediffmail.com', 'rishisharma46@rediffmail.com', true, 'WORKBOOK', 'T2-202', 'T2', 2, '2', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-VISITS OCCASIONALLY;', '{"S.No":44,"OWNER NAME":"RISHI SHARMA\nPAWAN KUMAR","TOWER-\nFLATNO.":"T2-202","CONTACT DETAILS":7640000073,"EMAIL ID":"rishisharma46@rediffmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-VISITS OCCASIONALLY;","AREA":2150,"RATE":3.25}'),
    (46, 45, '9b281f85-33be-519a-915e-db55e30af4f4', 'owner-email:pmschawla@gmail.com', 'ARJINDER KAUR / DR. PARMINDER SINGH', '+919872821140', '9872821140', 'pmschawla@gmail.com', 'pmschawla@gmail.com', true, 'WORKBOOK', 'T2-203', 'T2', 2, '2', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'SUKHPAL SINGH DAHRI; KAMALJIT KAUR; AKASHDEEP SINGH DAHRI; ARSHDEEP SINGH DAHRI; EKTA ARORA; RAJVIR BK', '{"S.No":45,"OWNER NAME":"ARJINDER KAUR\nDR. PARMINDER SINGH","TOWER-\nFLATNO.":"T2-203","CONTACT DETAILS":9872821140,"EMAIL ID":"pmschawla@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SUKHPAL SINGH DAHRI; KAMALJIT KAUR; AKASHDEEP SINGH DAHRI; ARSHDEEP SINGH DAHRI; EKTA ARORA; RAJVIR BK ©","AREA":2190,"RATE":3.25}'),
    (47, 46, 'd28da231-bdd9-5f14-bebe-3f9661330ece', 'owner-email:ervikrantsingla@gmail.com', 'VIKRANT SINGLA', '+918427763910', '8427763910', 'ervikrantsingla@gmail.com', 'ervikrantsingla@gmail.com', true, 'WORKBOOK', 'T2-301', 'T2', 2, '3', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":46,"OWNER NAME":"VIKRANT SINGLA","TOWER-\nFLATNO.":"T2-301","CONTACT DETAILS":8427763910,"EMAIL ID":"ervikrantsingla@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (48, 47, '77a9014d-095c-5d02-ad05-54c6aec676de', 'owner-email:dhairyaa245@gmail.com', 'POOJA ARORA / ANJU MALIK', '+919896435622', '9896435622', 'dhairyaa245@gmail.com', 'dhairyaa245@gmail.com', true, 'WORKBOOK', 'T2-302', 'T2', 2, '3', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":47,"OWNER NAME":"POOJA ARORA\nANJU MALIK","TOWER-\nFLATNO.":"T2-302","CONTACT DETAILS":9896435622,"EMAIL ID":"dhairyaa245@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (49, 48, 'b7467d33-6bd2-5c80-8658-cc09b80262a6', 'owner-email:sohanpreetkaur@gmail.com', 'SOHANPREET KAUR / PREETKAMAL KAUR CHAWLA', '+918054174503', '8054174503; 9417547503', 'sohanpreetkaur@gmail.com', 'sohanpreetkaur@gmail.com', true, 'WORKBOOK', 'T2-303', 'T2', 2, '3', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":48,"OWNER NAME":"SOHANPREET KAUR\nPREETKAMAL KAUR CHAWLA","TOWER-\nFLATNO.":"T2-303","CONTACT DETAILS":"8054174503\n9417547503","EMAIL ID":"sohanpreetkaur@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (50, 49, 'ae0baf19-3e00-5692-b372-b67c2ed0322d', 'owner-email:mahadevan.pranadharthi@emerson.com', 'NAMITA MAHADEVAN / PRANADHARTHI MAHADEVAN', '+919810122506', '9810122506; 9780961519', 'mahadevan.pranadharthi@emerson.com', 'mahadevan.pranadharthi@emerson.com', true, 'WORKBOOK', 'T2-401', 'T2', 2, '4', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":49,"OWNER NAME":"NAMITA MAHADEVAN \nPRANADHARTHI MAHADEVAN","TOWER-\nFLATNO.":"T2-401","CONTACT DETAILS":"9810122506\n9780961519","EMAIL ID":"mahadevan.pranadharthi@emerson.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (51, 50, 'a04ce8c9-d65a-5d24-9331-36f2b338e2b4', 'owner-email:aryanmarbleandgranite@yahoo.com', 'NISHU GARG / JYOTI GARG', '+919781771784', '9781771784', 'aryanmarbleandgranite@yahoo.com', 'aryanmarbleandgranite@yahoo.com', true, 'WORKBOOK', 'T2-402', 'T2', 2, '4', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":50,"OWNER NAME":"NISHU GARG\nJYOTI GARG","TOWER-\nFLATNO.":"T2-402","CONTACT DETAILS":9781771784,"EMAIL ID":"aryanmarbleandgranite@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (52, 51, '605e0f04-4946-5400-8070-a2783d587cfe', 'owner-profile:preeti.shivkumar.supreet.singh:+919818140214', 'PREETI SHIVKUMAR / SUPREET SINGH', '+919818140214', '9818140214', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-403', 'T2', 2, '4', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'RAVINDER SHARMA; MANDEEP DHALIWAL; DHRUV SHARMA; MEENA SHARMA; SUKHDEEP SINGH;', '{"S.No":51,"OWNER NAME":"PREETI SHIVKUMAR\nSUPREET SINGH","TOWER-\nFLATNO.":"T2-403","CONTACT DETAILS":9818140214,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RAVINDER SHARMA; MANDEEP DHALIWAL; DHRUV SHARMA; MEENA SHARMA; SUKHDEEP SINGH;","AREA":2190,"RATE":3.25}'),
    (53, 52, '4e6148a7-d900-5430-8566-9654c7b73354', 'owner-email:kiritpoonia0302@gmail.com', 'KIRIT AJAY POONIA / ANU POONIA', '+919910582303', '9910582303; 9650446463', 'kiritpoonia0302@gmail.com', 'kiritpoonia0302@gmail.com', true, 'WORKBOOK', 'T2-501', 'T2', 2, '5', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":52,"OWNER NAME":"KIRIT AJAY POONIA\nANU POONIA","TOWER-\nFLATNO.":"T2-501","CONTACT DETAILS":"9910582303\n9650446463","EMAIL ID":"kiritpoonia0302@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (54, 53, 'a6f65b1c-8a10-51cd-994c-dc1540b9a104', 'owner-email:sushilrahi26@gmail.com', 'SUSHIL KUMAR RAHI', '+917837126232', '7837126232', 'sushilrahi26@gmail.com', 'sushilrahi26@gmail.com', true, 'WORKBOOK', 'T2-502', 'T2', 2, '5', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":53,"OWNER NAME":"SUSHIL KUMAR RAHI","TOWER-\nFLATNO.":"T2-502","CONTACT DETAILS":7837126232,"EMAIL ID":"sushilrahi26@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (55, 54, '4bff351c-54bb-54cd-9438-e1fc95fab1ad', 'owner-profile:raghupreet.singh:+919779457671', 'RAGHUPREET SINGH', '+919779457671', '9779457671', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-503', 'T2', 2, '5', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'GURINDER PAL TANDON; NAVDEEP TANDON; SUNNY CHOUDHARY;', '{"S.No":54,"OWNER NAME":"RAGHUPREET SINGH","TOWER-\nFLATNO.":"T2-503","CONTACT DETAILS":9779457671,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"GURINDER PAL TANDON; NAVDEEP TANDON; SUNNY CHOUDHARY;","AREA":2190,"RATE":3.25}'),
    (56, 55, '84cf49c6-a94f-5866-86e4-5366522fefba', 'owner-profile:rabia.gill:+919650911215', 'RABIA GILL', '+919650911215', '9650911215; 9910537258; 7837694945', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-601', 'T2', 2, '6', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'SANJEEV KUMAR VERMA;', '{"S.No":55,"OWNER NAME":"RABIA GILL","TOWER-\nFLATNO.":"T2-601","CONTACT DETAILS":"9650911215\n9910537258\n7837694945","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SANJEEV KUMAR VERMA;","AREA":2190,"RATE":3.25}'),
    (57, 56, '4f2bc497-fe04-52a9-88f6-e1fc592299f2', 'owner-email:jobansandhu22g@gmail.com', 'JOBANDEEP SINGH', '+919322310003', '9322310003; 9464305402', 'jobansandhu22g@gmail.com', 'jobansandhu22g@gmail.com', true, 'WORKBOOK', 'T2-602', 'T2', 2, '6', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; MAHAVIR SINGH; SURINDER PAL SINGH; DAMANPREET KAUR; PAYAL KAPOOR;', '{"S.No":56,"OWNER NAME":"JOBANDEEP SINGH","TOWER-\nFLATNO.":"T2-602","CONTACT DETAILS":"9322310003\n9464305402","EMAIL ID":"jobansandhu22g@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; MAHAVIR SINGH; SURINDER PAL SINGH; DAMANPREET KAUR; PAYAL KAPOOR;","AREA":2150,"RATE":3.25}'),
    (58, 57, '6ac50cb1-384b-5685-b814-2a7cf7a3c398', 'owner-profile:abhay.singh.saharan:+919814051419', 'ABHAY SINGH SAHARAN', '+919814051419', '9814051419', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-603', 'T2', 2, '6', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; ABHAY SINGH SAHARAN; VIJAY LAXMI; ESHA SAHARAN; ABEER SAHARAN;', '{"S.No":57,"OWNER NAME":"ABHAY SINGH SAHARAN","TOWER-\nFLATNO.":"T2-603","CONTACT DETAILS":9814051419,"EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; ABHAY SINGH SAHARAN; VIJAY LAXMI; ESHA SAHARAN; ABEER SAHARAN;","AREA":2190,"RATE":3.25}'),
    (59, 58, 'c07057f3-64f3-5f5d-98ae-6d934460ce43', 'owner-email:bholi1970@gmail.com', 'BHUPINDER KAUR', '+919779905640', '9779905640', 'bholi1970@gmail.com', 'bholi1970@gmail.com', true, 'WORKBOOK', 'T2-701', 'T2', 2, '7', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'HEAVENPREET KAUR; ARUN KUMAR;', '{"S.No":58,"OWNER NAME":"BHUPINDER KAUR","TOWER-\nFLATNO.":"T2-701","CONTACT DETAILS":9779905640,"EMAIL ID":"bholi1970@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HEAVENPREET KAUR; ARUN KUMAR;","AREA":2190,"RATE":3.25}'),
    (60, 59, '34dd6c22-6944-5ff4-aaa3-05303bcc88f4', 'owner-email:mansimarsinghmalhotra@gmail.com', 'KAMALPREET KAUR WALIA', '+919997718394', '9997718394', 'mansimarsinghmalhotra@gmail.com', 'mansimarsinghmalhotra@gmail.com', true, 'WORKBOOK', 'T2-702', 'T2', 2, '7', '2150 SQFT', 2150.00, 3.25, 'TENANT', 'TENANTED', 'MALVI NILESH; INDERJIT SINGH; AMAN KUMAR; JOBANPREET SINGH; SHARANJEET KAUR; ANOOP KUMAR; PARMVIR SINGH;', '{"S.No":59,"OWNER NAME":"KAMALPREET KAUR WALIA","TOWER-\nFLATNO.":"T2-702","CONTACT DETAILS":9997718394,"EMAIL ID":"mansimarsinghmalhotra@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MALVI NILESH; INDERJIT SINGH; AMAN KUMAR; JOBANPREET SINGH; SHARANJEET KAUR; ANOOP KUMAR; PARMVIR SINGH;","AREA":2150,"RATE":3.25}'),
    (61, 60, 'affa8e41-a32d-5852-96e8-2e85b3a56f07', 'owner-email:gurupharma647@rediffmail.com', 'GURPREET SINGH / HARDEEP WALIA', '+919416500647', '9416500647', 'gurupharma647@rediffmail.com', 'gurupharma647@rediffmail.com', true, 'WORKBOOK', 'T2-703', 'T2', 2, '7', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'JOLLY MITTAL; NISHA MITTAL; AMIT KOHLI', '{"S.No":60,"OWNER NAME":"GURPREET SINGH\nHARDEEP WALIA","TOWER-\nFLATNO.":"T2-703","CONTACT DETAILS":9416500647,"EMAIL ID":"gurupharma647@rediffmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JOLLY MITTAL; NISHA MITTAL; AMIT KOHLI","AREA":2190,"RATE":3.25}'),
    (62, 61, 'aca6b6e8-6dac-5284-8029-6b59392f2a48', 'owner-email:ravi3920@yahoo.com', 'RAVI KUMAR / HARKIRAT KAUR', '+919814078601', '9814078601', 'ravi3920@yahoo.com', 'ravi3920@yahoo.com', true, 'WORKBOOK', 'T2-801', 'T2', 2, '8', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":61,"OWNER NAME":"RAVI KUMAR\nHARKIRAT KAUR","TOWER-\nFLATNO.":"T2-801","CONTACT DETAILS":9814078601,"EMAIL ID":"ravi3920@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (63, 62, 'c67b61ae-c8d6-50d6-9e05-01ec165c1eb7', 'owner-email:puneetricha@gmail.com', 'KUMARI SUSHMA / RICHA SINGH', '+919988963874', '9988963874; 9815766685', 'puneetricha@gmail.com', 'puneetricha@gmail.com', true, 'WORKBOOK', 'T2-802', 'T2', 2, '8', '2150 SQFT', 2150.00, 3.25, 'TENANT', 'TENANTED', 'AKASHVEER SINGH SANDHU; JASKARAN SINGH; PRAKASH ;', '{"S.No":62,"OWNER NAME":"KUMARI SUSHMA\nRICHA SINGH","TOWER-\nFLATNO.":"T2-802","CONTACT DETAILS":"9988963874\n9815766685","EMAIL ID":"puneetricha@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"AKASHVEER SINGH SANDHU; JASKARAN SINGH; PRAKASH ©;","AREA":2150,"RATE":3.25}'),
    (64, 63, '4cd5886a-e708-5f44-9cee-da7270fccac0', 'owner-email:miglani18000@gmail.com', 'AKASHDEEP SINGH MIGNALI (ADV.)', '+919888112183', '9888112183', 'miglani18000@gmail.com', 'miglani18000@gmail.com', true, 'WORKBOOK', 'T2-803', 'T2', 2, '8', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":63,"OWNER NAME":"AKASHDEEP SINGH MIGNALI (ADV.)","TOWER-\nFLATNO.":"T2-803","CONTACT DETAILS":9888112183,"EMAIL ID":"miglani18000@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (65, 64, '1c7af568-951d-55ce-b6a6-929e3c68d7c0', 'owner-profile:anil.kumar.nidhi.mehta:+917397380937', 'ANIL KUMAR / NIDHI MEHTA', '+917397380937', '7397 380 937', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-901', 'T2', 2, '9', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":64,"OWNER NAME":"ANIL KUMAR\nNIDHI MEHTA","TOWER-\nFLATNO.":"T2-901","CONTACT DETAILS":"7397 380 937","EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (66, 65, 'f02487a8-cadf-51f1-9577-83f957d2027c', 'owner-email:yugofficial22@gmail.com', 'YOGESH SHARMA / VISHWA NATH SHARMA', '+919815165222', '9815165222', 'yugofficial22@gmail.com; kannu.kney65@gmail.com', 'yugofficial22@gmail.com', true, 'WORKBOOK', 'T2-902', 'T2', 2, '9', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":65,"OWNER NAME":"YOGESH SHARMA\nVISHWA NATH SHARMA","TOWER-\nFLATNO.":"T2-902","CONTACT DETAILS":9815165222,"EMAIL ID":"yugofficial22@gmail.com\nkannu.kney65@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (67, 66, '10b67492-6fe4-54f4-8314-dedcf9c96825', 'owner-email:officialmeeru@gmail.com', 'AMIR KHAN', '+919592938549', '9592938549', 'officialmeeru@gmail.com', 'officialmeeru@gmail.com', true, 'WORKBOOK', 'T2-903', 'T2', 2, '9', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":66,"OWNER NAME":"AMIR KHAN","TOWER-\nFLATNO.":"T2-903","CONTACT DETAILS":9592938549,"EMAIL ID":"officialmeeru@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (68, 67, '6f874c5e-48ce-5f49-8753-613cc4b6d493', 'owner-email:abhilash713@gmail.com', 'PRIYANKA BISHT', '+918699414428', '8699414428', 'abhilash713@gmail.com', 'abhilash713@gmail.com', true, 'WORKBOOK', 'T2-1001', 'T2', 2, '10', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":67,"OWNER NAME":"PRIYANKA BISHT","TOWER-\nFLATNO.":"T2-1001","CONTACT DETAILS":8699414428,"EMAIL ID":"abhilash713@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (69, 68, '28923887-74e7-5017-973a-b1b14751976a', 'owner-profile:darshan.lal.sachdeva:+919996193952', 'DARSHAN LAL SACHDEVA', '+919996193952', '9996193952', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-1002', 'T2', 2, '10', '2150 SQFT', 2150.00, 3.25, 'TENANT', 'TENANTED', 'JAGMEET SINGH; HARJINDER SINGH; KARAMDEEP SINGH; AJAIB SINGH;', '{"S.No":68,"OWNER NAME":"DARSHAN LAL SACHDEVA","TOWER-\nFLATNO.":"T2-1002","CONTACT DETAILS":9996193952,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JAGMEET SINGH; HARJINDER SINGH\nKARAMDEEP SINGH; AJAIB SINGH;","AREA":2150,"RATE":3.25}'),
    (70, 69, 'd0c90b1d-f459-5f84-8095-e5e2236142ee', 'owner-email:gundeep.250693@gmail.com', 'PRABHDEEP SINGH / GUNDEEP KAUR', '+918556000025', '8556000025; 8728000049', 'gundeep.250693@gmail.com', 'gundeep.250693@gmail.com', true, 'WORKBOOK', 'T2-1003', 'T2', 2, '10', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":69,"OWNER NAME":"PRABHDEEP SINGH\nGUNDEEP KAUR","TOWER-\nFLATNO.":"T2-1003","CONTACT DETAILS":"8556000025\n8728000049","EMAIL ID":"gundeep.250693@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (71, 70, '8a15bf84-7a70-53c5-846d-c96ab85d7f75', 'owner-profile:shelly.uppal:+8613823785501', 'SHELLY UPPAL', '+8613823785501', '+8613823785501', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-1101', 'T2', 2, '11', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'QUICK SILVER PRODUCTIONS; SUKHWINDER SINGH; ARVINDER SINGH KHAIRA', '{"S.No":70,"OWNER NAME":"SHELLY UPPAL","TOWER-\nFLATNO.":"T2-1101","CONTACT DETAILS":"+8613823785501","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"QUICK SILVER PRODUCTIONS; SUKHWINDER SINGH; ARVINDER SINGH KHAIRA","AREA":2190,"RATE":3.25}'),
    (72, 71, '885cbe2f-5419-5c4e-be24-66d3e0ff69d0', 'owner-email:goyaldeepesh30@gmail.com', 'DEEPESH GOYAL', '+919802473353', '9802473353; 8059027384', 'goyaldeepesh30@gmail.com', 'goyaldeepesh30@gmail.com', true, 'WORKBOOK', 'T2-1102', 'T2', 2, '11', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":71,"OWNER NAME":"DEEPESH GOYAL","TOWER-\nFLATNO.":"T2-1102","CONTACT DETAILS":"9802473353\n8059027384","EMAIL ID":"goyaldeepesh30@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (73, 72, 'e063b362-06bb-5b8b-9d95-3300b3bcec69', 'owner-profile:khyati.sharma:+919802473353', 'KHYATI SHARMA', '+919802473353', '9802473353', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T2-1103', 'T2', 2, '11', '2190 SQFT', 2190.00, 3.25, 'TENANT', 'TENANTED', 'MANDEEP SINGH; MEENU; JAGDEEP SINGH; VISHAKHA SHARMA;', '{"S.No":72,"OWNER NAME":"KHYATI SHARMA","TOWER-\nFLATNO.":"T2-1103","CONTACT DETAILS":9802473353,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANDEEP SINGH; MEENU\nJAGDEEP SINGH; VISHAKHA SHARMA;","AREA":2190,"RATE":3.25}'),
    (74, 73, 'a5a0f908-40a2-5d01-bafa-0b9b83d9b6c8', 'owner-email:thevillagersfilmstudio@gmail.com', 'BHAGWANT PAL SINGH / KULJIT SINGH', '+919988800097', '9988800097', 'thevillagersfilmstudio@gmail.com', 'thevillagersfilmstudio@gmail.com', true, 'WORKBOOK', 'T2-1201', 'T2', 2, '12', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":73,"OWNER NAME":"BHAGWANT PAL SINGH\nKULJIT SINGH","TOWER-\nFLATNO.":"T2-1201","CONTACT DETAILS":9988800097,"EMAIL ID":"thevillagersfilmstudio@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (75, 74, '850ec369-75db-50e4-b09b-f0e2e38e8792', 'owner-email:csprincetiwari@gmail.com', 'PUJA SHARMA', '+919910135201', '9910135201', 'csprincetiwari@gmail.com', 'csprincetiwari@gmail.com', true, 'WORKBOOK', 'T2-1202', 'T2', 2, '12', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":74,"OWNER NAME":"PUJA SHARMA","TOWER-\nFLATNO.":"T2-1202","CONTACT DETAILS":9910135201,"EMAIL ID":"csprincetiwari@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (76, 75, 'd5cb93d2-feba-53cc-9610-49df76029982', 'owner-email:supreet.malik1@gmail.com', 'SUPREET KAUR', '+919888155555', '9888155555', 'supreet.malik1@gmail.com', 'supreet.malik1@gmail.com', true, 'WORKBOOK', 'T2-1203', 'T2', 2, '12', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":75,"OWNER NAME":"SUPREET KAUR","TOWER-\nFLATNO.":"T2-1203","CONTACT DETAILS":9888155555,"EMAIL ID":"supreet.malik1@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (77, 76, 'fcaf03e6-4eee-5396-92d4-166626c20652', 'owner-email:singhamyamysingh@gmail.com', 'JASLEEN KAUR', '+918054540880', '8054540880', 'singhamyamysingh@gmail.com', 'singhamyamysingh@gmail.com', true, 'WORKBOOK', 'T2-1401', 'T2', 2, '14', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":76,"OWNER NAME":"JASLEEN KAUR","TOWER-\nFLATNO.":"T2-1401","CONTACT DETAILS":8054540880,"EMAIL ID":"singhamyamysingh@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (78, 77, 'bf17df8e-edc3-5fbe-98f5-90cdb0838824', 'owner-email:manusekhon52@gmail.com', 'KULDEEP SINGH PANNU / MANU SEKHON', '+919876800052', '9876800052; 9965700003; 9675100052', 'manusekhon52@gmail.com; manusekhon01@gmail.com', 'manusekhon52@gmail.com', true, 'WORKBOOK', 'T2-1402', 'T2', 2, '14', '2150 SQFT', 2150.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":77,"OWNER NAME":"KULDEEP SINGH PANNU\nMANU SEKHON","TOWER-\nFLATNO.":"T2-1402","CONTACT DETAILS":"9876800052\n9965700003\n9675100052","EMAIL ID":"manusekhon52@gmail.com\nmanusekhon01@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2150,"RATE":3.25}'),
    (79, 78, 'f7f52cd3-a0c7-5930-b60e-2716034880ad', 'owner-email:ashumsahni@gmail.com', 'ASHU SAHNI / MUNISH SAHNI', '+919876711234', '9876711234; 9988460290', 'ashumsahni@gmail.com', 'ashumsahni@gmail.com', true, 'WORKBOOK', 'T2-1403', 'T2', 2, '14', '2190 SQFT', 2190.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":78,"OWNER NAME":"ASHU SAHNI\nMUNISH SAHNI","TOWER-\nFLATNO.":"T2-1403","CONTACT DETAILS":"9876711234\n9988460290","EMAIL ID":"ashumsahni@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2190,"RATE":3.25}'),
    (80, 79, 'fd4430b5-7efc-588e-9d3b-239e79373ee4', 'owner-email:tajinderbhaini1996@gmail.com', 'SALEEM KHAN', '+919915664837', '9915664837; 9876416725', 'tajinderbhaini1996@gmail.com', 'tajinderbhaini1996@gmail.com', true, 'WORKBOOK', 'T3-101', 'T3', 3, '1', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":79,"OWNER NAME":"SALEEM KHAN","TOWER-\nFLATNO.":"T3-101","CONTACT DETAILS":"9915664837\n9876416725","EMAIL ID":"tajinderbhaini1996@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (81, 80, '8d17794e-55fe-577e-a900-1570a26c616f', 'owner-profile:vikram.sood:+919816668068', 'VIKRAM SOOD', '+919816668068', '9816668068', 'soodiron68@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T3-102', 'T3', 3, '1', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":80,"OWNER NAME":"VIKRAM SOOD","TOWER-\nFLATNO.":"T3-102","CONTACT DETAILS":9816668068,"EMAIL ID":"soodiron68@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (82, 81, '92489529-cc12-542c-bce5-a8581c23ea69', 'owner-profile:puneet.singh:+919815988428', 'PUNEET SINGH', '+919815988428', '9815988428', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T3-201', 'T3', 3, '2', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'PARVINDER SINGH; INDERJEET SINGH; HARSHPREET SINGH;', '{"S.No":81,"OWNER NAME":"PUNEET SINGH","TOWER-\nFLATNO.":"T3-201","CONTACT DETAILS":9815988428,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PARVINDER SINGH; INDERJEET SINGH; HARSHPREET SINGH;","AREA":2300,"RATE":3.25}'),
    (83, 82, '9025c6f9-0313-539d-ad18-879d82081d6f', 'owner-profile:pooja.sood:+919816668068', 'POOJA SOOD', '+919816668068', '9816668068', 'soodiron68@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T3-202', 'T3', 3, '2', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":82,"OWNER NAME":"POOJA SOOD","TOWER-\nFLATNO.":"T3-202","CONTACT DETAILS":9816668068,"EMAIL ID":"soodiron68@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (84, 83, '8a86da83-fbfe-5761-8df5-c510087630a9', 'owner-email:kscheema@yahoo.com', 'KULJIT SINGH / HARJEET KAUR', '0015805041445', '001-5805041445; 9915844857', 'kscheema@yahoo.com', 'kscheema@yahoo.com', true, 'WORKBOOK', 'T3-301', 'T3', 3, '3', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":83,"OWNER NAME":"KULJIT SINGH\nHARJEET KAUR","TOWER-\nFLATNO.":"T3-301","CONTACT DETAILS":"001-5805041445\n9915844857","EMAIL ID":"kscheema@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (85, 84, '2b84694e-de7b-539f-9018-8f0ce17f4f1a', 'owner-email:vikram.v2008@gmail.com', 'RAM DEV SHARMA / VIKRAM VASHISHT', '+919971200880', '99712 00880', 'vikram.v2008@gmail.com; poonam.v2002@gmail.com', 'vikram.v2008@gmail.com', true, 'WORKBOOK', 'T3-302', 'T3', 3, '3', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":84,"OWNER NAME":"RAM DEV SHARMA\nVIKRAM VASHISHT","TOWER-\nFLATNO.":"T3-302","CONTACT DETAILS":"99712 00880","EMAIL ID":"vikram.v2008@gmail.com\npoonam.v2002@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (86, 85, '100abb88-7160-54cb-ae6f-faa3662f8adb', 'owner-profile:wassan.singh:+919779860528', 'WASSAN SINGH', '+919779860528', '9779860528', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T3-401', 'T3', 3, '4', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'YT MONEY PRODUCTIONS THROUGH DIRECTOR; NIKIT BASSI; AMITA KAUSHAL;', '{"S.No":85,"OWNER NAME":"WASSAN SINGH","TOWER-\nFLATNO.":"T3-401","CONTACT DETAILS":9779860528,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"YT MONEY PRODUCTIONS THROUGH DIRECTOR; NIKIT BASSI; AMITA KAUSHAL;","AREA":2300,"RATE":3.25}'),
    (87, 86, '3453f78b-0a23-51d2-9ffb-62e47f81cf7e', 'owner-email:sakshisainiofficial@gmail.com', 'NARINDER SAINI / RAJ KUMAR SAINI', '+919888043381', '9888043381; 9988093381', 'sakshisainiofficial@gmail.com', 'sakshisainiofficial@gmail.com', true, 'WORKBOOK', 'T3-402', 'T3', 3, '4', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":86,"OWNER NAME":"NARINDER SAINI\nRAJ KUMAR SAINI","TOWER-\nFLATNO.":"T3-402","CONTACT DETAILS":"9888043381\n9988093381","EMAIL ID":"sakshisainiofficial@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (88, 87, '0b7e03a2-ddcd-59f5-908a-2bbdba4e5833', 'owner-email:parampreets@gmail.com', 'PARAMPREET SINGH', '+919814256487', '9814256487', 'parampreets@gmail.com', 'parampreets@gmail.com', true, 'WORKBOOK', 'T3-501', 'T3', 3, '5', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; GURMINDER KAUR; AADI SINGH; PARAMPREET SINGH; SATINDERPAL SINGH SAGGU;', '{"S.No":87,"OWNER NAME":"PARAMPREET SINGH","TOWER-\nFLATNO.":"T3-501","CONTACT DETAILS":9814256487,"EMAIL ID":"parampreets@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; GURMINDER KAUR; AADI SINGH; PARAMPREET SINGH; SATINDERPAL SINGH SAGGU;","AREA":2300,"RATE":3.25}'),
    (89, 88, 'd6ae0041-42f0-5233-bc1f-46344675ee45', 'owner-email:ayushikhullar12@gmail.com', 'AYUSHI KHULLAR', '+919149883202', '9149883202', 'ayushikhullar12@gmail.com', 'ayushikhullar12@gmail.com', true, 'WORKBOOK', 'T3-502', 'T3', 3, '5', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":88,"OWNER NAME":"AYUSHI KHULLAR","TOWER-\nFLATNO.":"T3-502","CONTACT DETAILS":9149883202,"EMAIL ID":"ayushikhullar12@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (90, 89, '0bed3c2d-ca24-5158-89ed-c11725d12de1', 'owner-email:dwivedisp@yahoo.com', 'ADITI DWIVEDI', '+919592912018', '9592912018', 'dwivedisp@yahoo.com', 'dwivedisp@yahoo.com', true, 'WORKBOOK', 'T3-601', 'T3', 3, '6', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'NEAL NAVINCHANDRA SONI; SHARANJIT KAUR SONI; NEZLIN KAUR; NAVINCHANDRA MOTILAL SONI;', '{"S.No":89,"OWNER NAME":"ADITI DWIVEDI","TOWER-\nFLATNO.":"T3-601","CONTACT DETAILS":9592912018,"EMAIL ID":"dwivedisp@yahoo.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NEAL NAVINCHANDRA SONI; SHARANJIT KAUR SONI; NEZLIN KAUR; NAVINCHANDRA MOTILAL SONI;","AREA":2300,"RATE":3.25}'),
    (91, 90, 'daacae3e-6193-565b-ab7e-d578be586e71', 'owner-email:kumarvipin1910@gmail.com', 'VIPIN KUMAR', '+919417096566', '9417096566', 'kumarvipin1910@gmail.com', 'kumarvipin1910@gmail.com', true, 'WORKBOOK', 'T3-602', 'T3', 3, '6', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":90,"OWNER NAME":"VIPIN KUMAR","TOWER-\nFLATNO.":"T3-602","CONTACT DETAILS":9417096566,"EMAIL ID":"kumarvipin1910@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (92, 91, '4aad6ff4-20fe-5912-b4da-20135a3e9b6e', 'owner-email:vishpahwa@gmail.com', 'JYOTSNA KHATRI / VISHAL PAHWA', '+919987310333', '9987310333', 'vishpahwa@gmail.com', 'vishpahwa@gmail.com', true, 'WORKBOOK', 'T3-701', 'T3', 3, '7', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'BHAGWANT SINGH; HARMIT SINGH; MEET SINGH; SHUBHAM BANSAL; AMANINDER SINGH; LAKHWINDER SINGH; BAHADUR CARETAKER;', '{"S.No":91,"OWNER NAME":"JYOTSNA KHATRI\nVISHAL PAHWA","TOWER-\nFLATNO.":"T3-701","CONTACT DETAILS":9987310333,"EMAIL ID":"vishpahwa@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"BHAGWANT SINGH; HARMIT SINGH; MEET SINGH; SHUBHAM BANSAL; AMANINDER SINGH; LAKHWINDER SINGH; BAHADUR CARETAKER;","AREA":2300,"RATE":3.25}'),
    (93, 92, 'dd8037f8-9e06-5f17-ada0-d658eeb22f05', 'owner-email:poojasaharan335@gmail.com', 'SUMAN BALA', '+918194991155', '8194991155', 'poojasaharan335@gmail.com', 'poojasaharan335@gmail.com', true, 'WORKBOOK', 'T3-702', 'T3', 3, '7', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; SUMAN BALA; ANIRUDDHA LOOMBA; POOJA SAHARAN;', '{"S.No":92,"OWNER NAME":"SUMAN BALA","TOWER-\nFLATNO.":"T3-702","CONTACT DETAILS":8194991155,"EMAIL ID":"poojasaharan335@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; SUMAN BALA; ANIRUDDHA LOOMBA; POOJA SAHARAN;","AREA":2300,"RATE":3.25}'),
    (94, 93, 'b802f999-b7ab-516a-9ac2-166c8c153f0b', 'owner-email:rahul.bir10@gmail.com', 'RAHULBIR SINGH', '+918196963333', '8196963333', 'rahul.bir10@gmail.com', 'rahul.bir10@gmail.com', true, 'WORKBOOK', 'T3-801', 'T3', 3, '8', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":93,"OWNER NAME":"RAHULBIR SINGH","TOWER-\nFLATNO.":"T3-801","CONTACT DETAILS":8196963333,"EMAIL ID":"rahul.bir10@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (95, 94, '0642be1a-a56c-5871-8f6d-fd2612fc6cc4', 'owner-email:manugarg8586@gmail.com', 'MANU GARG', '+919256600005', '9256600005', 'manugarg8586@gmail.com', 'manugarg8586@gmail.com', true, 'WORKBOOK', 'T3-802', 'T3', 3, '8', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":94,"OWNER NAME":"MANU GARG","TOWER-\nFLATNO.":"T3-802","CONTACT DETAILS":9256600005,"EMAIL ID":"manugarg8586@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (96, 95, 'a2e412a9-b40c-567e-9af1-28dd129af5b7', 'owner-email:appuforever@gmail.com', 'PRANADHARTHI MAHADEVAN / NAMITA MAHADEVAN', '+919810122506', '9810122506', 'appuforever@gmail.com; namitamahadevan@gmail.com', 'appuforever@gmail.com', true, 'WORKBOOK', 'T3-901', 'T3', 3, '9', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'VINAYAKA PRAKASH; SURBHI JASSI; DAMANJEET KAUR;', '{"S.No":95,"OWNER NAME":"PRANADHARTHI MAHADEVAN\nNAMITA MAHADEVAN","TOWER-\nFLATNO.":"T3-901","CONTACT DETAILS":9810122506,"EMAIL ID":"appuforever@gmail.com\nnamitamahadevan@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VINAYAKA PRAKASH; SURBHI JASSI; DAMANJEET KAUR;","AREA":2300,"RATE":3.25}'),
    (97, 96, 'b0c55d1a-fe3d-545f-9f5b-3365946ee523', 'owner-email:vishalladwa98@gmail.com', 'VISHAL', '+919992223440', '9992223440; 9053882441', 'vishalladwa98@gmail.com; diilpreetkaur1999@gmail.com', 'vishalladwa98@gmail.com', true, 'WORKBOOK', 'T3-902', 'T3', 3, '9', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":96,"OWNER NAME":"VISHAL","TOWER-\nFLATNO.":"T3-902","CONTACT DETAILS":"9992223440\n9053882441","EMAIL ID":"vishalladwa98@gmail.com\ndiilpreetkaur1999@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (98, 97, '438ac6a2-1295-500c-b07f-d10b72b18e45', 'owner-email:nanda.prashant98@gmail.com', 'PRERNA NANDA', '+918195986967', '8195986967; 7696044888', 'nanda.prashant98@gmail.com; udainanda@hotmail.com', 'nanda.prashant98@gmail.com', true, 'WORKBOOK', 'T3-1001', 'T3', 3, '10', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":97,"OWNER NAME":"PRERNA NANDA","TOWER-\nFLATNO.":"T3-1001","CONTACT DETAILS":"8195986967\n7696044888","EMAIL ID":"nanda.prashant98@gmail.com\nudainanda@hotmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (99, 98, 'cd4df5d8-126e-5424-9f55-789c53028cf9', 'owner-email:id.bakshi@gmail.com', 'INDERDEEP SINGH', '+919814212942', '98142 12942', 'id.bakshi@gmail.com', 'id.bakshi@gmail.com', true, 'WORKBOOK', 'T3-1002', 'T3', 3, '10', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; INDERDEEP SINGH; MANDEEP KAUR;', '{"S.No":98,"OWNER NAME":"INDERDEEP SINGH","TOWER-\nFLATNO.":"T3-1002","CONTACT DETAILS":"98142 12942","EMAIL ID":"id.bakshi@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; INDERDEEP SINGH; MANDEEP KAUR;","AREA":2300,"RATE":3.25}'),
    (100, 99, '4396a337-0230-534e-95ee-6cbe965cd63d', 'owner-email:prreetkamal@gmail.com', 'JASPREET KAUR / PREET KAMAL', '+919256722222', '9256722222', 'prreetkamal@gmail.com', 'prreetkamal@gmail.com', true, 'WORKBOOK', 'T3-1101', 'T3', 3, '11', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":99,"OWNER NAME":"JASPREET KAUR\nPREET KAMAL","TOWER-\nFLATNO.":"T3-1101","CONTACT DETAILS":9256722222,"EMAIL ID":"prreetkamal@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (101, 100, 'a572ba82-46ea-5eab-b0ea-eda46b855499', 'owner-profile:harvinder.singh.bakshi.kiran.bakshi:+919416113328', 'HARVINDER SINGH BAKSHI / KIRAN BAKSHI', '+919416113328', '9416113328', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T3-1102', 'T3', 3, '11', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'VIKAS VAID; KIRTI KUMAR; SHIVAM GARG;', '{"S.No":100,"OWNER NAME":"HARVINDER SINGH BAKSHI\nKIRAN BAKSHI","TOWER-\nFLATNO.":"T3-1102","CONTACT DETAILS":9416113328,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VIKAS VAID; KIRTI KUMAR; SHIVAM GARG;","AREA":2300,"RATE":3.25}'),
    (102, 101, 'ce42babd-6b79-5e38-a79b-4dc913c25123', 'owner-email:ramansingh26@gmail.com', 'AMRINDER KAUR / RAMANDEEP SINGH', '+919815329971', '9815329971', 'ramansingh26@gmail.com', 'ramansingh26@gmail.com', true, 'WORKBOOK', 'T3-1201', 'T3', 3, '12', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'VACANT', 'VACANT', '{"S.No":101,"OWNER NAME":"AMRINDER KAUR\nRAMANDEEP SINGH","TOWER-\nFLATNO.":"T3-1201","CONTACT DETAILS":9815329971,"EMAIL ID":"ramansingh26@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (103, 102, 'c655ac97-bcee-566f-9daa-c4eaf6c16cc7', 'owner-email:sukhpalss@gmail.com', 'SUKHPAL SINGH SUR', '+919876514001', '9876514001', 'sukhpalss@gmail.com; jkssur@gmail.com', 'sukhpalss@gmail.com', true, 'WORKBOOK', 'T3-1202', 'T3', 3, '12', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":102,"OWNER NAME":"SUKHPAL SINGH SUR","TOWER-\nFLATNO.":"T3-1202","CONTACT DETAILS":9876514001,"EMAIL ID":"sukhpalss@gmail.com\njkssur@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (104, 103, 'e877a68a-35f6-5097-a687-da4a501555e4', 'owner-email:subhashgoyal9891409614@gmail.com', 'SHIPRA GOYAL', '+919811061929', '9811061929; 9891409614', 'subhashgoyal9891409614@gmail.com', 'subhashgoyal9891409614@gmail.com', true, 'WORKBOOK', 'T3-1401', 'T3', 3, '14', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":103,"OWNER NAME":"SHIPRA GOYAL","TOWER-\nFLATNO.":"T3-1401","CONTACT DETAILS":"9811061929\n9891409614","EMAIL ID":"subhashgoyal9891409614@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (105, 104, 'a2b1a11b-5ba9-59b6-b4cf-f1d42759e637', 'owner-email:sandeep.dugar@outlook.com', 'SANDEEP DUGAR / REKHA DUGAR', '+919646490002', '9646490002', 'sandeep.dugar@outlook.com', 'sandeep.dugar@outlook.com', true, 'WORKBOOK', 'T3-1402', 'T3', 3, '14', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":104,"OWNER NAME":"SANDEEP DUGAR\nREKHA DUGAR","TOWER-\nFLATNO.":"T3-1402","CONTACT DETAILS":9646490002,"EMAIL ID":"sandeep.dugar@outlook.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (106, 105, 'eae0656a-9f3b-5fe5-8c07-98ddb0082678', 'owner-email:bhupeshgupta76@gmail.com', 'BHUPESH GUPTA', '+919417602419', '9417602419', 'bhupeshgupta76@gmail.com', 'bhupeshgupta76@gmail.com', true, 'WORKBOOK', 'T4-101', 'T4', 4, '1', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":105,"OWNER NAME":"BHUPESH GUPTA","TOWER-\nFLATNO.":"T4-101","CONTACT DETAILS":9417602419,"EMAIL ID":"bhupeshgupta76@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (107, 106, 'e3fa11e0-3d45-55fc-96a8-c2b5359c0640', 'owner-email:manjitsinghchawla@gmail.com', 'MANJIT SINGH CHAWLA', '+917738915454', '7738915454', 'manjitsinghchawla@gmail.com', 'manjitsinghchawla@gmail.com', true, 'WORKBOOK', 'T4-102', 'T4', 4, '1', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":106,"OWNER NAME":"MANJIT SINGH CHAWLA","TOWER-\nFLATNO.":"T4-102","CONTACT DETAILS":7738915454,"EMAIL ID":"manjitsinghchawla@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (108, 107, 'f800fd52-5905-5c8d-923c-7bbb3814971a', 'owner-email:karanvirsinghbaidwan96@gmail.com', 'CHARANJIT SINGH', '+917087193056', '7087193056', 'karanvirsinghbaidwan96@gmail.com', 'karanvirsinghbaidwan96@gmail.com', true, 'WORKBOOK', 'T4-201', 'T4', 4, '2', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":107,"OWNER NAME":"CHARANJIT SINGH","TOWER-\nFLATNO.":"T4-201","CONTACT DETAILS":7087193056,"EMAIL ID":"karanvirsinghbaidwan96@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (109, 108, '16be9bed-d2df-5df6-ab18-e117f067c67c', 'owner-email:s.rungnapha@hotmail.com', 'RUNGNAPHA SUCHONSAMRAN', '+919818335693', '9818335693', 's.rungnapha@hotmail.com; s.rungnapha@gmail.com', 's.rungnapha@hotmail.com', true, 'WORKBOOK', 'T4-202', 'T4', 4, '2', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'JERRY; KHUSHHAL SINGH RANA;', '{"S.No":108,"OWNER NAME":"RUNGNAPHA SUCHONSAMRAN","TOWER-\nFLATNO.":"T4-202","CONTACT DETAILS":9818335693,"EMAIL ID":"s.rungnapha@hotmail.com\ns.rungnapha@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JERRY; KHUSHHAL SINGH RANA;","AREA":2300,"RATE":3.25}'),
    (110, 109, 'f45f8a1e-eabc-5ff2-8e0a-8921e869c01d', 'owner-profile:manjit.sandhu:+919779860528', 'MANJIT SANDHU', '+919779860528', '9779860528', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-301', 'T4', 4, '3', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'PARUL NARWAL; ANJALI; JHANVI SHARMA;', '{"S.No":109,"OWNER NAME":"MANJIT SANDHU","TOWER-\nFLATNO.":"T4-301","CONTACT DETAILS":9779860528,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PARUL NARWAL; ANJALI; JHANVI SHARMA;","AREA":2300,"RATE":3.25}'),
    (111, 110, '56371d1a-94c2-548f-b5bc-055a2db0eea8', 'owner-profile:raminder.kaur:+919779911007', 'RAMINDER KAUR', '+919779911007', '9779911007; +1(516) 6443500', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-302', 'T4', 4, '3', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":110,"OWNER NAME":"RAMINDER KAUR","TOWER-\nFLATNO.":"T4-302","CONTACT DETAILS":"9779911007\n+1(516) 6443500","EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":2300,"RATE":3.25}'),
    (112, 111, 'a54f7f09-5ee4-55ae-9e16-a70ad180994b', 'owner-profile:dilkaran.singh.bhatia.anupreet.kaur.bhatia:+919915774415', 'DILKARAN SINGH BHATIA / ANUPREET KAUR BHATIA', '+919915774415', '9915774415', 'dilkaransingh01@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-401', 'T4', 4, '4', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'NITESH; BAL BAHADUR (ATTENDANT);', '{"S.No":111,"OWNER NAME":"DILKARAN SINGH BHATIA\nANUPREET KAUR BHATIA","TOWER-\nFLATNO.":"T4-401","CONTACT DETAILS":9915774415,"EMAIL ID":"dilkaransingh01@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NITESH; BAL BAHADUR (ATTENDANT);","AREA":2300,"RATE":3.25}'),
    (113, 112, '36c68172-8df9-502e-bfcb-2c9eedb909d4', 'owner-email:ranjitrandhawa72@gmail.com', 'RANJIT SINGH RANDHAWA / NAMRITA RANDHAWA', '+919876080758', '9876080758; 9888750758', 'ranjitrandhawa72@gmail.com', 'ranjitrandhawa72@gmail.com', true, 'WORKBOOK', 'T4-402', 'T4', 4, '4', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'NAVTESH PARMAR; ADITI (MANAGER & STAFF); AIR BNB', '{"S.No":112,"OWNER NAME":"RANJIT SINGH RANDHAWA\nNAMRITA RANDHAWA","TOWER-\nFLATNO.":"T4-402","CONTACT DETAILS":"9876080758\n9888750758","EMAIL ID":"ranjitrandhawa72@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NAVTESH PARMAR; ADITI (MANAGER & STAFF); AIR BNB","AREA":2300,"RATE":3.25}'),
    (114, 113, '54c3e098-06da-5d91-81d5-6ce72a470e88', 'owner-email:b.singh76@gmail.com', 'BALVINDER SINGH', '+919871210188', '9871210188', 'b.singh76@gmail.com', 'b.singh76@gmail.com', true, 'WORKBOOK', 'T4-501', 'T4', 4, '5', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":113,"OWNER NAME":"BALVINDER SINGH","TOWER-\nFLATNO.":"T4-501","CONTACT DETAILS":9871210188,"EMAIL ID":"b.singh76@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (115, 114, '54c3e098-06da-5d91-81d5-6ce72a470e88', 'owner-email:b.singh76@gmail.com', 'BALVINDER SINGH', '+919871210188', '9871210188', 'b.singh76@gmail.com', 'b.singh76@gmail.com', true, 'WORKBOOK', 'T4-502', 'T4', 4, '5', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":114,"OWNER NAME":"BALVINDER SINGH","TOWER-\nFLATNO.":"T4-502","CONTACT DETAILS":9871210188,"EMAIL ID":"b.singh76@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (116, 115, '1fc1c023-01df-5300-b31e-5238c8684224', 'owner-profile:harbir.singh.bhalla:+918556005534', 'HARBIR SINGH BHALLA', '+918556005534', '8556005534', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-601', 'T4', 4, '6', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'SUKHWINDER SINGH;', '{"S.No":115,"OWNER NAME":"HARBIR SINGH BHALLA","TOWER-\nFLATNO.":"T4-601","CONTACT DETAILS":8556005534,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SUKHWINDER SINGH;","AREA":2300,"RATE":3.25}'),
    (117, 116, '4b67748e-1769-5222-bb2a-d8c274d9af0b', 'owner-email:cute.jesse@yahoo.co.in', 'JASPREET KAUR / JASBIR SINGH', '+919988880665', '9988880665', 'cute.jesse@yahoo.co.in', 'cute.jesse@yahoo.co.in', true, 'WORKBOOK', 'T4-602', 'T4', 4, '6', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":116,"OWNER NAME":"JASPREET KAUR\nJASBIR SINGH","TOWER-\nFLATNO.":"T4-602","CONTACT DETAILS":9988880665,"EMAIL ID":"cute.jesse@yahoo.co.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (118, 117, '8868d6cc-3426-5055-9020-63e8b6e065bf', 'owner-profile:roopkanwal.kaur:+917837832710', 'ROOPKANWAL KAUR', '+917837832710', '7837832710', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-701', 'T4', 4, '7', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'HARDIAL SINGH SONI;', '{"S.No":117,"OWNER NAME":"ROOPKANWAL KAUR","TOWER-\nFLATNO.":"T4-701","CONTACT DETAILS":7837832710,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HARDIAL SINGH SONI;","AREA":2300,"RATE":3.25}'),
    (119, 118, 'a2af5a9f-5fad-5eee-a115-aa91471e8675', 'owner-email:thegarysingh@gmail.com', 'SOMNATH SINGH', '+919920400999', '9920400999', 'thegarysingh@gmail.com', 'thegarysingh@gmail.com', true, 'WORKBOOK', 'T4-702', 'T4', 4, '7', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":118,"OWNER NAME":"SOMNATH SINGH","TOWER-\nFLATNO.":"T4-702","CONTACT DETAILS":9920400999,"EMAIL ID":"thegarysingh@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (120, 119, '339cbcab-d711-56a6-80d6-e03c12da3ec9', 'owner-email:pujabhanot@gmail.com', 'ARUN KUMAR BHANOT', '+919465266053', '9465266053', 'pujabhanot@gmail.com', 'pujabhanot@gmail.com', true, 'WORKBOOK', 'T4-801', 'T4', 4, '8', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":119,"OWNER NAME":"ARUN KUMAR BHANOT","TOWER-\nFLATNO.":"T4-801","CONTACT DETAILS":9465266053,"EMAIL ID":"pujabhanot@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (121, 120, '10d77156-1e3f-5a8c-bd93-2fc22d6f976f', 'owner-email:apkhaira80@gmail.com', 'BIKRAMJIT SINGH / KARAMJIT KAUR', '+919872266107', '9872266107', 'apkhaira80@gmail.com', 'apkhaira80@gmail.com', true, 'WORKBOOK', 'T4-802', 'T4', 4, '8', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'SATWINDER SINGH (MONTY); ARVINDERPAL SINGH MALUKA; JASPREET SINGH; NAVNEET SINGH;', '{"S.No":120,"OWNER NAME":"BIKRAMJIT SINGH\nKARAMJIT KAUR","TOWER-\nFLATNO.":"T4-802","CONTACT DETAILS":9872266107,"EMAIL ID":"apkhaira80@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SATWINDER SINGH (MONTY); ARVINDERPAL SINGH MALUKA; JASPREET SINGH; NAVNEET SINGH;","AREA":2300,"RATE":3.25}'),
    (122, 121, '7aca63c4-89ef-5018-85e7-f672ac4b05e9', 'owner-profile:gunbir.singh.sidhu:+919815946777', 'GUNBIR SINGH SIDHU', '+919815946777', '9815946777; 9376356000', 'yashasvikasana28@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-901', 'T4', 4, '9', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'FURQAN FAROOQ; IRFAN BHAT;', '{"S.No":121,"OWNER NAME":"GUNBIR SINGH SIDHU","TOWER-\nFLATNO.":"T4-901","CONTACT DETAILS":"9815946777\n9376356000","EMAIL ID":"yashasvikasana28@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"FURQAN FAROOQ; IRFAN BHAT;","AREA":2300,"RATE":3.25}'),
    (123, 122, 'c7bba78f-ce69-565f-be6c-d27f1b8cea67', 'owner-profile:manmord.singh.sidhu:+919815946777', 'MANMORD SINGH SIDHU', '+919815946777', '9815946777', 'yashasvikasana28@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T4-902', 'T4', 4, '9', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":122,"OWNER NAME":"MANMORD SINGH SIDHU","TOWER-\nFLATNO.":"T4-902","CONTACT DETAILS":9815946777,"EMAIL ID":"yashasvikasana28@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (124, 123, 'e03d1f42-8343-541e-8be5-3a79417d401b', 'owner-email:raghavtaneja18oct@gmail.com', 'SEEMA TANEJA', '+917030478827', '7030478827', 'raghavtaneja18oct@gmail.com', 'raghavtaneja18oct@gmail.com', true, 'WORKBOOK', 'T4-1001', 'T4', 4, '10', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'VIJAY BANSAL;', '{"S.No":123,"OWNER NAME":"SEEMA TANEJA","TOWER-\nFLATNO.":"T4-1001","CONTACT DETAILS":7030478827,"EMAIL ID":"raghavtaneja18oct@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VIJAY BANSAL;","AREA":2300,"RATE":3.25}'),
    (125, 124, 'f918ae8f-91f2-5685-b1a6-ddb626eef5c0', 'owner-email:bajwadeep08@gmail.com', 'GURSHARANJEET KAUR', '+918054367110', '8054367110', 'bajwadeep08@gmail.com', 'bajwadeep08@gmail.com', true, 'WORKBOOK', 'T4-1002', 'T4', 4, '10', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":124,"OWNER NAME":"GURSHARANJEET KAUR","TOWER-\nFLATNO.":"T4-1002","CONTACT DETAILS":8054367110,"EMAIL ID":"bajwadeep08@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (126, 125, '1072d75c-51d1-58b1-afe5-7e7f5243458a', 'owner-email:0001mukhtiarsinghkoom@gmail.com', 'MUKHTIAR SINGH', '+918427185464', '8427185464', '0001mukhtiarsinghkoom@gmail.com', '0001mukhtiarsinghkoom@gmail.com', true, 'WORKBOOK', 'T4-1101', 'T4', 4, '11', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":125,"OWNER NAME":"MUKHTIAR SINGH","TOWER-\nFLATNO.":"T4-1101","CONTACT DETAILS":8427185464,"EMAIL ID":"0001mukhtiarsinghkoom@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (127, 126, '60a73d24-5a33-5270-88e0-f9a7e99922c3', 'owner-email:awalbindras@gmail.com', 'AWALDEEP BINDRA', '+919815025028', '9815025028', 'awalbindras@gmail.com', 'awalbindras@gmail.com', true, 'WORKBOOK', 'T4-1102', 'T4', 4, '11', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'DANESH DINSHAW CHOTIA; AESHNA DASGUPTA;', '{"S.No":126,"OWNER NAME":"AWALDEEP BINDRA","TOWER-\nFLATNO.":"T4-1102","CONTACT DETAILS":9815025028,"EMAIL ID":"awalbindras@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"DANESH DINSHAW CHOTIA; AESHNA DASGUPTA;","AREA":2300,"RATE":3.25}'),
    (128, 127, '454bf2d1-a99e-513f-b205-06d961c8d47a', 'owner-email:pratdhaw@gmail.com', 'PRATEEK DHAWAN', '+919914306004', '9914306004', 'pratdhaw@gmail.com', 'pratdhaw@gmail.com', true, 'WORKBOOK', 'T4-1201', 'T4', 4, '12', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":127,"OWNER NAME":"PRATEEK DHAWAN","TOWER-\nFLATNO.":"T4-1201","CONTACT DETAILS":9914306004,"EMAIL ID":"pratdhaw@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (129, 128, '83ec37f2-12cb-5ff0-b6ba-82b3cac74788', 'owner-email:monga.nitin@gmail.com', 'NITIN / PRAVESH ARYA', '+919780361100', '9780361100; 8851564961', 'monga.nitin@gmail.com', 'monga.nitin@gmail.com', true, 'WORKBOOK', 'T4-1202', 'T4', 4, '12', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":128,"OWNER NAME":"NITIN\nPRAVESH ARYA","TOWER-\nFLATNO.":"T4-1202","CONTACT DETAILS":"9780361100\n8851564961","EMAIL ID":"monga.nitin@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (130, 129, '4dbd907e-f66e-50ed-88db-9ae56ab471e2', 'owner-email:channikharar50@gmail.com', 'MANDEEP KAUR TAKHAR', '+919833983689', '9833983689', 'channikharar50@gmail.com', 'channikharar50@gmail.com', true, 'WORKBOOK', 'T4-1401', 'T4', 4, '14', '2300 SQFT', 2300.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":129,"OWNER NAME":"MANDEEP KAUR TAKHAR","TOWER-\nFLATNO.":"T4-1401","CONTACT DETAILS":9833983689,"EMAIL ID":"channikharar50@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":2300,"RATE":3.25}'),
    (131, 130, '4fe43897-c5a5-52fe-8716-3dd410d1037c', 'owner-email:lpcindiamohali@gmail.com', 'DALJIT SINGH', '+919592324695', '9592324695', 'lpcindiamohali@gmail.com', 'lpcindiamohali@gmail.com', true, 'WORKBOOK', 'T4-1402', 'T4', 4, '14', '2300 SQFT', 2300.00, 3.25, 'TENANT', 'TENANTED', 'DAVPINDER SINGH; BHUPINDER SINGH; DEEPAK KUMAR;', '{"S.No":130,"OWNER NAME":"DALJIT SINGH","TOWER-\nFLATNO.":"T4-1402","CONTACT DETAILS":9592324695,"EMAIL ID":"lpcindiamohali@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"DAVPINDER SINGH; BHUPINDER SINGH; DEEPAK KUMAR;","AREA":2300,"RATE":3.25}'),
    (132, 131, '3baa1685-9c8e-543e-a3eb-10d00567c4b4', 'owner-email:kauranand@yahoo.com', 'KANWARPREET SINGH', '+919653300011', '9653300011', 'kauranand@yahoo.com', 'kauranand@yahoo.com', true, 'WORKBOOK', 'T5-101', 'T5', 5, '1', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":131,"OWNER NAME":"KANWARPREET SINGH","TOWER-\nFLATNO.":"T5-101","CONTACT DETAILS":9653300011,"EMAIL ID":"kauranand@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (133, 132, '2a52649a-7118-54ec-b8a8-5d5dadba9c0d', 'owner-email:yuvihardy@gmail.com', 'PRANEET BHARDWAJ / ANITA SHARMA', '+919814052257', '9814052257', 'yuvihardy@gmail.com', 'yuvihardy@gmail.com', true, 'WORKBOOK', 'T5-102', 'T5', 5, '1', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":132,"OWNER NAME":"PRANEET BHARDWAJ\nANITA SHARMA","TOWER-\nFLATNO.":"T5-102","CONTACT DETAILS":9814052257,"EMAIL ID":"yuvihardy@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (134, 133, 'a44efaf6-fd74-5174-a2c4-f50b189ba20a', 'owner-email:maleeka26@gmail.com', 'MALEEKA BHASIN', '+918556934747', '8556934747', 'maleeka26@gmail.com', 'maleeka26@gmail.com', true, 'WORKBOOK', 'T5-103', 'T5', 5, '1', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'NARDEEP SINGH; MANPREET KAUR;', '{"S.No":133,"OWNER NAME":"MALEEKA BHASIN","TOWER-\nFLATNO.":"T5-103","CONTACT DETAILS":8556934747,"EMAIL ID":"maleeka26@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NARDEEP SINGH; MANPREET KAUR;","AREA":1755,"RATE":3.25}'),
    (135, 134, 'f40c2d7e-7a51-5179-8d89-d119679aae9d', 'owner-email:manandeep17@gmail.com', 'PARAMJEET KAUR MALIK', '+919896315265', '9896315265', 'manandeep17@gmail.com; paramjeet.paramjeet54@gmail.com', 'manandeep17@gmail.com', true, 'WORKBOOK', 'T5-104', 'T5', 5, '1', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":134,"OWNER NAME":"PARAMJEET KAUR MALIK","TOWER-\nFLATNO.":"T5-104","CONTACT DETAILS":9896315265,"EMAIL ID":"manandeep17@gmail.com\nparamjeet.paramjeet54@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (136, 135, '5c0a37d9-5ff8-5783-a5fd-2c0bb0e70c89', 'owner-email:ms437672@gmail.com', 'TARUN KUMAR', '+919419144379', '9419144379', 'ms437672@gmail.com', 'ms437672@gmail.com', true, 'WORKBOOK', 'T5-201', 'T5', 5, '2', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'KIRANDEEP KAUR; MANGAL SINGH;', '{"S.No":135,"OWNER NAME":"TARUN KUMAR","TOWER-\nFLATNO.":"T5-201","CONTACT DETAILS":9419144379,"EMAIL ID":"ms437672@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"KIRANDEEP KAUR; MANGAL SINGH;","AREA":1755,"RATE":3.25}'),
    (137, 136, '6fa58f87-98b2-50c4-940b-3600a7203744', 'owner-email:gurindersinghmonga1987@gmail.com', 'AMARJIT KAUR', '+919478806431', '9478806431', 'gurindersinghmonga1987@gmail.com', 'gurindersinghmonga1987@gmail.com', true, 'WORKBOOK', 'T5-202', 'T5', 5, '2', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":136,"OWNER NAME":"AMARJIT KAUR","TOWER-\nFLATNO.":"T5-202","CONTACT DETAILS":9478806431,"EMAIL ID":"gurindersinghmonga1987@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (138, 137, 'e6b46bd5-e8fc-5056-ab2d-4318a1470ce1', 'owner-email:kapil.it.sharma@gmail.com', 'KAPIL KUMAR SHARMA', '+917696444438', '7696444438', 'kapil.It.sharma@gmail.com', 'kapil.it.sharma@gmail.com', true, 'WORKBOOK', 'T5-203', 'T5', 5, '2', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'NITIRESH BHARADWAJ; ANISHA; ARYAN SAIN;', '{"S.No":137,"OWNER NAME":"KAPIL KUMAR SHARMA","TOWER-\nFLATNO.":"T5-203","CONTACT DETAILS":7696444438,"EMAIL ID":"kapil.It.sharma@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NITIRESH BHARADWAJ; ANISHA; ARYAN SAIN;","AREA":1755,"RATE":3.25}'),
    (139, 138, 'c131d1ff-75c2-5554-97d5-e0850f7a4631', 'owner-email:puspjeet.singh@gmail.com', 'PUSHPJEET SINGH SHEEMAR / SUNIGDHA PAWAN KUMAR', '+919780561290', '9780561290', 'puspjeet.singh@gmail.com', 'puspjeet.singh@gmail.com', true, 'WORKBOOK', 'T5-204', 'T5', 5, '2', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":138,"OWNER NAME":"PUSHPJEET SINGH SHEEMAR\nSUNIGDHA PAWAN KUMAR","TOWER-\nFLATNO.":"T5-204","CONTACT DETAILS":9780561290,"EMAIL ID":"puspjeet.singh@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (140, 139, '9ab57efa-fc8d-54a3-980e-9b4c6049b1d4', 'owner-email:daslogistics890@gmail.com', 'SURINDER KAUR', '+919855617229', '9855617229', 'daslogistics890@gmail.com', 'daslogistics890@gmail.com', true, 'WORKBOOK', 'T5-301', 'T5', 5, '3', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'SUNIL KUMAR; GEETANJALI;', '{"S.No":139,"OWNER NAME":"SURINDER KAUR","TOWER-\nFLATNO.":"T5-301","CONTACT DETAILS":9855617229,"EMAIL ID":"daslogistics890@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SUNIL KUMAR; GEETANJALI;","AREA":1755,"RATE":3.25}'),
    (141, 140, '3e2b2b61-5425-508a-a0ae-1030581a3553', 'owner-email:karankhanna2122@gmail.com', 'KAVITA KHANNA / KARAN KHANNA', '+919781111153', '9781111153', 'karankhanna2122@gmail.com', 'karankhanna2122@gmail.com', true, 'WORKBOOK', 'T5-302', 'T5', 5, '3', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-AIR BNB', '{"S.No":140,"OWNER NAME":"KAVITA KHANNA\nKARAN KHANNA","TOWER-\nFLATNO.":"T5-302","CONTACT DETAILS":9781111153,"EMAIL ID":"karankhanna2122@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-AIR BNB","AREA":1755,"RATE":3.25}'),
    (142, 141, 'e37f79a8-f477-5169-bce9-f2d356b08c21', 'owner-profile:sarwan.singh.mann:+919463882593', 'SARWAN SINGH MANN', '+919463882593', '9463882593; 9881564000', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-303', 'T5', 5, '3', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'DALJIT RAJ MANMOHAN SINGH; HARMINDER KAUR;', '{"S.No":141,"OWNER NAME":"SARWAN SINGH MANN","TOWER-\nFLATNO.":"T5-303","CONTACT DETAILS":"9463882593\n9881564000","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"DALJIT RAJ MANMOHAN SINGH; HARMINDER KAUR;","AREA":1755,"RATE":3.25}'),
    (143, 142, 'd5b63814-80db-5289-a84d-0b407a59f685', 'owner-profile:ranpreet.singh:+919811352942', 'RANPREET SINGH', '+919811352942', '9811352942', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-304', 'T5', 5, '3', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'MANPREET SINGH; ANMOLDEEP SINGH; BEER SUKHMAN SINGH;', '{"S.No":142,"OWNER NAME":"RANPREET SINGH","TOWER-\nFLATNO.":"T5-304","CONTACT DETAILS":9811352942,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANPREET SINGH; ANMOLDEEP SINGH; BEER SUKHMAN SINGH;","AREA":1755,"RATE":3.25}'),
    (144, 143, 'ab5785f0-a886-5641-afad-2943c606ae62', 'owner-email:aasthakler@gmail.com', 'RAJIV SIDHU / AASTHA', '+919466611111', '9466611111; 8144400004', 'aasthakler@gmail.com', 'aasthakler@gmail.com', true, 'WORKBOOK', 'T5-401', 'T5', 5, '4', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":143,"OWNER NAME":"RAJIV SIDHU\nAASTHA","TOWER-\nFLATNO.":"T5-401","CONTACT DETAILS":"9466611111\n8144400004","EMAIL ID":"aasthakler@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (145, 144, '26020c88-68aa-5cb1-9457-83191c1bae86', 'owner-email:dhillon.harbhajan@yahoo.co.in', 'HARBHAJAN SINGH / SIMRAN KAUR', '+919457229457', '9457229457', 'dhillon.harbhajan@yahoo.co.in', 'dhillon.harbhajan@yahoo.co.in', true, 'WORKBOOK', 'T5-402', 'T5', 5, '4', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":144,"OWNER NAME":"HARBHAJAN SINGH\nSIMRAN KAUR","TOWER-\nFLATNO.":"T5-402","CONTACT DETAILS":9457229457,"EMAIL ID":"dhillon.harbhajan@yahoo.co.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (146, 145, 'b8afb306-80cc-5b71-a22a-07a0b33f85b8', 'owner-email:hps2312@gmail.com', 'ISHUPREET KAUR / MANPREET SINGH MAKKAR', '+918437821019', '8437821019; 9464309580', 'hps2312@gmail.com', 'hps2312@gmail.com', true, 'WORKBOOK', 'T5-403', 'T5', 5, '4', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'MANSI CHOUDHARY; JITENDER KUMAR; SANSKAR DEVI;', '{"S.No":145,"OWNER NAME":"ISHUPREET KAUR\nMANPREET SINGH MAKKAR","TOWER-\nFLATNO.":"T5-403","CONTACT DETAILS":"8437821019\n9464309580","EMAIL ID":"hps2312@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANSI CHOUDHARY; JITENDER KUMAR; SANSKAR DEVI;","AREA":1755,"RATE":3.25}'),
    (147, 146, '8603fda4-39e3-5dc8-814f-cb456d157482', 'owner-email:sandeepsharmavd@gmail.com', 'SANDEEP SHARMA / KASHISH SHARMA', '+919216533707', '9216533707', 'sandeepsharmavd@gmail.com', 'sandeepsharmavd@gmail.com', true, 'WORKBOOK', 'T5-404', 'T5', 5, '4', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":146,"OWNER NAME":"SANDEEP SHARMA\nKASHISH SHARMA","TOWER-\nFLATNO.":"T5-404","CONTACT DETAILS":9216533707,"EMAIL ID":"sandeepsharmavd@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (148, 147, 'c48937d0-8c31-5795-ad7c-c0653dce7486', 'owner-email:benson.johar@gmail.com', 'HARDEEP KAUR', '+919811163635', '9811163635; 9810122361', 'benson.johar@gmail.com', 'benson.johar@gmail.com', true, 'WORKBOOK', 'T5-501', 'T5', 5, '5', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'MATHIAS PAGEAU;', '{"S.No":147,"OWNER NAME":"HARDEEP KAUR","TOWER-\nFLATNO.":"T5-501","CONTACT DETAILS":"9811163635\n9810122361","EMAIL ID":"benson.johar@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MATHIAS PAGEAU;","AREA":1755,"RATE":3.25}'),
    (149, 148, 'a46b3a98-f050-5eae-8db9-298271b50218', 'owner-profile:kuldeep.singh.bhatia:+919811056693', 'KULDEEP SINGH BHATIA', '+919811056693', '9811056693', 'kuldeep.singh.prince44@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-502', 'T5', 5, '5', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":148,"OWNER NAME":"KULDEEP SINGH BHATIA","TOWER-\nFLATNO.":"T5-502","CONTACT DETAILS":9811056693,"EMAIL ID":"kuldeep.singh.prince44@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (150, 149, '7fba6c70-bc19-50b6-99d8-767642c30e0a', 'owner-profile:yadvender.kant:+919779923096', 'YADVENDER KANT', '+919779923096', '9779923096', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-503', 'T5', 5, '5', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'RAMANDEEP KAUR; NIRPAL SINGH BARING; HARNOOR SINGH; NAVDEEP KAUR; SUKHJINDER SINGH; SATNAM SINGH (D), PANKAJ-CHETAN (ACCOUNTANT);', '{"S.No":149,"OWNER NAME":"YADVENDER KANT","TOWER-\nFLATNO.":"T5-503","CONTACT DETAILS":9779923096,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RAMANDEEP KAUR; NIRPAL SINGH BARING; HARNOOR SINGH; NAVDEEP KAUR; SUKHJINDER SINGH; SATNAM SINGH (D), PANKAJ-CHETAN (ACCOUNTANT);","AREA":1755,"RATE":3.25}'),
    (151, 150, '25fa7c11-4feb-56af-b9ac-0a6dad44dca8', 'owner-email:niku_7575@hotmail.com', 'TASVEER KAUR', '+919814013688', '9814013688', 'niku_7575@hotmail.com', 'niku_7575@hotmail.com', true, 'WORKBOOK', 'T5-504', 'T5', 5, '5', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'VACANT', 'VACANT', '{"S.No":150,"OWNER NAME":"TASVEER KAUR","TOWER-\nFLATNO.":"T5-504","CONTACT DETAILS":9814013688,"EMAIL ID":"niku_7575@hotmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VACANT","AREA":1755,"RATE":3.25}'),
    (152, 151, 'a8ff527f-7433-56a9-a72c-d06e10889b3c', 'owner-profile:tarlochan.singh.bhajanpreet.singh:+919988700251', 'TARLOCHAN SINGH / BHAJANPREET SINGH', '+919988700251', '9988700251', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-601', 'T5', 5, '6', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'VACANT', 'VACANT', '{"S.No":151,"OWNER NAME":"TARLOCHAN SINGH\nBHAJANPREET SINGH","TOWER-\nFLATNO.":"T5-601","CONTACT DETAILS":9988700251,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VACANT","AREA":1755,"RATE":3.25}'),
    (153, 152, '8916cce8-7f34-5ca1-b75e-6b7f1c3c8a63', 'owner-email:rajat.sahota24@gmail.com', 'DAISY SAHOTA', '+917719421342', '7719421342', 'rajat.sahota24@gmail.com; bhagwansinghdevgun@gmail.com', 'rajat.sahota24@gmail.com', true, 'WORKBOOK', 'T5-602', 'T5', 5, '6', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'PRIYA KHANNA; SIMRAN SHARMA; ANJALI MALHOTRA; KOMALPREET KAUR; YOGITA RAJPUT (L); RIYA (DOCTOR INTERN) (L); TINA SHARMA (L);', '{"S.No":152,"OWNER NAME":"DAISY SAHOTA","TOWER-\nFLATNO.":"T5-602","CONTACT DETAILS":7719421342,"EMAIL ID":"rajat.sahota24@gmail.com\nbhagwansinghdevgun@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PRIYA KHANNA; SIMRAN SHARMA; ANJALI MALHOTRA; KOMALPREET KAUR; YOGITA RAJPUT (L); RIYA (DOCTOR INTERN) (L); TINA SHARMA (L);","AREA":1755,"RATE":3.25}'),
    (154, 153, '1fe85711-88da-5813-bc76-a35917e5c3c2', 'owner-email:sujitmonga@gmail.com', 'SUJIT MONGA', '+919988526400', '9988526400', 'sujitmonga@gmail.com', 'sujitmonga@gmail.com', true, 'WORKBOOK', 'T5-603', 'T5', 5, '6', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":153,"OWNER NAME":"SUJIT MONGA","TOWER-\nFLATNO.":"T5-603","CONTACT DETAILS":9988526400,"EMAIL ID":"sujitmonga@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (155, 154, '13747d15-b077-57ac-82ba-1003d901526e', 'owner-email:jassipyc@gmail.com', 'JASWINDER SINGH', '+919915347357', '9915347357', 'jassipyc@gmail.com', 'jassipyc@gmail.com', true, 'WORKBOOK', 'T5-604', 'T5', 5, '6', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":154,"OWNER NAME":"JASWINDER SINGH","TOWER-\nFLATNO.":"T5-604","CONTACT DETAILS":9915347357,"EMAIL ID":"jassipyc@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (156, 155, '295c9a84-8d40-5c69-bf8e-e5658f7c3fb5', 'owner-profile:ravneet.brar.ravdeep.brar:+919876571678', 'RAVNEET BRAR / RAVDEEP BRAR', '+919876571678', '9876571678; 7539000001', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-701', 'T5', 5, '7', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'VIKAS BHANDARI; AMAN UNIYAL;', '{"S.No":155,"OWNER NAME":"RAVNEET BRAR\nRAVDEEP BRAR","TOWER-\nFLATNO.":"T5-701","CONTACT DETAILS":"9876571678\n7539000001","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"VIKAS BHANDARI; AMAN UNIYAL;","AREA":1755,"RATE":3.25}'),
    (157, 156, '916d3f4a-3b16-55d1-8c76-447ea425da06', 'owner-profile:bhupinder.singh.daljit.kaur:+918558800073', 'BHUPINDER SINGH / DALJIT KAUR', '+918558800073', '8558800073', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-702', 'T5', 5, '7', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'ANSHUL KAMBOJ; RUCHIKA KAMBOJ;', '{"S.No":156,"OWNER NAME":"BHUPINDER SINGH\nDALJIT KAUR","TOWER-\nFLATNO.":"T5-702","CONTACT DETAILS":8558800073,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ANSHUL KAMBOJ; RUCHIKA KAMBOJ;","AREA":1755,"RATE":3.25}'),
    (158, 157, '4313f3eb-0f85-5627-9149-b6ac9ef05e0e', 'owner-email:atul200200@gmail.com', 'ATUL KUMAR AWASTHI / RUPALY AWASTHI', '+919805200200', '9805200200', 'atul200200@gmail.com', 'atul200200@gmail.com', true, 'WORKBOOK', 'T5-703', 'T5', 5, '7', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":157,"OWNER NAME":"ATUL KUMAR AWASTHI\nRUPALY AWASTHI","TOWER-\nFLATNO.":"T5-703","CONTACT DETAILS":9805200200,"EMAIL ID":"atul200200@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (159, 158, '273a046f-288a-52a7-a3e3-9c475125e515', 'owner-email:rohit.kapoor2275@gmail.com', 'ROHIT KAPOOR', '+917986081499', '7986081499', 'rohit.kapoor2275@gmail.com', 'rohit.kapoor2275@gmail.com', true, 'WORKBOOK', 'T5-704', 'T5', 5, '7', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":158,"OWNER NAME":"ROHIT KAPOOR","TOWER-\nFLATNO.":"T5-704","CONTACT DETAILS":7986081499,"EMAIL ID":"rohit.kapoor2275@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (160, 159, 'f0ff048e-e922-5bab-a58e-18173c0a33af', 'owner-email:sandykaurkaur52@gmail.com', 'SANDEEP KAUR', '+917696972979', '7696972979', 'sandykaurkaur52@gmail.com', 'sandykaurkaur52@gmail.com', true, 'WORKBOOK', 'T5-801', 'T5', 5, '8', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":159,"OWNER NAME":"SANDEEP KAUR","TOWER-\nFLATNO.":"T5-801","CONTACT DETAILS":7696972979,"EMAIL ID":"sandykaurkaur52@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (161, 160, '8cb3d5e2-1eb3-5e7c-81ff-06b04da5bdf6', 'owner-profile:kiranjit.kaur:+918700591895', 'KIRANJIT KAUR', '+918700591895', '8700591895', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-802', 'T5', 5, '8', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":160,"OWNER NAME":"KIRANJIT KAUR","TOWER-\nFLATNO.":"T5-802","CONTACT DETAILS":8700591895,"EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1755,"RATE":3.25}'),
    (162, 161, 'dcac1783-24bc-5c11-b12c-9fb99c2fd2b0', 'owner-profile:ranjan.sharma.shikha.sharma:+918800419996', 'RANJAN SHARMA / SHIKHA SHARMA', '+918800419996', '8800419996', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-803', 'T5', 5, '8', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'PARMINDER SINGH TOOR (L); NAVREET; AMRINDER; KARTIK (L); ARSH BHULLAR;', '{"S.No":161,"OWNER NAME":"RANJAN SHARMA\nSHIKHA SHARMA","TOWER-\nFLATNO.":"T5-803","CONTACT DETAILS":8800419996,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PARMINDER SINGH TOOR (L); NAVREET; AMRINDER; KARTIK (L); ARSH BHULLAR;","AREA":1755,"RATE":3.25}'),
    (163, 162, '65c99dac-6d6a-5b01-aab9-f88f2b2d1744', 'owner-email:shomasen41@gmail.com', 'SHOMA SEN', '+919878533808', '9878533808; 9530788811', 'shomasen41@gmail.com', 'shomasen41@gmail.com', true, 'WORKBOOK', 'T5-804', 'T5', 5, '8', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":162,"OWNER NAME":"SHOMA SEN","TOWER-\nFLATNO.":"T5-804","CONTACT DETAILS":"9878533808\n9530788811","EMAIL ID":"shomasen41@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (164, 163, 'a7a791a3-da91-5cd8-a8b9-74b07627e1e6', 'owner-profile:anurag.sharma:+919977049379', 'ANURAG SHARMA', '+919977049379', '9977049379', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-901', 'T5', 5, '9', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'ABHISHEK SHARMA; RAJAT LOHIA; VANSH BANSAL;', '{"S.No":163,"OWNER NAME":"ANURAG SHARMA","TOWER-\nFLATNO.":"T5-901","CONTACT DETAILS":9977049379,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ABHISHEK SHARMA; RAJAT LOHIA; VANSH BANSAL;","AREA":1755,"RATE":3.25}'),
    (165, 164, 'e564c744-d47a-5f5c-aaee-19fcf02dfb53', 'owner-email:harman221240@gmail.com', 'JAGROOP SINGH', '+917837337377', '7837337377', 'harman221240@gmail.com', 'harman221240@gmail.com', true, 'WORKBOOK', 'T5-902', 'T5', 5, '9', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'AKASHVEER SINGH SANDHU; SHARANJIT SINGH;', '{"S.No":164,"OWNER NAME":"JAGROOP SINGH","TOWER-\nFLATNO.":"T5-902","CONTACT DETAILS":7837337377,"EMAIL ID":"harman221240@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"AKASHVEER SINGH SANDHU; SHARANJIT SINGH;","AREA":1755,"RATE":3.25}'),
    (166, 165, '1ef646b7-bde3-50c0-8c2a-38e746dee6c1', 'owner-email:dishantgarg999@gmail.com', 'SAMRITI / AAKASH', '+917579100002', '7579100002; 8288801810', 'dishantgarg999@gmail.com', 'dishantgarg999@gmail.com', true, 'WORKBOOK', 'T5-903', 'T5', 5, '9', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'SUKHDEEP KAUR; MUKESH GARG;', '{"S.No":165,"OWNER NAME":"SAMRITI\nAAKASH","TOWER-\nFLATNO.":"T5-903","CONTACT DETAILS":"7579100002\n8288801810","EMAIL ID":"dishantgarg999@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SUKHDEEP KAUR; MUKESH GARG;","AREA":1755,"RATE":3.25}'),
    (167, 166, 'd37e57aa-1137-5899-88ca-afc4b2a119ae', 'owner-email:sanjib.dasgupta@gmail.com', 'SANJIB DASGUPTA / RUCHI GUPTA', '+919811747099', '9811747099', 'sanjib.dasgupta@gmail.com', 'sanjib.dasgupta@gmail.com', true, 'WORKBOOK', 'T5-904', 'T5', 5, '9', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":166,"OWNER NAME":"SANJIB DASGUPTA\nRUCHI GUPTA","TOWER-\nFLATNO.":"T5-904","CONTACT DETAILS":9811747099,"EMAIL ID":"sanjib.dasgupta@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (168, 167, '5cba1725-ad37-5c0a-85f1-b920d0b52a44', 'owner-email:sa.kirti@gmail.co.in', 'KIRTI SAHAI / VED SAHAI', '+919910572580', '9910572580; 9958599932', 'sa.kirti@gmail.co.in; ved.sahai@yahoo.com', 'sa.kirti@gmail.co.in', true, 'WORKBOOK', 'T5-1001', 'T5', 5, '10', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'INDER PREET SINGH;', '{"S.No":167,"OWNER NAME":"KIRTI SAHAI\nVED SAHAI","TOWER-\nFLATNO.":"T5-1001","CONTACT DETAILS":"9910572580\n9958599932","EMAIL ID":"sa.kirti@gmail.co.in\nved.sahai@yahoo.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"INDER PREET SINGH;","AREA":1755,"RATE":3.25}'),
    (169, 168, 'f1c639da-b02a-55b2-a9ff-ad5cfde8a783', 'owner-email:satdevkohli@gmail.com', 'GITA KOHLI', '+919316520321', '9316520321', 'satdevkohli@gmail.com', 'satdevkohli@gmail.com', true, 'WORKBOOK', 'T5-1002', 'T5', 5, '10', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":168,"OWNER NAME":"GITA KOHLI","TOWER-\nFLATNO.":"T5-1002","CONTACT DETAILS":9316520321,"EMAIL ID":"satdevkohli@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (170, 169, '04f2fecc-7044-5c2f-b885-f04159cef933', 'owner-email:mahajan.akshay80@gmail.com', 'NIDHI MAHAJAN / NAVAL GUPTA', '+917293000065', '7293000065', 'mahajan.akshay80@gmail.com', 'mahajan.akshay80@gmail.com', true, 'WORKBOOK', 'T5-1003', 'T5', 5, '10', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; ROHIT PUNJ;', '{"S.No":169,"OWNER NAME":"NIDHI MAHAJAN\nNAVAL GUPTA","TOWER-\nFLATNO.":"T5-1003","CONTACT DETAILS":7293000065,"EMAIL ID":"mahajan.akshay80@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; ROHIT PUNJ;","AREA":1755,"RATE":3.25}'),
    (171, 170, 'dacff67b-61c7-5d31-a8e3-7bbe35befcc7', 'owner-email:amanindersyan@live.com', 'AMANINDER SINGH / JYOTI ANEJA', '+919915298741', '9915298741', 'amanindersyan@live.com', 'amanindersyan@live.com', true, 'WORKBOOK', 'T5-1004', 'T5', 5, '10', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":170,"OWNER NAME":"AMANINDER SINGH\nJYOTI ANEJA","TOWER-\nFLATNO.":"T5-1004","CONTACT DETAILS":9915298741,"EMAIL ID":"amanindersyan@live.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (172, 171, '4c127434-1998-568b-8069-d104b4f7dbb7', 'owner-email:gurjeetbrar678@gmail.com', 'GURJEET SINGH', '+919507000003', '9507000003', 'gurjeetbrar678@gmail.com', 'gurjeetbrar678@gmail.com', true, 'WORKBOOK', 'T5-1101', 'T5', 5, '11', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":171,"OWNER NAME":"GURJEET SINGH","TOWER-\nFLATNO.":"T5-1101","CONTACT DETAILS":9507000003,"EMAIL ID":"gurjeetbrar678@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (173, 172, '3cbf363a-0428-5d51-91b1-6927771e8994', 'owner-email:akash14271@yahoo.com', 'AKASH SAXENA / SARASWATI SAXENA', '+919041998888', '9041998888; 8699776714', 'akash14271@yahoo.com', 'akash14271@yahoo.com', true, 'WORKBOOK', 'T5-1102', 'T5', 5, '11', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":172,"OWNER NAME":"AKASH SAXENA\nSARASWATI SAXENA","TOWER-\nFLATNO.":"T5-1102","CONTACT DETAILS":"9041998888\n8699776714","EMAIL ID":"akash14271@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (174, 173, 'bfea2bc3-7af5-5335-92d6-ea8a1325da34', 'owner-profile:chander.kant:+918437023096', 'CHANDER KANT', '+918437023096', '8437023096', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T5-1103', 'T5', 5, '11', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'RIDHAM GOYAL; RAHUL; HARSHIT GUPTA; MANAV GARG;', '{"S.No":173,"OWNER NAME":"CHANDER KANT","TOWER-\nFLATNO.":"T5-1103","CONTACT DETAILS":8437023096,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RIDHAM GOYAL; RAHUL; HARSHIT GUPTA; MANAV GARG;","AREA":1755,"RATE":3.25}'),
    (175, 174, '0238c998-0d62-5c9d-951d-d0050c8f947a', 'owner-email:arvinderkhaira@gmail.com', 'ARVINDER SINGH KHAIRA', '+919888886140', '9888886140', 'arvinderkhaira@gmail.com; singhlavika@gmail.com', 'arvinderkhaira@gmail.com', true, 'WORKBOOK', 'T5-1104', 'T5', 5, '11', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":174,"OWNER NAME":"ARVINDER SINGH KHAIRA","TOWER-\nFLATNO.":"T5-1104","CONTACT DETAILS":9888886140,"EMAIL ID":"arvinderkhaira@gmail.com\nsinghlavika@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (176, 175, '494f0d44-bc0e-59a5-8ca7-759113a3e08e', 'owner-email:dhillond920@gmail.com', 'DILPREET SINGH DHILLON', '+918360763719', '8360763719', 'dhillond920@gmail.com; mehrgrwl@gmail.com', 'dhillond920@gmail.com', true, 'WORKBOOK', 'T5-1201', 'T5', 5, '12', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":175,"OWNER NAME":"DILPREET SINGH DHILLON","TOWER-\nFLATNO.":"T5-1201","CONTACT DETAILS":8360763719,"EMAIL ID":"dhillond920@gmail.com\nmehrgrwl@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (177, 176, '537f5bb2-3887-520f-84ab-10bb1207ef9d', 'owner-email:sukhwant@niits.net', 'DR. SUKHWANT SINGH BHATIA / VINTA SINGH BHATIA', '+918264886286', '8264886286', 'sukhwant@niits.net', 'sukhwant@niits.net', true, 'WORKBOOK', 'T5-1202', 'T5', 5, '12', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-ABROAD-VISITS OCCASIONALLY', '{"S.No":176,"OWNER NAME":"DR. SUKHWANT SINGH BHATIA\nVINTA SINGH BHATIA","TOWER-\nFLATNO.":"T5-1202","CONTACT DETAILS":8264886286,"EMAIL ID":"sukhwant@niits.net","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-ABROAD-VISITS OCCASIONALLY","AREA":1755,"RATE":3.25}'),
    (178, 177, 'b4c66002-cd81-5c91-b9da-6b83a28a3e52', 'owner-email:jaspreet76@gmail.com', 'JASPREET KAUR', '+917340871011', '7340871011', 'jaspreet76@gmail.com', 'jaspreet76@gmail.com', true, 'WORKBOOK', 'T5-1203', 'T5', 5, '12', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":177,"OWNER NAME":"JASPREET KAUR","TOWER-\nFLATNO.":"T5-1203","CONTACT DETAILS":7340871011,"EMAIL ID":"jaspreet76@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1755,"RATE":3.25}'),
    (179, 178, 'f03ae597-06c6-5833-8b27-ffc8c09cffb9', 'owner-email:sandhumani689@gmail.com', 'BIPANJEET KAUR', '+919056009148', '9056009148', 'sandhumani689@gmail.com', 'sandhumani689@gmail.com', true, 'WORKBOOK', 'T5-1204', 'T5', 5, '12', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":178,"OWNER NAME":"BIPANJEET KAUR","TOWER-\nFLATNO.":"T5-1204","CONTACT DETAILS":9056009148,"EMAIL ID":"sandhumani689@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (180, 179, '44879c24-0915-595e-bc62-422b43455210', 'owner-email:ys941746@gmail.com', 'RUCHI MITTAL', '+919814134240', '9814134240; 7538995000', 'ys941746@gmail.com', 'ys941746@gmail.com', true, 'WORKBOOK', 'T5-1401', 'T5', 5, '14', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'DEEPAK KUMAR; TARUN;', '{"S.No":179,"OWNER NAME":"RUCHI MITTAL","TOWER-\nFLATNO.":"T5-1401","CONTACT DETAILS":"9814134240\n7538995000","EMAIL ID":"ys941746@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"DEEPAK KUMAR; TARUN;","AREA":1755,"RATE":3.25}'),
    (181, 180, '3bf7dbc3-faf5-582f-ac5a-d5b67ecd3c87', 'owner-email:rituajassi@gmail.com', 'YASH PAUL / SUKRITA', '+919646000335', '9646000335', 'rituajassi@gmail.com', 'rituajassi@gmail.com', true, 'WORKBOOK', 'T5-1402', 'T5', 5, '14', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":180,"OWNER NAME":"YASH PAUL\nSUKRITA","TOWER-\nFLATNO.":"T5-1402","CONTACT DETAILS":9646000335,"EMAIL ID":"rituajassi@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (182, 181, 'f44c7135-f631-5ed1-b780-c8fc4d03f551', 'owner-email:accounts@paulmerchants.net', 'M/S PAUL MERCHANTS REALTORS PRIVATE LIMITED', '+918559075005', '8559075005', 'accounts@paulmerchants.net; rajeev.rana@paulmerchants.net', 'accounts@paulmerchants.net', true, 'WORKBOOK', 'T5-1403', 'T5', 5, '14', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":181,"OWNER NAME":"M/S PAUL MERCHANTS REALTORS PRIVATE LIMITED","TOWER-\nFLATNO.":"T5-1403","CONTACT DETAILS":8559075005,"EMAIL ID":"accounts@paulmerchants.net\nrajeev.rana@paulmerchants.net","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1755,"RATE":3.25}'),
    (183, 182, '8665f977-c47f-5eb6-8b95-3d662bca8c34', 'owner-email:dhillonharmeet62@gmail.com', 'JASKARAN SINGH DHILLON / AMANPREET KAUR', '+915104328149', '5104328149', 'dhillonharmeet62@gmail.com; jaydhillon26@gmail.com', 'dhillonharmeet62@gmail.com', true, 'WORKBOOK', 'T5-1404', 'T5', 5, '14', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":182,"OWNER NAME":"JASKARAN SINGH DHILLON\nAMANPREET KAUR","TOWER-\nFLATNO.":"T5-1404","CONTACT DETAILS":5104328149,"EMAIL ID":"dhillonharmeet62@gmail.com\njaydhillon26@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (184, 183, '8d132e88-e924-5951-8773-bfca5918b81b', 'owner-email:tusharbunny05@gmail.com', 'SHUBHAM BANSAL', '+918427247101', '8427247101; 9877373426; 7508875829', 'tusharbunny05@gmail.com; harryvirk787@gmail.com; chauhan.neha305@gmail.com', 'tusharbunny05@gmail.com', true, 'WORKBOOK', 'T6-101', 'T6', 6, '1', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":183,"OWNER NAME":"SHUBHAM BANSAL","TOWER-\nFLATNO.":"T6-101","CONTACT DETAILS":"8427247101\n9877373426\n7508875829","EMAIL ID":"tusharbunny05@gmail.com\nharryvirk787@gmail.com\nchauhan.neha305@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (185, 184, 'cf2f57e3-d594-5a07-a38f-84655f6092a1', 'owner-profile:neetish.manocha.rupinder.kaur.arora:+918558866280', 'NEETISH MANOCHA / RUPINDER KAUR ARORA', '+918558866280', '8558866280', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-102', 'T6', 6, '1', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'THAKUR ARVIND SINGH; MARYAM ZAKARIAE; ARYAN THAKUR;', '{"S.No":184,"OWNER NAME":"NEETISH MANOCHA\nRUPINDER KAUR ARORA","TOWER-\nFLATNO.":"T6-102","CONTACT DETAILS":8558866280,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"THAKUR ARVIND SINGH; MARYAM ZAKARIAE; ARYAN THAKUR;","AREA":1755,"RATE":3.25}'),
    (186, 185, 'b6955ba9-cdb4-5c6e-80a8-3fed01c2ce26', 'owner-profile:praneet.bhardwaj.anita.sharma:+919814052257', 'PRANEET BHARDWAJ / ANITA SHARMA', '+919814052257', '9814052257', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-103', 'T6', 6, '1', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":185,"OWNER NAME":"PRANEET BHARDWAJ\nANITA SHARMA","TOWER-\nFLATNO.":"T6-103","CONTACT DETAILS":9814052257,"EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (187, 186, 'eafe2f62-cc47-5f6a-80b3-a1b855c33501', 'owner-email:ashishdahda@gmail.com', 'SHUBHAM BANSAL', '+918427247101', '8427247101', 'ashishdahda@gmail.com', 'ashishdahda@gmail.com', true, 'WORKBOOK', 'T6-104', 'T6', 6, '1', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":186,"OWNER NAME":"SHUBHAM BANSAL","TOWER-\nFLATNO.":"T6-104","CONTACT DETAILS":8427247101,"EMAIL ID":"ashishdahda@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (188, 187, 'e5a5ccd1-84f4-548c-9342-5dc2af605243', 'owner-email:prashant1991chopra@gmail.com', 'SOLANKI MALLIKA CHETAN', '+919727769544', '9727769544', 'prashant1991chopra@gmail.com', 'prashant1991chopra@gmail.com', true, 'WORKBOOK', 'T6-201', 'T6', 6, '2', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":187,"OWNER NAME":"SOLANKI MALLIKA CHETAN","TOWER-\nFLATNO.":"T6-201","CONTACT DETAILS":9727769544,"EMAIL ID":"prashant1991chopra@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (189, 188, 'b2dcba1f-0183-5170-8255-0c3d4949b64e', 'owner-email:sethib@rediffmail.com', 'TINA SETHI', '+919872978129', '9872978129', 'sethib@rediffmail.com', 'sethib@rediffmail.com', true, 'WORKBOOK', 'T6-202', 'T6', 6, '2', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":188,"OWNER NAME":"TINA SETHI","TOWER-\nFLATNO.":"T6-202","CONTACT DETAILS":9872978129,"EMAIL ID":"sethib@rediffmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (190, 189, '0284a8c9-c3a7-5d21-9bea-63fccf9951db', 'owner-email:bansalkunal771@gmail.com', 'PARVEEN RANI', '+919815578911', '9815578911', 'bansalkunal771@gmail.com', 'bansalkunal771@gmail.com', true, 'WORKBOOK', 'T6-203', 'T6', 6, '2', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'NAVDEEP KAUR;', '{"S.No":189,"OWNER NAME":"PARVEEN RANI","TOWER-\nFLATNO.":"T6-203","CONTACT DETAILS":9815578911,"EMAIL ID":"bansalkunal771@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NAVDEEP KAUR;","AREA":1755,"RATE":3.25}'),
    (191, 190, 'ebda9a73-dfe4-5e25-a87c-22b412b0b01e', 'owner-email:gurvinder_mba2009@yahoo.in', 'GURVINDER SINGH / SURJEET KAUR', '+919796662787', '9796662787', 'gurvinder_mba2009@yahoo.in', 'gurvinder_mba2009@yahoo.in', true, 'WORKBOOK', 'T6-204', 'T6', 6, '2', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":190,"OWNER NAME":"GURVINDER SINGH\nSURJEET KAUR","TOWER-\nFLATNO.":"T6-204","CONTACT DETAILS":9796662787,"EMAIL ID":"gurvinder_mba2009@yahoo.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (192, 191, '6efbc043-c6b6-55cf-b569-459c154ed279', 'owner-email:sanjanasinghbishu@gmail.com', 'SANJANA SINGH', '+918928860608', '8928860608', 'sanjanasinghbishu@gmail.com', 'sanjanasinghbishu@gmail.com', true, 'WORKBOOK', 'T6-301', 'T6', 6, '3', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'MANOJ KUMAR SABHARWAL; AMARJIT SINGH; TARKESHWAR SINGH HUNDAL;', '{"S.No":191,"OWNER NAME":"SANJANA SINGH","TOWER-\nFLATNO.":"T6-301","CONTACT DETAILS":8928860608,"EMAIL ID":"sanjanasinghbishu@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANOJ KUMAR SABHARWAL; AMARJIT SINGH; TARKESHWAR SINGH HUNDAL;","AREA":1755,"RATE":3.25}'),
    (193, 192, 'e20a2e74-1523-5577-bc03-1e5be0c468de', 'owner-email:khyatishah11@yahoo.co.in', 'KHYATI VINOD SHAH / ARJUN SHARMA', '+919930273032', '9930273032', 'khyatishah11@yahoo.co.in; shimla55@gmail.com', 'khyatishah11@yahoo.co.in', true, 'WORKBOOK', 'T6-302', 'T6', 6, '3', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":192,"OWNER NAME":"KHYATI VINOD SHAH\nARJUN SHARMA","TOWER-\nFLATNO.":"T6-302","CONTACT DETAILS":9930273032,"EMAIL ID":"khyatishah11@yahoo.co.in\nshimla55@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (194, 193, '40855b2d-2540-5f3d-aeb8-42f439606946', 'owner-email:gourav1arora@gmail.com', 'GOURAV ARORA / PALLAVI JAIN', '+919034369456', '9034369456', 'gourav1arora@gmail.com', 'gourav1arora@gmail.com', true, 'WORKBOOK', 'T6-303', 'T6', 6, '3', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":193,"OWNER NAME":"GOURAV ARORA\nPALLAVI JAIN","TOWER-\nFLATNO.":"T6-303","CONTACT DETAILS":9034369456,"EMAIL ID":"gourav1arora@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (195, 194, 'f3f576af-811c-52ad-9e58-39364c4b02b9', 'owner-email:purnoor01@gmail.com', 'PURNOOR BAINS / JASWIR SINGH BAINS', '+918860078828', '8860078828; 9781485275', 'purnoor01@gmail.com; bainsjaswir2001@yahoo.co.in', 'purnoor01@gmail.com', true, 'WORKBOOK', 'T6-304', 'T6', 6, '3', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-COL. JASWIR SINGH BAINS; MANJIT KAUR; SACHNOOR BAINS; PURNOOR BAINS', '{"S.No":194,"OWNER NAME":"PURNOOR BAINS\nJASWIR SINGH BAINS","TOWER-\nFLATNO.":"T6-304","CONTACT DETAILS":"8860078828\n9781485275","EMAIL ID":"purnoor01@gmail.com\nbainsjaswir2001@yahoo.co.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-COL. JASWIR SINGH BAINS; MANJIT KAUR; SACHNOOR BAINS; PURNOOR BAINS","AREA":1755,"RATE":3.25}'),
    (196, 195, '1bbed69e-1d24-5feb-aae7-6ca5ac0f980a', 'owner-email:manishkumar.sethi82@gmail.com', 'MANISH KUMAR SETHI / ANISH KUMAR SETHI', '+919549522221', '9549522221', 'manishkumar.sethi82@gmail.com', 'manishkumar.sethi82@gmail.com', true, 'WORKBOOK', 'T6-401', 'T6', 6, '4', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'JASHANPREET KAUR; SUDESH KAUR; NAVNEET KAUR;', '{"S.No":195,"OWNER NAME":"MANISH KUMAR SETHI\nANISH KUMAR SETHI","TOWER-\nFLATNO.":"T6-401","CONTACT DETAILS":9549522221,"EMAIL ID":"manishkumar.sethi82@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JASHANPREET KAUR; SUDESH KAUR; NAVNEET KAUR;","AREA":1755,"RATE":3.25}'),
    (197, 196, 'e20a2e74-1523-5577-bc03-1e5be0c468de', 'owner-email:khyatishah11@yahoo.co.in', 'KHYATI VINOD SHAH / ARJUN SHARMA', '+919930273032', '9930273032', 'khyatishah11@yahoo.co.in', 'khyatishah11@yahoo.co.in', true, 'WORKBOOK', 'T6-402', 'T6', 6, '4', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":196,"OWNER NAME":"KHYATI VINOD SHAH\nARJUN SHARMA","TOWER-\nFLATNO.":"T6-402","CONTACT DETAILS":9930273032,"EMAIL ID":"khyatishah11@yahoo.co.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (198, 197, 'e5e3f503-8440-54ce-9e78-965e7061caf0', 'owner-email:kaurrasleen1986@gmail.com', 'RASLEEN KAUR', '+919990002905', '9990002905', 'kaurrasleen1986@gmail.com', 'kaurrasleen1986@gmail.com', true, 'WORKBOOK', 'T6-403', 'T6', 6, '4', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'JAGROOP SINGH SANDHU; HARSIMRAN KAUR; FATEH SINGH; HARNOOR SINGH;', '{"S.No":197,"OWNER NAME":"RASLEEN KAUR","TOWER-\nFLATNO.":"T6-403","CONTACT DETAILS":9990002905,"EMAIL ID":"kaurrasleen1986@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JAGROOP SINGH SANDHU; HARSIMRAN KAUR; FATEH SINGH; HARNOOR SINGH;","AREA":1755,"RATE":3.25}'),
    (199, 198, '6bd0b738-07e2-5465-baf7-f17dc6dfe704', 'owner-email:dhruvasood03@gmail.com', 'ARJUN SOOD / SONIA SOOD', '+919780438011', '9780438011; 7837627328', 'dhruvasood03@gmail.com', 'dhruvasood03@gmail.com', true, 'WORKBOOK', 'T6-404', 'T6', 6, '4', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":198,"OWNER NAME":"ARJUN SOOD\nSONIA SOOD","TOWER-\nFLATNO.":"T6-404","CONTACT DETAILS":"9780438011\n7837627328","EMAIL ID":"dhruvasood03@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (200, 199, 'e57da074-d80e-5b83-8053-55bb40b7ce53', 'owner-email:sourav@gmail.com', 'GOURAV KUMAR', '+919815208050', '9815208050', 'sourav@gmail.com', 'sourav@gmail.com', true, 'WORKBOOK', 'T6-501', 'T6', 6, '5', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":199,"OWNER NAME":"GOURAV KUMAR","TOWER-\nFLATNO.":"T6-501","CONTACT DETAILS":9815208050,"EMAIL ID":"sourav@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (201, 200, '38e8b297-e633-5187-b621-600f0f39ff08', 'owner-email:surjeetharjeet4@gmail.com', 'MANMEET KAUR / HARJEET KAUR KHAJURIA', '+918105856327', '8105856327; 8872656888', 'surjeetharjeet4@gmail.com', 'surjeetharjeet4@gmail.com', true, 'WORKBOOK', 'T6-502', 'T6', 6, '5', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":200,"OWNER NAME":"MANMEET KAUR\nHARJEET KAUR KHAJURIA","TOWER-\nFLATNO.":"T6-502","CONTACT DETAILS":"8105856327\n8872656888","EMAIL ID":"surjeetharjeet4@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1755,"RATE":3.25}'),
    (202, 201, '35e43d5c-76ad-535d-9e72-2787f0fad8c1', 'owner-email:mehrotramohit83@gmail.com', 'MOHIT MEHROTRA / SHIVANI MEHROTRA', '+919690324662', '9690324662', 'mehrotramohit83@gmail.com', 'mehrotramohit83@gmail.com', true, 'WORKBOOK', 'T6-503', 'T6', 6, '5', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":201,"OWNER NAME":"MOHIT MEHROTRA\nSHIVANI MEHROTRA","TOWER-\nFLATNO.":"T6-503","CONTACT DETAILS":9690324662,"EMAIL ID":"mehrotramohit83@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (203, 202, 'a0e46421-a2fb-5bde-9bda-1ce6beeb20e0', 'owner-profile:narender.pal.monga.bindu.bala:+919465517782', 'NARENDER PAL MONGA / BINDU BALA', '+919465517782', '9465517782', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-504', 'T6', 6, '5', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'SIMRANJIT SINGH CHAHAL; JATIN SINGLA; SANJEEV ARORA;', '{"S.No":202,"OWNER NAME":"NARENDER PAL MONGA\nBINDU BALA","TOWER-\nFLATNO.":"T6-504","CONTACT DETAILS":9465517782,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SIMRANJIT SINGH CHAHAL; JATIN SINGLA; SANJEEV ARORA;","AREA":1755,"RATE":3.25}'),
    (204, 203, '2e9169a7-1b00-58bc-bcd2-a4a5af8a0320', 'owner-email:sanjeevsuri10@gmail.com', 'MAMTA SURI / SANJEEV SURI', '+917006967757', '7006967757', 'sanjeevsuri10@gmail.com', 'sanjeevsuri10@gmail.com', true, 'WORKBOOK', 'T6-601', 'T6', 6, '6', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":203,"OWNER NAME":"MAMTA SURI\nSANJEEV SURI","TOWER-\nFLATNO.":"T6-601","CONTACT DETAILS":7006967757,"EMAIL ID":"sanjeevsuri10@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (205, 204, '072049d4-53d0-5c6c-aa37-e3685ee826f3', 'owner-email:asit.garg@gmail.com', 'SUVARNA PANDEY / ASIT GARG', '+918054942152', '8054942152; 9988269908', 'asit.garg@gmail.com', 'asit.garg@gmail.com', true, 'WORKBOOK', 'T6-602', 'T6', 6, '6', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":204,"OWNER NAME":"SUVARNA PANDEY\nASIT GARG","TOWER-\nFLATNO.":"T6-602","CONTACT DETAILS":"8054942152\n9988269908","EMAIL ID":"asit.garg@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (206, 205, '782f8681-6a82-5130-8cdb-e36d219080f2', 'owner-email:amaysharma1803@gmail.com', 'TANU SHARMA', '+919805423713', '9805423713', 'amaysharma1803@gmail.com', 'amaysharma1803@gmail.com', true, 'WORKBOOK', 'T6-603', 'T6', 6, '6', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":205,"OWNER NAME":"TANU SHARMA","TOWER-\nFLATNO.":"T6-603","CONTACT DETAILS":9805423713,"EMAIL ID":"amaysharma1803@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (207, 206, 'd4c14c5a-a164-5c4f-bb78-e50d739693fc', 'owner-email:bansalalok87@gmail.com', 'ALOK BANSAL / DEEPIKA GOYAL BANSAL', '+919592233309', '9592233309', 'bansalalok87@gmail.com', 'bansalalok87@gmail.com', true, 'WORKBOOK', 'T6-604', 'T6', 6, '6', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":206,"OWNER NAME":"ALOK BANSAL\nDEEPIKA GOYAL BANSAL","TOWER-\nFLATNO.":"T6-604","CONTACT DETAILS":9592233309,"EMAIL ID":"bansalalok87@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (208, 207, '2379bb36-6410-59f0-9cf0-8584af641344', 'owner-email:karan07979@yahoo.com', 'VEERAM BALA / KARAN KUMAR', '+919779707979', '9779707979; 8557988693', 'karan07979@yahoo.com', 'karan07979@yahoo.com', true, 'WORKBOOK', 'T6-701', 'T6', 6, '7', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":207,"OWNER NAME":"VEERAM BALA\nKARAN KUMAR","TOWER-\nFLATNO.":"T6-701","CONTACT DETAILS":"9779707979\n8557988693","EMAIL ID":"karan07979@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (209, 208, '533c75b4-dc73-5107-be61-5ced5742882c', 'owner-email:goldboy.musicworld@gmail.com', 'MANINDER SINGH', '+919779149495', '9779149495', 'goldboy.musicworld@gmail.com', 'goldboy.musicworld@gmail.com', true, 'WORKBOOK', 'T6-702', 'T6', 6, '7', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":208,"OWNER NAME":"MANINDER SINGH","TOWER-\nFLATNO.":"T6-702","CONTACT DETAILS":9779149495,"EMAIL ID":"goldboy.musicworld@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (210, 209, 'a6841d64-9182-50c1-aad9-f347abd1e0e8', 'owner-email:gouravdarbi4u@gmail.com', 'GOURAV KAMBOJ', '+919812117906', '9812117906', 'gouravdarbi4u@gmail.com', 'gouravdarbi4u@gmail.com', true, 'WORKBOOK', 'T6-703', 'T6', 6, '7', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":209,"OWNER NAME":"GOURAV KAMBOJ","TOWER-\nFLATNO.":"T6-703","CONTACT DETAILS":9812117906,"EMAIL ID":"gouravdarbi4u@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (211, 210, '80592567-8ca7-5069-b9e8-cb9f25c4d040', 'owner-email:ishdeep.malhotra@gmail.com', 'HARINDER KAUR', '+919876096400', '9876096400', 'ishdeep.malhotra@gmail.com', 'ishdeep.malhotra@gmail.com', true, 'WORKBOOK', 'T6-704', 'T6', 6, '7', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'RENU GOYAL;', '{"S.No":210,"OWNER NAME":"HARINDER KAUR","TOWER-\nFLATNO.":"T6-704","CONTACT DETAILS":9876096400,"EMAIL ID":"ishdeep.malhotra@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RENU GOYAL;","AREA":1755,"RATE":3.25}'),
    (212, 211, '7691fbf8-f9b9-56ef-9478-d04275bb709e', 'owner-profile:rhitoban.ray.chaudhury.ruchira.sen:+918146185514', 'RHITOBAN RAY CHAUDHURY / RUCHIRA SEN', '+918146185514', '8146185514', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-801', 'T6', 6, '8', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'DILDAR SINGH GILL;', '{"S.No":211,"OWNER NAME":"RHITOBAN RAY CHAUDHURY\nRUCHIRA SEN","TOWER-\nFLATNO.":"T6-801","CONTACT DETAILS":8146185514,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"DILDAR SINGH GILL;","AREA":1755,"RATE":3.25}'),
    (213, 212, '3ad3e48e-832b-5b45-a9ee-bf6305880fe7', 'owner-email:itsshayra1@gmail.com', 'GURLEEN KAUR / ANTAR', '+918284858874', '8284858874', 'itsshayra1@gmail.com', 'itsshayra1@gmail.com', true, 'WORKBOOK', 'T6-802', 'T6', 6, '8', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":212,"OWNER NAME":"GURLEEN KAUR\nANTAR","TOWER-\nFLATNO.":"T6-802","CONTACT DETAILS":8284858874,"EMAIL ID":"itsshayra1@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (214, 213, '2c54cc83-1138-5947-b234-9482060bbf51', 'owner-email:sandeshsood24@gmail.com', 'SANDESH SOOD', '+917895577123', '7895577123', 'sandeshsood24@gmail.com', 'sandeshsood24@gmail.com', true, 'WORKBOOK', 'T6-803', 'T6', 6, '8', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":213,"OWNER NAME":"SANDESH SOOD","TOWER-\nFLATNO.":"T6-803","CONTACT DETAILS":7895577123,"EMAIL ID":"sandeshsood24@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (215, 214, '06515771-ffd6-5566-aaa4-a3bdbf905227', 'owner-email:priyakaushal@gmail.com', 'VANI TANWAR', '+918146696644', '8146696644; 8872711156; 9878347042', 'priyakaushal@gmail.com', 'priyakaushal@gmail.com', true, 'WORKBOOK', 'T6-804', 'T6', 6, '8', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":214,"OWNER NAME":"VANI TANWAR","TOWER-\nFLATNO.":"T6-804","CONTACT DETAILS":"8146696644\n8872711156\n9878347042","EMAIL ID":"priyakaushal@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (216, 215, '21ce3793-6702-5b6b-a751-20531c8ecb53', 'owner-email:himanshu757@gmail.com', 'HIMANSHU GOYAL / PRAGYA MEHTA', '+919501020757', '9501020757', 'himanshu757@gmail.com', 'himanshu757@gmail.com', true, 'WORKBOOK', 'T6-901', 'T6', 6, '9', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":215,"OWNER NAME":"HIMANSHU GOYAL\nPRAGYA MEHTA","TOWER-\nFLATNO.":"T6-901","CONTACT DETAILS":9501020757,"EMAIL ID":"himanshu757@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (217, 216, '3a037ba9-d066-58d9-99e3-9a874aa83c1f', 'owner-email:kirtikhosla02@gmail.com', 'KIRTI KHOSLA / AMIT KHOSLA', '+917814657727', '7814657727; 9888884329', 'kirtikhosla02@gmail.com', 'kirtikhosla02@gmail.com', true, 'WORKBOOK', 'T6-902', 'T6', 6, '9', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'ABHISHEK ARORA; VAISHALI;', '{"S.No":216,"OWNER NAME":"KIRTI KHOSLA\nAMIT KHOSLA","TOWER-\nFLATNO.":"T6-902","CONTACT DETAILS":"7814657727\n9888884329","EMAIL ID":"kirtikhosla02@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ABHISHEK ARORA; VAISHALI;","AREA":1755,"RATE":3.25}'),
    (218, 217, '6076cd6d-5042-5cf3-8977-f594181869f5', 'owner-profile:ishwinder.cheema.jetinder.kaur:+919779550537', 'ISHWINDER CHEEMA / JETINDER KAUR', '+919779550537', '9779550537', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-903', 'T6', 6, '9', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'LUXMI DEVI; JAGRITI; BHARTI; ROOPAM CHAUHAN (H); KOMALPREET KAUR;', '{"S.No":217,"OWNER NAME":"ISHWINDER CHEEMA\nJETINDER KAUR","TOWER-\nFLATNO.":"T6-903","CONTACT DETAILS":9779550537,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"LUXMI DEVI; JAGRITI; BHARTI; ROOPAM CHAUHAN (H); KOMALPREET KAUR;","AREA":1755,"RATE":3.25}'),
    (219, 218, '1e3b104b-5d67-52d7-bab1-5eea001d9c88', 'owner-email:pjsmultani@gmail.com', 'PARAMJIT SINGH', '+917087967349', '7087967349', 'pjsmultani@gmail.com', 'pjsmultani@gmail.com', true, 'WORKBOOK', 'T6-904', 'T6', 6, '9', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":218,"OWNER NAME":"PARAMJIT SINGH","TOWER-\nFLATNO.":"T6-904","CONTACT DETAILS":7087967349,"EMAIL ID":"pjsmultani@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (220, 219, '1892c8ec-3d81-5799-b265-6895fe9ed88d', 'owner-email:ranjitsidhu180@gmail.com', 'BALVEER KAUR', '+919779188111', '9779188111', 'ranjitsidhu180@gmail.com', 'ranjitsidhu180@gmail.com', true, 'WORKBOOK', 'T6-1001', 'T6', 6, '10', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":219,"OWNER NAME":"BALVEER KAUR","TOWER-\nFLATNO.":"T6-1001","CONTACT DETAILS":9779188111,"EMAIL ID":"ranjitsidhu180@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (221, 220, '1ca8762a-2e11-5c2c-a360-609db7b01619', 'owner-email:sharmaajay03@gmail.com', 'SARITA SHARMA', '+919915041321', '9915041321; 9816159233', 'sharmaajay03@gmail.com', 'sharmaajay03@gmail.com', true, 'WORKBOOK', 'T6-1002', 'T6', 6, '10', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":220,"OWNER NAME":"SARITA SHARMA","TOWER-\nFLATNO.":"T6-1002","CONTACT DETAILS":"9915041321\n9816159233","EMAIL ID":"sharmaajay03@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (222, 221, '637df798-b90e-5ff0-a086-9be6cda92d3b', 'owner-email:bhuvneshpathania1965@gmail.com', 'BHUVNESH PATHANIA / SASHI PATHANIA', '+918894700860', '8894700860; 9418125035', 'bhuvneshpathania1965@gmail.com; Shashi.pathania950@gmail.com', 'bhuvneshpathania1965@gmail.com', true, 'WORKBOOK', 'T6-1003', 'T6', 6, '10', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":221,"OWNER NAME":"BHUVNESH PATHANIA\nSASHI PATHANIA","TOWER-\nFLATNO.":"T6-1003","CONTACT DETAILS":"8894700860\n9418125035","EMAIL ID":"bhuvneshpathania1965@gmail.com\nShashi.pathania950@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (223, 222, 'c431ab93-d3f0-5db2-9236-d491a1c1b00b', 'owner-profile:ramganesh.subramanian.nipunbir.kuldeep.singh:+919870400464', 'RAMGANESH SUBRAMANIAN / NIPUNBIR KULDEEP SINGH', '+919870400464', '9870400464', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-1004', 'T6', 6, '10', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'JATINDER; HARSHBAB SINGH;', '{"S.No":222,"OWNER NAME":"RAMGANESH SUBRAMANIAN\nNIPUNBIR KULDEEP SINGH","TOWER-\nFLATNO.":"T6-1004","CONTACT DETAILS":9870400464,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JATINDER; HARSHBAB SINGH;","AREA":1755,"RATE":3.25}'),
    (224, 223, 'e8c923b0-1ecd-5ea9-ab07-1a30b56e24a8', 'owner-email:jeetgillonline@gmail.com', 'JASDEEP SINGH', '+917035800009', '7035800009', 'jeetgillonline@gmail.com', 'jeetgillonline@gmail.com', true, 'WORKBOOK', 'T6-1101', 'T6', 6, '11', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":223,"OWNER NAME":"JASDEEP SINGH","TOWER-\nFLATNO.":"T6-1101","CONTACT DETAILS":7035800009,"EMAIL ID":"jeetgillonline@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (225, 224, 'f8b6c123-39f6-5f73-b039-93b7c21f73a2', 'owner-email:nitintyagi11980@gmail.com', 'NITIN KUMAR TYAGI / ISHA TYAGI', '+919041024806', '9041024806; 9041024805', 'nitintyagi11980@gmail.com', 'nitintyagi11980@gmail.com', true, 'WORKBOOK', 'T6-1102', 'T6', 6, '11', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":224,"OWNER NAME":"NITIN KUMAR TYAGI\nISHA TYAGI","TOWER-\nFLATNO.":"T6-1102","CONTACT DETAILS":"9041024806\n9041024805","EMAIL ID":"nitintyagi11980@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (226, 225, 'c3c32a69-439a-563d-aa4f-e950eb177a62', 'owner-email:chauhanrk61@gmail.com', 'RAMESH KUMAR CHAUHAN / KANTA DEVI', '+919418455190', '9418455190; 9418455191', 'chauhanrk61@gmail.com; abhishek.chauhanart@gmail.com', 'chauhanrk61@gmail.com', true, 'WORKBOOK', 'T6-1103', 'T6', 6, '11', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":225,"OWNER NAME":"RAMESH KUMAR CHAUHAN\nKANTA DEVI","TOWER-\nFLATNO.":"T6-1103","CONTACT DETAILS":"9418455190\n9418455191","EMAIL ID":"chauhanrk61@gmail.com\nabhishek.chauhanart@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (227, 226, 'dd70f87f-86b4-5f4b-928e-5de694ab1ced', 'owner-profile:binaydeep.singh:+919999442289', 'BINAYDEEP SINGH', '+919999442289', '9999442289', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-1104', 'T6', 6, '11', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'UDAY PRATAP SINGH;', '{"S.No":226,"OWNER NAME":"BINAYDEEP SINGH","TOWER-\nFLATNO.":"T6-1104","CONTACT DETAILS":9999442289,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"UDAY PRATAP SINGH;","AREA":1755,"RATE":3.25}'),
    (228, 227, 'a1976bc2-5955-5b81-b4c3-589a3456c240', 'owner-email:singh.lucky606@gmail.com', 'PARAMJEET KAUR', '+919646366970', '9646366970; 7500011170', 'Singh.lucky606@gmail.com', 'singh.lucky606@gmail.com', true, 'WORKBOOK', 'T6-1201', 'T6', 6, '12', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":227,"OWNER NAME":"PARAMJEET KAUR","TOWER-\nFLATNO.":"T6-1201","CONTACT DETAILS":"9646366970\n7500011170","EMAIL ID":"Singh.lucky606@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (229, 228, '1304381b-6c8a-52fd-b023-6f4058bd6db6', 'owner-email:div1758@gmail.com', 'ARUSHI SHARMA / DIVYANSHU KAUSHIK', '358406472035', '358406472035; 8178999545', 'div1758@gmail.com', 'div1758@gmail.com', true, 'WORKBOOK', 'T6-1202', 'T6', 6, '12', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'AMRITPAL KAUR AHLUWALIA; ANUP KUMAR RAI; DHARAM PAL SINGH AHLUWALIA; RAVINDER KAUR AHLUWALIA;', '{"S.No":228,"OWNER NAME":"ARUSHI SHARMA\nDIVYANSHU KAUSHIK","TOWER-\nFLATNO.":"T6-1202","CONTACT DETAILS":"358406472035\n8178999545","EMAIL ID":"div1758@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"AMRITPAL KAUR AHLUWALIA; ANUP KUMAR RAI; DHARAM PAL SINGH AHLUWALIA; RAVINDER KAUR AHLUWALIA;","AREA":1755,"RATE":3.25}'),
    (230, 229, 'edab5127-eaaa-528c-adcf-e5eb94fd46eb', 'owner-email:soodchetan@rediffmail.com', 'DR. CHETAN SOOD', '+919235553096', '9235553096', 'soodchetan@rediffmail.com', 'soodchetan@rediffmail.com', true, 'WORKBOOK', 'T6-1203', 'T6', 6, '12', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'HARDIK PAHWA;', '{"S.No":229,"OWNER NAME":"DR. CHETAN SOOD","TOWER-\nFLATNO.":"T6-1203","CONTACT DETAILS":9235553096,"EMAIL ID":"soodchetan@rediffmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HARDIK PAHWA;","AREA":1755,"RATE":3.25}'),
    (231, 230, '075ef7de-9d19-5e2e-a3d2-1cf2a391d533', 'owner-email:jaskaran023@gmail.com', 'JASKARAN SINGH / KIRANDEEP KAUR', '+919569454900', '9569454900', 'jaskaran023@gmail.com', 'jaskaran023@gmail.com', true, 'WORKBOOK', 'T6-1204', 'T6', 6, '12', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":230,"OWNER NAME":"JASKARAN SINGH\nKIRANDEEP KAUR","TOWER-\nFLATNO.":"T6-1204","CONTACT DETAILS":9569454900,"EMAIL ID":"jaskaran023@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (232, 231, '138f3005-c0a8-5e10-a37c-c831a8f12b18', 'owner-profile:inderpreet.singh.malkiat.kaur:+919988878788', 'INDERPREET SINGH / MALKIAT KAUR', '+919988878788', '9988878788', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-1401', 'T6', 6, '14', '1755 SQFT', 1755.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":231,"OWNER NAME":"INDERPREET SINGH \nMALKIAT KAUR","TOWER-\nFLATNO.":"T6-1401","CONTACT DETAILS":9988878788,"EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1755,"RATE":3.25}'),
    (233, 232, 'f2a03df2-9a11-525e-be6d-c0e121383b7f', 'owner-email:cedavindersharma@gmail.com', 'DAVINDER SHARMA / TRIPTA SHARMA', '+918558066750', '8558066750', 'cedavindersharma@gmail.com', 'cedavindersharma@gmail.com', true, 'WORKBOOK', 'T6-1402', 'T6', 6, '14', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'RASHMI LAXMAN SHETTY; MISHIKA; ANKIT MEHTA; ARVIND MEHTA; RAKSHA MEHTA', '{"S.No":232,"OWNER NAME":"DAVINDER SHARMA\nTRIPTA SHARMA","TOWER-\nFLATNO.":"T6-1402","CONTACT DETAILS":8558066750,"EMAIL ID":"cedavindersharma@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RASHMI LAXMAN SHETTY; MISHIKA; ANKIT MEHTA; ARVIND MEHTA; RAKSHA MEHTA","AREA":1755,"RATE":3.25}'),
    (234, 233, 'edab5127-eaaa-528c-adcf-e5eb94fd46eb', 'owner-email:soodchetan@rediffmail.com', 'DR. CHETAN SOOD', '+919235553096', '9235553096', 'soodchetan@rediffmail.com', 'soodchetan@rediffmail.com', true, 'WORKBOOK', 'T6-1403', 'T6', 6, '14', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'HARDIK PAHWA;', '{"S.No":233,"OWNER NAME":"DR. CHETAN SOOD","TOWER-\nFLATNO.":"T6-1403","CONTACT DETAILS":9235553096,"EMAIL ID":"soodchetan@rediffmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HARDIK PAHWA;","AREA":1755,"RATE":3.25}'),
    (235, 234, '99161f8b-0a9e-5671-b644-57bb3678da95', 'owner-profile:mohinder.kaur:+918360138201', 'MOHINDER KAUR', '+918360138201', '8360138201', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T6-1404', 'T6', 6, '14', '1755 SQFT', 1755.00, 3.25, 'TENANT', 'TENANTED', 'RIYA ATTRI; KHUSHI SHARMA;', '{"S.No":234,"OWNER NAME":"MOHINDER KAUR","TOWER-\nFLATNO.":"T6-1404","CONTACT DETAILS":8360138201,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RIYA ATTRI; KHUSHI SHARMA;","AREA":1755,"RATE":3.25}'),
    (236, 235, '521854f9-d23d-5948-9514-acfb6e74e477', 'owner-email:singhavreet0@gmail.com', 'AMIT SINGLA', '+917780808492', '7780808492', 'singhavreet0@gmail.com', 'singhavreet0@gmail.com', true, 'WORKBOOK', 'T7-101', 'T7', 7, '1', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'AMIT KANWAR; AKHIL SHARMA; ISHANT KAMAL;', '{"S.No":235,"OWNER NAME":"AMIT SINGLA","TOWER-\nFLATNO.":"T7-101","CONTACT DETAILS":7780808492,"EMAIL ID":"singhavreet0@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"AMIT KANWAR; AKHIL SHARMA; ISHANT KAMAL;","AREA":1675,"RATE":3.25}'),
    (237, 236, 'c9d47e67-79e5-5337-ac62-27e1ac1ab043', 'owner-profile:suvinder.pal.singh.anmolpreet.singh:+919855544769', 'SUVINDER PAL SINGH / ANMOLPREET SINGH', '+919855544769', '9855544769; 8437610210', 'anmolpreet_singh@yahoo,com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T7-102', 'T7', 7, '1', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'SANDEEP KUMAR; NAVRAJ SANGHA; PRABHPREET SINGH KAHLON; NEETU BHARTI;', '{"S.No":236,"OWNER NAME":"SUVINDER PAL SINGH\nANMOLPREET SINGH","TOWER-\nFLATNO.":"T7-102","CONTACT DETAILS":"9855544769\n8437610210","EMAIL ID":"anmolpreet_singh@yahoo,com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SANDEEP KUMAR; NAVRAJ SANGHA; PRABHPREET SINGH KAHLON; NEETU BHARTI;","AREA":1675,"RATE":3.25}'),
    (238, 237, '60291e17-07b7-5254-9671-8c577d9f53e3', 'owner-email:sittaldevjindal@gmail.com', 'SITTAL DEV JINDAL / SANTOSH JINDAL', '+919417023019', '9417023019', 'sittaldevjindal@gmail.com', 'sittaldevjindal@gmail.com', true, 'WORKBOOK', 'T7-103', 'T7', 7, '1', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":237,"OWNER NAME":"SITTAL DEV JINDAL\nSANTOSH JINDAL","TOWER-\nFLATNO.":"T7-103","CONTACT DETAILS":9417023019,"EMAIL ID":"sittaldevjindal@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (239, 238, '0889a7c5-dd45-5419-ac95-58cca2b2407b', 'owner-profile:pavneet.kaur.rajdeep.singh:+918178512872', 'PAVNEET KAUR / RAJDEEP SINGH', '+918178512872', '8178512872', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T7-104', 'T7', 7, '1', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'BHAGWANT SINGH; ANJU RANI; VISHAKHA BHARDWAJ;', '{"S.No":238,"OWNER NAME":"PAVNEET KAUR\nRAJDEEP SINGH","TOWER-\nFLATNO.":"T7-104","CONTACT DETAILS":8178512872,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"BHAGWANT SINGH; ANJU RANI; VISHAKHA BHARDWAJ;","AREA":1675,"RATE":3.25}'),
    (240, 239, 'b69e322f-3bdb-5fef-bec6-bee683e591a0', 'owner-email:navneetkaur19711@gmail.com', 'NAVNEET KAUR', '+918284835544', '8284835544', 'navneetkaur19711@gmail.com', 'navneetkaur19711@gmail.com', true, 'WORKBOOK', 'T7-201', 'T7', 7, '2', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":239,"OWNER NAME":"NAVNEET KAUR","TOWER-\nFLATNO.":"T7-201","CONTACT DETAILS":8284835544,"EMAIL ID":"navneetkaur19711@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (241, 240, '15c92dcf-048a-51ad-b673-02d146ef219d', 'owner-email:amrit.3344@gmail.com', 'AMRITPAL / GURDEEP KAUR', '+919940368965', '9940368965', 'amrit.3344@gmail.com', 'amrit.3344@gmail.com', true, 'WORKBOOK', 'T7-202', 'T7', 7, '2', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":240,"OWNER NAME":"AMRITPAL\nGURDEEP KAUR","TOWER-\nFLATNO.":"T7-202","CONTACT DETAILS":9940368965,"EMAIL ID":"amrit.3344@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (242, 241, 'af1f3d93-6a4b-55a2-8304-0207d293575c', 'owner-email:iswalia91@gmail.com', 'JAGJIT KAUR WALIA / INDERJIT SINGH', '+919419190045', '9419190045', 'iswalia91@gmail.com', 'iswalia91@gmail.com', true, 'WORKBOOK', 'T7-203', 'T7', 7, '2', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":241,"OWNER NAME":"JAGJIT KAUR WALIA\nINDERJIT SINGH","TOWER-\nFLATNO.":"T7-203","CONTACT DETAILS":9419190045,"EMAIL ID":"iswalia91@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (243, 242, '2568d46f-febb-50c5-ad1c-9a2a1df7b178', 'owner-email:ravinder.goyat@gmail.com', 'RAVINDER GOYAT / NEERAJ GOYAT', '+919212053532', '9212053532', 'ravinder.goyat@gmail.com', 'ravinder.goyat@gmail.com', true, 'WORKBOOK', 'T7-204', 'T7', 7, '2', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":242,"OWNER NAME":"RAVINDER GOYAT\nNEERAJ GOYAT","TOWER-\nFLATNO.":"T7-204","CONTACT DETAILS":9212053532,"EMAIL ID":"ravinder.goyat@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (244, 243, 'a2841eb3-ab8e-5da4-85b9-f05cef0b656d', 'owner-email:mannat.pes@gmail.com', 'MANNATJOT SINGH ANEJA / DIVYAPREET KAUR', '+919876321401', '9876321401; 9953693947', 'mannat.pes@gmail.com; div.sethi.7@gmail.com', 'mannat.pes@gmail.com', true, 'WORKBOOK', 'T7-301', 'T7', 7, '3', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'SAURABH RANA; CHIRAG KAPILA;', '{"S.No":243,"OWNER NAME":"MANNATJOT SINGH ANEJA\nDIVYAPREET KAUR","TOWER-\nFLATNO.":"T7-301","CONTACT DETAILS":"9876321401\n9953693947","EMAIL ID":"mannat.pes@gmail.com\ndiv.sethi.7@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SAURABH RANA; CHIRAG KAPILA;","AREA":1675,"RATE":3.25}'),
    (245, 244, '93907b29-f80e-5c44-ad32-70a76fb49137', 'owner-email:ajayjindal56@gmail.com', 'AJAY KUMAR JINDAL', '+919888681412', '9888681412', 'ajayjindal56@gmail.com', 'ajayjindal56@gmail.com', true, 'WORKBOOK', 'T7-302', 'T7', 7, '3', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'NAVNEET SINGH; RISHAV SHARMA;', '{"S.No":244,"OWNER NAME":"AJAY KUMAR JINDAL","TOWER-\nFLATNO.":"T7-302","CONTACT DETAILS":9888681412,"EMAIL ID":"ajayjindal56@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NAVNEET SINGH; RISHAV SHARMA;","AREA":1675,"RATE":3.25}'),
    (246, 245, '814ebe77-1423-5a3f-a90f-2257dd82cd2e', 'owner-profile:nitin.kapila:+919599948987', 'NITIN KAPILA', '+919599948987', '9599948987', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T7-303', 'T7', 7, '3', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'LOVISH BEHL;', '{"S.No":245,"OWNER NAME":"NITIN KAPILA","TOWER-\nFLATNO.":"T7-303","CONTACT DETAILS":9599948987,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"LOVISH BEHL;","AREA":1675,"RATE":3.25}'),
    (247, 246, 'b365d981-805c-5ea2-af74-56e924c9223e', 'owner-email:kanwal.kindle@gmail.com', 'KANWAL PREET SINGH / RAVLEEN KAUR', '+918920516702', '8920516702', 'kanwal.kindle@gmail.com', 'kanwal.kindle@gmail.com', true, 'WORKBOOK', 'T7-304', 'T7', 7, '3', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":246,"OWNER NAME":"KANWAL PREET SINGH\nRAVLEEN KAUR","TOWER-\nFLATNO.":"T7-304","CONTACT DETAILS":8920516702,"EMAIL ID":"kanwal.kindle@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (248, 247, 'f1925d91-01ca-5c2f-9c7e-805c881880ca', 'owner-email:anmoldhawan58@gmail.com', 'DISHA AGARWAL / ANMOL DHAWAN', '+919878315392', '9878315392', 'anmoldhawan58@gmail.com', 'anmoldhawan58@gmail.com', true, 'WORKBOOK', 'T7-401', 'T7', 7, '4', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":247,"OWNER NAME":"DISHA AGARWAL\nANMOL DHAWAN","TOWER-\nFLATNO.":"T7-401","CONTACT DETAILS":9878315392,"EMAIL ID":"anmoldhawan58@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (249, 248, '07769705-927f-5d6c-b1f8-ddb3677962c5', 'owner-email:malhotranavin17@gmail.com', 'NAVIN MALHOTRA', '+919876103433', '9876103433; 82838 03592', 'malhotranavin17@gmail.com', 'malhotranavin17@gmail.com', true, 'WORKBOOK', 'T7-402', 'T7', 7, '4', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":248,"OWNER NAME":"NAVIN MALHOTRA","TOWER-\nFLATNO.":"T7-402","CONTACT DETAILS":"9876103433\n82838 03592","EMAIL ID":"malhotranavin17@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (250, 249, '64274aba-e1da-55a2-be44-35b7f1c7bfd6', 'owner-email:yogeshwar.phull@gmail.com', 'YOGESHWAR PHULL / PRIYANKA VERMA PHULL', '+919999317847', '9999317847; 9560055300', 'yogeshwar.phull@gmail.com', 'yogeshwar.phull@gmail.com', true, 'WORKBOOK', 'T7-403', 'T7', 7, '4', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":249,"OWNER NAME":"YOGESHWAR PHULL\nPRIYANKA VERMA PHULL","TOWER-\nFLATNO.":"T7-403","CONTACT DETAILS":"9999317847\n9560055300","EMAIL ID":"yogeshwar.phull@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (251, 250, 'eeaff03c-49b1-551e-b317-1695b344f304', 'owner-email:amrindersingh0701@gmail.com', 'JASPREET KAUR / AMRINDER SINGH', '+919914216263', '9914216263', 'amrindersingh0701@gmail.com', 'amrindersingh0701@gmail.com', true, 'WORKBOOK', 'T7-404', 'T7', 7, '4', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'NISHIKA SHARMA; PRATISHTHA SINGH;', '{"S.No":250,"OWNER NAME":"JASPREET KAUR\nAMRINDER SINGH","TOWER-\nFLATNO.":"T7-404","CONTACT DETAILS":9914216263,"EMAIL ID":"amrindersingh0701@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NISHIKA SHARMA; PRATISHTHA SINGH;","AREA":1675,"RATE":3.25}'),
    (252, 251, '0d995b79-6949-51af-a23a-73e652b0da25', 'owner-email:abhishek271295@gmail.com', 'ABHISHEK MAHAJAN', '+918360886853', '8360886853', 'abhishek271295@gmail.com', 'abhishek271295@gmail.com', true, 'WORKBOOK', 'T7-501', 'T7', 7, '5', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":251,"OWNER NAME":"ABHISHEK MAHAJAN","TOWER-\nFLATNO.":"T7-501","CONTACT DETAILS":8360886853,"EMAIL ID":"abhishek271295@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (253, 252, '559d3099-cd48-5012-bf21-80d1acd58fad', 'owner-email:manikkakkar15@gmail.com', 'SWAPNIL SINGH / MANIK KAKKAR', '+919888088335', '9888088335', 'manikkakkar15@gmail.com', 'manikkakkar15@gmail.com', true, 'WORKBOOK', 'T7-502', 'T7', 7, '5', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":252,"OWNER NAME":"SWAPNIL SINGH\nMANIK KAKKAR","TOWER-\nFLATNO.":"T7-502","CONTACT DETAILS":9888088335,"EMAIL ID":"manikkakkar15@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1675,"RATE":3.25}'),
    (254, 253, '28b132e6-bcd3-54b9-92f1-ebf9ab020eef', 'owner-profile:surinder.kaur.bhatia:+919915774415', 'SURINDER KAUR BHATIA', '+919915774415', '9915774415', 'dilkaransingh01@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T7-503', 'T7', 7, '5', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'ERNEST LESLIE GAUDOIN', '{"S.No":253,"OWNER NAME":"SURINDER KAUR BHATIA","TOWER-\nFLATNO.":"T7-503","CONTACT DETAILS":9915774415,"EMAIL ID":"dilkaransingh01@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ERNEST LESLIE GAUDOIN","AREA":1675,"RATE":3.25}'),
    (255, 254, 'ef87b2c8-b584-5f25-8525-cb820caf6156', 'owner-email:dash2ashish@gmail.com', 'ASHISH THAKUR', '+919816042848', '9816042848; +6584348944', 'dash2ashish@gmail.com', 'dash2ashish@gmail.com', true, 'WORKBOOK', 'T7-504', 'T7', 7, '5', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":254,"OWNER NAME":"ASHISH THAKUR","TOWER-\nFLATNO.":"T7-504","CONTACT DETAILS":"9816042848\n+6584348944","EMAIL ID":"dash2ashish@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (256, 255, '0b835ad8-9595-5574-8393-77ea3a3ee4ae', 'owner-email:jaskarandhanoa@gmail.com', 'SAMIKSHA KOUL / JASKARAN SINGH DHANOA', '+917888809746', '7888809746', 'jaskarandhanoa@gmail.com', 'jaskarandhanoa@gmail.com', true, 'WORKBOOK', 'T7-601', 'T7', 7, '6', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":255,"OWNER NAME":"SAMIKSHA KOUL\nJASKARAN SINGH DHANOA","TOWER-\nFLATNO.":"T7-601","CONTACT DETAILS":7888809746,"EMAIL ID":"jaskarandhanoa@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (257, 256, '66cb7c6f-97d3-5e75-8c79-568bd9968d00', 'owner-email:vinay.gsn@gmail.com', 'VINAY KUMAR GUSAIN / SHALINI NEGI', '+919654722183', '9654722183', 'vinay.gsn@gmail.com', 'vinay.gsn@gmail.com', true, 'WORKBOOK', 'T7-602', 'T7', 7, '6', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":256,"OWNER NAME":"VINAY KUMAR GUSAIN\nSHALINI NEGI","TOWER-\nFLATNO.":"T7-602","CONTACT DETAILS":9654722183,"EMAIL ID":"vinay.gsn@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (258, 257, '996021c3-5b94-5e73-9885-470064fe140a', 'owner-profile:karan.kaushal.ashok.kumar.kaushal:+918800999120', 'KARAN KAUSHAL / ASHOK KUMAR KAUSHAL', '+918800999120', '8800999120; 9417608192', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T7-603', 'T7', 7, '6', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'GURSEWAK SINGH;', '{"S.No":257,"OWNER NAME":"KARAN KAUSHAL\nASHOK KUMAR KAUSHAL","TOWER-\nFLATNO.":"T7-603","CONTACT DETAILS":"8800999120\n9417608192","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"GURSEWAK SINGH;","AREA":1675,"RATE":3.25}'),
    (259, 258, 'bedc45f7-b9e0-55ed-a6c3-1a7f4e13ab6b', 'owner-email:shivamthakur14022001@gmail.com', 'M/S JDNS ENGINEERING WORKS', '+918894558945', '8894558945; 9300000129; 8815200307', 'shivamthakur14022001@gmail.com; amrits0212@gmail.com', 'shivamthakur14022001@gmail.com', true, 'WORKBOOK', 'T7-604', 'T7', 7, '6', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'UDAY CHAUHAN; POOJA CHAUHAN;', '{"S.No":258,"OWNER NAME":"M/S JDNS ENGINEERING WORKS","TOWER-\nFLATNO.":"T7-604","CONTACT DETAILS":"8894558945\n9300000129\n8815200307","EMAIL ID":"shivamthakur14022001@gmail.com\namrits0212@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"UDAY CHAUHAN; POOJA CHAUHAN;","AREA":1675,"RATE":3.25}'),
    (260, 259, '96efadec-348f-5410-a5db-593daf112299', 'owner-email:manishajhinjha@icloud.com', 'MANISHA JHINJHA', '+919915783502', '9915783502', 'manishajhinjha@icloud.com', 'manishajhinjha@icloud.com', true, 'WORKBOOK', 'T7-701', 'T7', 7, '7', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'JANG DHILLON-GREWAL; KULWINDER SINGH; HUSANPREET SINGH; AMARPAL SINGH; HARSHDEEP SINGH;', '{"S.No":259,"OWNER NAME":"MANISHA JHINJHA","TOWER-\nFLATNO.":"T7-701","CONTACT DETAILS":9915783502,"EMAIL ID":"manishajhinjha@icloud.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JANG DHILLON-GREWAL; KULWINDER SINGH; HUSANPREET SINGH; AMARPAL SINGH; HARSHDEEP SINGH;","AREA":1675,"RATE":3.25}'),
    (261, 260, '80ff1b91-e7dc-515f-b7b1-d4e4451cdc79', 'owner-email:abhijhabber@gmail.com', 'ARVAIL SINGH / ABHITEJ SINGH', '+917494867399', '7494867399; 9814527007; 7399907777', 'abhijhabber@gmail.com; vinaybrar444@gmail.com; gulnarkaur07@gmail.com', 'abhijhabber@gmail.com', true, 'WORKBOOK', 'T7-702', 'T7', 7, '7', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":260,"OWNER NAME":"ARVAIL SINGH\nABHITEJ SINGH","TOWER-\nFLATNO.":"T7-702","CONTACT DETAILS":"7494867399\n9814527007\n7399907777","EMAIL ID":"abhijhabber@gmail.com\nvinaybrar444@gmail.com\ngulnarkaur07@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (262, 261, 'a5fbb38e-caac-5da3-bc80-e4d99fa71086', 'owner-email:prabhjotg817@gmail.com', 'AMITESHWAR SINGH SANDHU / BALBIR SINGH SIDHU', '+918847680824', '8847680824; 9433721897', 'prabhjotg817@gmail.com', 'prabhjotg817@gmail.com', true, 'WORKBOOK', 'T7-703', 'T7', 7, '7', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'GURBHAIJ KAUR; JASVIR KAUR;', '{"S.No":261,"OWNER NAME":"AMITESHWAR SINGH SANDHU\nBALBIR SINGH SIDHU","TOWER-\nFLATNO.":"T7-703","CONTACT DETAILS":"8847680824 \n9433721897","EMAIL ID":"prabhjotg817@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"GURBHAIJ KAUR; JASVIR KAUR;","AREA":1675,"RATE":3.25}'),
    (263, 262, 'cb20cf19-3c68-5655-aed4-5c366a69652b', 'owner-email:triptisharmas@gmail.com', 'TRIPTI SHARMA / MANGEESH SHARMA', '+919988742922', '9988742922; 9780218277', 'triptisharmas@gmail.com', 'triptisharmas@gmail.com', true, 'WORKBOOK', 'T7-704', 'T7', 7, '7', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'MANINDER SINGH; TEJINDER SINGH; GURPREET SINGH;', '{"S.No":262,"OWNER NAME":"TRIPTI SHARMA\nMANGEESH SHARMA","TOWER-\nFLATNO.":"T7-704","CONTACT DETAILS":"9988742922\n9780218277","EMAIL ID":"triptisharmas@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANINDER SINGH; TEJINDER SINGH\nGURPREET SINGH;","AREA":1675,"RATE":3.25}'),
    (264, 263, '68875a96-f62a-504d-be67-143ba1e530fe', 'owner-email:nayyar2151@gmail.com', 'SWEENY NAYYAR / VARUN NAYYAR', '+919872540009', '9872540009', 'nayyar2151@gmail.com', 'nayyar2151@gmail.com', true, 'WORKBOOK', 'T7-801', 'T7', 7, '8', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'SHARANDEEP SINGH; RAVINDER KUMAR;', '{"S.No":263,"OWNER NAME":"SWEENY NAYYAR\nVARUN NAYYAR","TOWER-\nFLATNO.":"T7-801","CONTACT DETAILS":9872540009,"EMAIL ID":"nayyar2151@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SHARANDEEP SINGH; RAVINDER KUMAR;","AREA":1675,"RATE":3.25}'),
    (265, 264, '3de43724-b595-5493-a080-a6976e3e7631', 'owner-email:navjot_15006@yahoo.in', 'DILJOT SINGH', '+917999999734', '7999999734; 9781515006; 8360303026', 'navjot_15006@yahoo.in; jpannu92@gmail.com', 'navjot_15006@yahoo.in', true, 'WORKBOOK', 'T7-802', 'T7', 7, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":264,"OWNER NAME":"DILJOT SINGH","TOWER-\nFLATNO.":"T7-802","CONTACT DETAILS":"7999999734\n9781515006\n8360303026","EMAIL ID":"navjot_15006@yahoo.in\njpannu92@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (266, 265, '959936f1-8328-5891-9faa-ef6030bccb5b', 'owner-email:gaganwbs@gmail.com', 'PREETPAUL KAUR ATWAL / GURDEV SINGH ATWAL', '+918000000638', '8000000638', 'gaganwbs@gmail.com', 'gaganwbs@gmail.com', true, 'WORKBOOK', 'T7-803', 'T7', 7, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":265,"OWNER NAME":"PREETPAUL KAUR ATWAL\nGURDEV SINGH ATWAL","TOWER-\nFLATNO.":"T7-803","CONTACT DETAILS":8000000638,"EMAIL ID":"gaganwbs@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (267, 266, '31668d23-6eab-568c-b86e-766e65d1d059', 'owner-email:ssbhatia2028@gmail.com', 'AEKAMJOT SINGH / S.S. BHATIA / ARVINDER KAUR', '+919646042866', '9646042866', 'ssbhatia2028@gmail.com', 'ssbhatia2028@gmail.com', true, 'WORKBOOK', 'T7-804', 'T7', 7, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":266,"OWNER NAME":"AEKAMJOT SINGH\nS.S. BHATIA\nARVINDER KAUR","TOWER-\nFLATNO.":"T7-804","CONTACT DETAILS":9646042866,"EMAIL ID":"ssbhatia2028@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (268, 267, '7e117811-80ff-5095-874d-e73f6344b78e', 'owner-email:scheema450@gmail.com', 'INDERMOHAN SINGH', '+918437610210', '8437610210; 9878981884; 8427593616', 'scheema450@gmail.com; sourabhrana74@gmail.com', 'scheema450@gmail.com', true, 'WORKBOOK', 'T7-901', 'T7', 7, '9', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":267,"OWNER NAME":"INDERMOHAN SINGH","TOWER-\nFLATNO.":"T7-901","CONTACT DETAILS":"8437610210\n9878981884\n8427593616","EMAIL ID":"scheema450@gmail.com\nsourabhrana74@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (269, 268, '7e117811-80ff-5095-874d-e73f6344b78e', 'owner-email:scheema450@gmail.com', 'INDERMOHAN SINGH', '+918437610210', '8437610210; 9878981884; 8427593616', 'scheema450@gmail.com; sourabhrana74@gmail.com', 'scheema450@gmail.com', true, 'WORKBOOK', 'T7-902', 'T7', 7, '9', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":268,"OWNER NAME":"INDERMOHAN SINGH","TOWER-\nFLATNO.":"T7-902","CONTACT DETAILS":"8437610210\n9878981884\n8427593616","EMAIL ID":"scheema450@gmail.com\nsourabhrana74@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (270, 269, '0bb06a1a-acec-5304-acb7-aa7bdc50a7be', 'owner-profile:indu.singh:+917872044464', 'INDU SINGH', '+917872044464', '7872044464', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-101', 'T8', 8, '1', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'HIMANSHU GUMBER; KUNAL GILL; DEVYANSH GARG;', '{"S.No":269,"OWNER NAME":"INDU SINGH","TOWER-\nFLATNO.":"T8-101","CONTACT DETAILS":7872044464,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HIMANSHU GUMBER; KUNAL GILL; DEVYANSH GARG;","AREA":1675,"RATE":3.25}'),
    (271, 270, '91159fa3-68ce-54d3-b031-a3d12287a7b0', 'owner-email:gursharanjeetsingh935@gmail.com', 'NARINDER PAL SINGH / GURSHARANJEET SINGH', '+919896761775', '9896761775', 'Gursharanjeetsingh935@gmail.com', 'gursharanjeetsingh935@gmail.com', true, 'WORKBOOK', 'T8-102', 'T8', 8, '1', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":270,"OWNER NAME":"NARINDER PAL SINGH\nGURSHARANJEET SINGH","TOWER-\nFLATNO.":"T8-102","CONTACT DETAILS":9896761775,"EMAIL ID":"Gursharanjeetsingh935@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (272, 271, 'b43fcdfb-56cd-591f-bfdb-83b3d4236eff', 'owner-email:rajanbhandari2@gmail.com', 'RAJAN / AARTI', '+917508976517', '7508976517', 'rajanbhandari2@gmail.com', 'rajanbhandari2@gmail.com', true, 'WORKBOOK', 'T8-103', 'T8', 8, '1', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":271,"OWNER NAME":"RAJAN\nAARTI","TOWER-\nFLATNO.":"T8-103","CONTACT DETAILS":7508976517,"EMAIL ID":"rajanbhandari2@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (273, 272, 'f2ccc190-26e8-59c3-99ae-e5ebdcbaaca1', 'owner-profile:rama.mittal.ajay.mittal:+918288010072', 'RAMA MITTAL / AJAY MITTAL', '+918288010072', '8288010072', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-104', 'T8', 8, '1', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'ONKAR SINGH; SONALI SINGH; MANPREET SINGH;', '{"S.No":272,"OWNER NAME":"RAMA MITTAL\nAJAY MITTAL","TOWER-\nFLATNO.":"T8-104","CONTACT DETAILS":8288010072,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ONKAR SINGH; SONALI SINGH; MANPREET SINGH;","AREA":1675,"RATE":3.25}'),
    (274, 273, '25663468-f70e-53ef-a4b2-a1bbe38cc233', 'owner-email:harmanjeetsidhus@gmail.com', 'CHARANJIT KAUR / HARMAN SIDHU', '+919671300042', '9671300042', 'harmanjeetsidhus@gmail.com', 'harmanjeetsidhus@gmail.com', true, 'WORKBOOK', 'T8-201', 'T8', 8, '2', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'INDER PREET SINGH; RAJNI; KIRAT KAUR; HARMAN GILL; GEET;', '{"S.No":273,"OWNER NAME":"CHARANJIT KAUR\nHARMAN SIDHU","TOWER-\nFLATNO.":"T8-201","CONTACT DETAILS":9671300042,"EMAIL ID":"harmanjeetsidhus@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"INDER PREET SINGH; RAJNI; KIRAT KAUR; HARMAN GILL; GEET;","AREA":1675,"RATE":3.25}'),
    (275, 274, 'd151c813-ba73-58e1-ac4d-13cd43aff5b3', 'owner-email:abhayjeetsingh1981@gmail.com', 'ABHAYJEET SINGH', '+917425927556', '7425927556', 'abhayjeetsingh1981@gmail.com', 'abhayjeetsingh1981@gmail.com', true, 'WORKBOOK', 'T8-202', 'T8', 8, '2', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":274,"OWNER NAME":"ABHAYJEET SINGH","TOWER-\nFLATNO.":"T8-202","CONTACT DETAILS":7425927556,"EMAIL ID":"abhayjeetsingh1981@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1675,"RATE":3.25}'),
    (276, 275, 'c688f75d-c545-5d3c-ad44-109b96e06fcb', 'owner-profile:gurvinder.kaur:+919350075050', 'GURVINDER KAUR', '+919350075050', '9350075050; +16479690600', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-203', 'T8', 8, '2', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'ANKITA VERMA; HEENA NARULA;', '{"S.No":275,"OWNER NAME":"GURVINDER KAUR","TOWER-\nFLATNO.":"T8-203","CONTACT DETAILS":"9350075050\n+16479690600","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ANKITA VERMA; HEENA NARULA;","AREA":1675,"RATE":3.25}'),
    (277, 276, 'c76cfbb5-6d3b-57be-b11b-652d25885565', 'owner-profile:harmeet.sharma:+919878475532', 'HARMEET SHARMA', '+919878475532', '9878475532', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-204', 'T8', 8, '2', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'AASHISH; ANKIT;', '{"S.No":276,"OWNER NAME":"HARMEET SHARMA","TOWER-\nFLATNO.":"T8-204","CONTACT DETAILS":9878475532,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"AASHISH; ANKIT;","AREA":1675,"RATE":3.25}'),
    (278, 277, '0f7dcd69-e83a-5bb7-be73-b1309ecfa410', 'owner-email:info@paramhunjan.com', 'PARAMJIT SINGH HUNJAN', '+919888630450', '9888630450', 'info@paramhunjan.com', 'info@paramhunjan.com', true, 'WORKBOOK', 'T8-301', 'T8', 8, '3', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":277,"OWNER NAME":"PARAMJIT SINGH HUNJAN","TOWER-\nFLATNO.":"T8-301","CONTACT DETAILS":9888630450,"EMAIL ID":"info@paramhunjan.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (279, 278, '83b5ba63-d650-580b-beca-a8a9c5720018', 'owner-profile:neha.sharma:+916280209831', 'NEHA SHARMA', '+916280209831', '6280209831', 'Vishnu@envsoft.io', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-302', 'T8', 8, '3', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":278,"OWNER NAME":"NEHA SHARMA","TOWER-\nFLATNO.":"T8-302","CONTACT DETAILS":6280209831,"EMAIL ID":"Vishnu@envsoft.io","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (280, 279, 'd9e01ee2-a51b-5fac-9abe-a109cd71f90c', 'owner-profile:sunil.kumar.thakur:+917307307968', 'SUNIL KUMAR THAKUR', '+917307307968', '7307307968', 'sidharth_doc@yahoo.co.in', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-303', 'T8', 8, '3', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":279,"OWNER NAME":"SUNIL KUMAR THAKUR","TOWER-\nFLATNO.":"T8-303","CONTACT DETAILS":7307307968,"EMAIL ID":"sidharth_doc@yahoo.co.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (281, 280, 'efb89b5b-266a-5257-8ecc-5476cbf4cc46', 'owner-profile:dr.sidharth.puri:+919872359411', 'DR. SIDHARTH PURI', '+919872359411', '9872359411', 'sidharth_doc@yahoo.co.in', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-304', 'T8', 8, '3', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":280,"OWNER NAME":"DR. SIDHARTH PURI","TOWER-\nFLATNO.":"T8-304","CONTACT DETAILS":9872359411,"EMAIL ID":"sidharth_doc@yahoo.co.in","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (282, 281, 'c98350f7-7c47-5a7a-8123-88be429a9d1f', 'owner-profile:gaganpreet.singh.suminder.kaur:+919158359052', 'GAGANPREET SINGH / SUMINDER KAUR', '+919158359052', '91583 59052', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-401', 'T8', 8, '4', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'MANDEEP SINGH DHINDSA;', '{"S.No":281,"OWNER NAME":"GAGANPREET SINGH\nSUMINDER KAUR","TOWER-\nFLATNO.":"T8-401","CONTACT DETAILS":"91583 59052","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"MANDEEP SINGH DHINDSA;","AREA":1675,"RATE":3.25}'),
    (283, 282, '28b132e6-bcd3-54b9-92f1-ebf9ab020eef', 'owner-profile:surinder.kaur.bhatia:+919915774415', 'SURINDER KAUR BHATIA', '+919915774415', '9915774415', 'dilkaransingh01@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-402', 'T8', 8, '4', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'JAYANT KALRA;', '{"S.No":282,"OWNER NAME":"SURINDER KAUR BHATIA","TOWER-\nFLATNO.":"T8-402","CONTACT DETAILS":9915774415,"EMAIL ID":"dilkaransingh01@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JAYANT KALRA;","AREA":1675,"RATE":3.25}'),
    (284, 283, '5cfa1ed4-c8a5-5e33-9b6c-e4875ef1d1fc', 'owner-email:ashish.mahenia@gmail.com', 'ASHISH KUMAR', '+917889195282', '7889195282', 'ashish.mahenia@gmail.com', 'ashish.mahenia@gmail.com', true, 'WORKBOOK', 'T8-403', 'T8', 8, '4', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":283,"OWNER NAME":"ASHISH KUMAR","TOWER-\nFLATNO.":"T8-403","CONTACT DETAILS":7889195282,"EMAIL ID":"ashish.mahenia@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1675,"RATE":3.25}'),
    (285, 284, 'f30e3683-5545-50a4-b1cf-c27915911e61', 'owner-email:7harnek7@gmail.com', 'JOGINDER PAL SINGH / HARNEK SINGH', '+919779996670', '9779996670', '7harnek7@gmail.com', '7harnek7@gmail.com', true, 'WORKBOOK', 'T8-404', 'T8', 8, '4', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":284,"OWNER NAME":"JOGINDER PAL SINGH\nHARNEK SINGH","TOWER-\nFLATNO.":"T8-404","CONTACT DETAILS":9779996670,"EMAIL ID":"7harnek7@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (286, 285, '516c6ac7-98e3-5716-8672-62d8dd32e6bd', 'owner-email:sabysood@icloud.com', 'KANIKA SOOD', '+918894385122', '8894385122; 8627889627', 'sabysood@icloud.com', 'sabysood@icloud.com', true, 'WORKBOOK', 'T8-501', 'T8', 8, '5', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":285,"OWNER NAME":"KANIKA SOOD","TOWER-\nFLATNO.":"T8-501","CONTACT DETAILS":"8894385122\n8627889627","EMAIL ID":"sabysood@icloud.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1675,"RATE":3.25}'),
    (287, 286, '0450ea1c-7554-5da2-947b-e414eabbba57', 'owner-email:vandeepsaini@yahoo.com', 'CHETNA SAINI / VANDEEP SAINI', '+918288083488', '8288083488; 9319100004', 'vandeepsaini@yahoo.com', 'vandeepsaini@yahoo.com', true, 'WORKBOOK', 'T8-502', 'T8', 8, '5', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'KEWAL SINGH; BALJINDER KAUR; TEJINDER SINGH;', '{"S.No":286,"OWNER NAME":"CHETNA SAINI\nVANDEEP SAINI","TOWER-\nFLATNO.":"T8-502","CONTACT DETAILS":"8288083488\n9319100004","EMAIL ID":"vandeepsaini@yahoo.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"KEWAL SINGH; BALJINDER KAUR; TEJINDER SINGH;","AREA":1675,"RATE":3.25}'),
    (288, 287, '9cea4187-776f-5c0f-915a-f6d84fae5c89', 'owner-profile:harjinder.singh.amanpreet.singh:+918427800377', 'HARJINDER SINGH / AMANPREET SINGH', '+918427800377', '8427800377; 9501900672', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-503', 'T8', 8, '5', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'GURPREET SINGH; SONIA SINGH; BRISHEEN KAUR', '{"S.No":287,"OWNER NAME":"HARJINDER SINGH\nAMANPREET SINGH","TOWER-\nFLATNO.":"T8-503","CONTACT DETAILS":"8427800377\n9501900672","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"GURPREET SINGH; SONIA SINGH; BRISHEEN KAUR","AREA":1675,"RATE":3.25}'),
    (289, 288, '75363780-c827-5d78-908e-dec67be2195d', 'owner-email:robinsarma828@gmail.com', 'ROBIN SHARMA / SURINDER PAL KAUR', '+917042527166', '7042527166', 'robinsarma828@gmail.com', 'robinsarma828@gmail.com', true, 'WORKBOOK', 'T8-504', 'T8', 8, '5', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":288,"OWNER NAME":"ROBIN SHARMA\nSURINDER PAL KAUR","TOWER-\nFLATNO.":"T8-504","CONTACT DETAILS":7042527166,"EMAIL ID":"robinsarma828@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (290, 289, '68046093-24e9-52ed-93a3-1cfca53b6726', 'owner-email:gurdit.sing1990@gmail.com', 'GURDIT SINGH / PRABHJOT KAUR', '+919417788045', '9417788045', 'gurdit.sing1990@gmail.com', 'gurdit.sing1990@gmail.com', true, 'WORKBOOK', 'T8-601', 'T8', 8, '6', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":289,"OWNER NAME":"GURDIT SINGH\nPRABHJOT KAUR","TOWER-\nFLATNO.":"T8-601","CONTACT DETAILS":9417788045,"EMAIL ID":"gurdit.sing1990@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (291, 290, 'cec51986-a5fb-5bb9-8786-3f186ab9fe4c', 'owner-email:indernagra89@gmail.com', 'INDERJEET SINGH NAGRA', '+919780388477', '9780388477; 9878319555', 'indernagra89@gmail.com', 'indernagra89@gmail.com', true, 'WORKBOOK', 'T8-602', 'T8', 8, '6', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; INDERJEET SINGH NAGRA; SANYAM; HARMEET SINGH;', '{"S.No":290,"OWNER NAME":"INDERJEET SINGH NAGRA","TOWER-\nFLATNO.":"T8-602","CONTACT DETAILS":"9780388477\n9878319555","EMAIL ID":"indernagra89@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; INDERJEET SINGH NAGRA; SANYAM; HARMEET SINGH;","AREA":1675,"RATE":3.25}'),
    (292, 291, 'e6c31cfb-8b5a-5486-9b38-5abcfa71d747', 'owner-profile:kuldeep.singh.bhatia.charanjeet.kaur.bhatia:+919811056693', 'KULDEEP SINGH BHATIA / CHARANJEET KAUR BHATIA', '+919811056693', '9811056693; 9507000003; 8968653955', 'kuldeep.singh.prince44@gmail.com; gurjeetbrar678@gmail.com; harbinderrsinghbhullar@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-603', 'T8', 8, '6', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-AIR BNB', '{"S.No":291,"OWNER NAME":"KULDEEP SINGH BHATIA\nCHARANJEET KAUR BHATIA","TOWER-\nFLATNO.":"T8-603","CONTACT DETAILS":"9811056693\n9507000003\n8968653955","EMAIL ID":"kuldeep.singh.prince44@gmail.com\ngurjeetbrar678@gmail.com\nharbinderrsinghbhullar@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-AIR BNB","AREA":1675,"RATE":3.25}'),
    (293, 292, '7bdcf2e0-560a-56c2-a10f-d59d5d0c6451', 'owner-email:amitgrover15@gmail.com', 'AMIT GROVER / TEENA GROVER', '+918872131772', '8872131772; 9216212082; 6280108633', 'amitgrover15@gmail.com', 'amitgrover15@gmail.com', true, 'WORKBOOK', 'T8-604', 'T8', 8, '6', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":292,"OWNER NAME":"AMIT GROVER\nTEENA GROVER","TOWER-\nFLATNO.":"T8-604","CONTACT DETAILS":"8872131772\n9216212082\n6280108633","EMAIL ID":"amitgrover15@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (294, 293, '5e26c774-bd79-5686-af89-299206dd0bff', 'owner-email:pankajjindal9999@gmail.com', 'JYOTI SINGLA / PANKAJ JINDAL', '+918360739930', '8360739930', 'pankajjindal9999@gmail.com', 'pankajjindal9999@gmail.com', true, 'WORKBOOK', 'T8-701', 'T8', 8, '7', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'NISHA BHATT;', '{"S.No":293,"OWNER NAME":"JYOTI SINGLA\nPANKAJ JINDAL","TOWER-\nFLATNO.":"T8-701","CONTACT DETAILS":8360739930,"EMAIL ID":"pankajjindal9999@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"NISHA BHATT;","AREA":1675,"RATE":3.25}'),
    (295, 294, '7769a7d1-db01-52bf-9799-fc119fc2930f', 'owner-profile:gaurav.mengi:+919419117418', 'GAURAV MENGI', '+919419117418', '9419117418', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-702', 'T8', 8, '7', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":294,"OWNER NAME":"GAURAV MENGI","TOWER-\nFLATNO.":"T8-702","CONTACT DETAILS":9419117418,"EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (296, 295, '67beeff5-6e97-5795-80f5-dfb91f807b7c', 'owner-profile:anshul.thakur.dharmender.singh.thakur:+918909400006', 'ANSHUL THAKUR / DHARMENDER SINGH THAKUR', '+918909400006', '8909400006; 9816073162', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T8-703', 'T8', 8, '7', '1675 SQFT', 1675.00, 3.25, 'TENANT', 'TENANTED', 'PARAMJEET SINGH; SUKHWINDER SINGH; RAKHIL SHARMA; INDRAJ SURYA;', '{"S.No":295,"OWNER NAME":"ANSHUL THAKUR\nDHARMENDER SINGH THAKUR","TOWER-\nFLATNO.":"T8-703","CONTACT DETAILS":"8909400006\n9816073162","EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PARAMJEET SINGH; SUKHWINDER SINGH; RAKHIL SHARMA; INDRAJ SURYA;","AREA":1675,"RATE":3.25}'),
    (297, 296, '96d558ab-90a6-5df3-bdda-3b43b225a2a4', 'owner-email:vidhi_passi@hotmail.com', 'VIDHI PASSI / SARITA PASSI', '+919872961614', '9872961614; 9888345866', 'vidhi_passi@hotmail.com', 'vidhi_passi@hotmail.com', true, 'WORKBOOK', 'T8-704', 'T8', 8, '7', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":296,"OWNER NAME":"VIDHI PASSI\nSARITA PASSI","TOWER-\nFLATNO.":"T8-704","CONTACT DETAILS":"9872961614\n9888345866","EMAIL ID":"vidhi_passi@hotmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (298, 297, 'f8e7bcd6-91ac-5597-bb0a-b1ec3b49124e', 'owner-email:ppshergill@gmail.com', 'PARVINDER KAUR SHERGILL', '+918108861000', '8108861000; 9815688042', 'ppshergill@gmail.com', 'ppshergill@gmail.com', true, 'WORKBOOK', 'T8-801', 'T8', 8, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":297,"OWNER NAME":"PARVINDER KAUR SHERGILL","TOWER-\nFLATNO.":"T8-801","CONTACT DETAILS":"8108861000\n9815688042","EMAIL ID":"ppshergill@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (299, 298, '8ed37749-a5a9-5a33-8fea-eaf13844fd94', 'owner-email:sonygrewal411@gmail.com', 'NIRMAL SINGH GREWAL', '+919812400333', '9812400333; 7304800007', 'sonygrewal411@gmail.com', 'sonygrewal411@gmail.com', true, 'WORKBOOK', 'T8-802', 'T8', 8, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":298,"OWNER NAME":"NIRMAL SINGH GREWAL","TOWER-\nFLATNO.":"T8-802","CONTACT DETAILS":"9812400333\n7304800007","EMAIL ID":"sonygrewal411@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (300, 299, '67db86b2-412e-5417-88d3-fcf0a80bb0cd', 'owner-email:duggalbalpreet151@gmail.com', 'RIMPAL KAUR', '+919710614000', '9710614000; 9501199329; 9700029955', 'duggalbalpreet151@gmail.com; rsodhi088@gmail.com', 'duggalbalpreet151@gmail.com', true, 'WORKBOOK', 'T8-803', 'T8', 8, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":299,"OWNER NAME":"RIMPAL KAUR","TOWER-\nFLATNO.":"T8-803","CONTACT DETAILS":"9710614000\n9501199329\n9700029955","EMAIL ID":"duggalbalpreet151@gmail.com\nrsodhi088@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (301, 300, '25b84d5f-683a-57dc-80f5-bc74f927330f', 'owner-email:oberio.harjit62@gmail.com', 'LT. CDR. MANREEP SINGH OBEROI', '+919914019246', '9914019246', 'oberio.harjit62@gmail.com', 'oberio.harjit62@gmail.com', true, 'WORKBOOK', 'T8-804', 'T8', 8, '8', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":300,"OWNER NAME":"LT. CDR. MANREEP SINGH OBEROI","TOWER-\nFLATNO.":"T8-804","CONTACT DETAILS":9914019246,"EMAIL ID":"oberio.harjit62@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (302, 301, '2e2bf072-3292-5b77-85bf-8375a0b17b58', 'owner-email:jashanmundi02@gmail.com', 'MANPREET SINGH KANG', '+917076000001', '7076000001', 'jashanmundi02@gmail.com', 'jashanmundi02@gmail.com', true, 'WORKBOOK', 'T8-901', 'T8', 8, '9', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":301,"OWNER NAME":"MANPREET SINGH KANG","TOWER-\nFLATNO.":"T8-901","CONTACT DETAILS":7076000001,"EMAIL ID":"jashanmundi02@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (303, 302, '2e2bf072-3292-5b77-85bf-8375a0b17b58', 'owner-email:jashanmundi02@gmail.com', 'MANPREET SINGH KANG', '+917076000001', '7076000001', 'jashanmundi02@gmail.com', 'jashanmundi02@gmail.com', true, 'WORKBOOK', 'T8-902', 'T8', 8, '9', '1675 SQFT', 1675.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":302,"OWNER NAME":"MANPREET SINGH KANG","TOWER-\nFLATNO.":"T8-902","CONTACT DETAILS":7076000001,"EMAIL ID":"jashanmundi02@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1675,"RATE":3.25}'),
    (304, 303, '9cb2d53a-7fb2-523c-a945-1a54808a3a3f', 'owner-email:nviichhaniwala@gmail.com', 'NAVEEN', '+919649561322', '9649561322; 9255509999', 'nviichhaniwala@gmail.com', 'nviichhaniwala@gmail.com', true, 'WORKBOOK', 'T9-101', 'T9', 9, '1', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; NAVEEN; KAPIL; AMAN;', '{"S.No":303,"OWNER NAME":"NAVEEN","TOWER-\nFLATNO.":"T9-101","CONTACT DETAILS":"9649561322\n9255509999","EMAIL ID":"nviichhaniwala@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; NAVEEN; KAPIL; AMAN;","AREA":1985,"RATE":3.25}'),
    (305, 304, '3275b247-840b-5d66-9d6e-8aff6c4e5c99', 'owner-profile:anuj.guglani:+919418114001', 'ANUJ GUGLANI', '+919418114001', '9418114001', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T9-102', 'T9', 9, '1', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'SRISHTY;', '{"S.No":304,"OWNER NAME":"ANUJ GUGLANI","TOWER-\nFLATNO.":"T9-102","CONTACT DETAILS":9418114001,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SRISHTY;","AREA":1985,"RATE":3.25}'),
    (306, 305, '0764e735-a4d8-5732-81cc-372ebd110d86', 'owner-profile:manik.rawal:+919837037606', 'MANIK RAWAL', '+919837037606', '9837037606', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T9-201', 'T9', 9, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":305,"OWNER NAME":"MANIK RAWAL","TOWER-\nFLATNO.":"T9-201","CONTACT DETAILS":9837037606,"EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1985,"RATE":3.25}'),
    (307, 306, 'a81cf7c6-b6b4-5853-89c0-0e4496bb9d8f', 'owner-email:vishu.droid92@gmail.com', 'VISHAVRAJ MUNJAL / PARAMJIT', '+917206293553', '7206293553; 7206293552', 'vishu.droid92@gmail.com; mohit.munjal1988@gmail.com', 'vishu.droid92@gmail.com', true, 'WORKBOOK', 'T9-202', 'T9', 9, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":306,"OWNER NAME":"VISHAVRAJ MUNJAL\nPARAMJIT","TOWER-\nFLATNO.":"T9-202","CONTACT DETAILS":"7206293553\n7206293552","EMAIL ID":"vishu.droid92@gmail.com\nmohit.munjal1988@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (308, 307, '868f2c6a-bba9-5cf1-83f9-f54f9b8769de', 'owner-email:ankitsony@gmail.com', 'NEELAM SONI / SONAL BHASEEN / ANKIT SONI', '+919501067575', '9501067575', 'ankitsony@gmail.com', 'ankitsony@gmail.com', true, 'WORKBOOK', 'T9-301', 'T9', 9, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":307,"OWNER NAME":"NEELAM SONI\nSONAL BHASEEN\nANKIT SONI","TOWER-\nFLATNO.":"T9-301","CONTACT DETAILS":9501067575,"EMAIL ID":"ankitsony@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (309, 308, 'c2a945e7-65d3-5c8b-a4e9-0bc6969e23da', 'owner-profile:nonika.pun:+918288981568', 'NONIKA PUN', '+918288981568', '8288981568', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T9-302', 'T9', 9, '3', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'JASPAL SINGH;', '{"S.No":308,"OWNER NAME":"NONIKA PUN","TOWER-\nFLATNO.":"T9-302","CONTACT DETAILS":8288981568,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"JASPAL SINGH;","AREA":1985,"RATE":3.25}'),
    (310, 309, '24d58ac2-27ce-5611-a41c-989e3cf48d8a', 'owner-email:rachna.bansal62@gmail.com', 'RACHNA BANSAL / RAJESH BANSAL', '+919855285080', '9855285080; 9814532080', 'rachna.bansal62@gmail.com', 'rachna.bansal62@gmail.com', true, 'WORKBOOK', 'T9-401', 'T9', 9, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; RAHUL BANSAL (S)', '{"S.No":309,"OWNER NAME":"RACHNA BANSAL\nRAJESH BANSAL","TOWER-\nFLATNO.":"T9-401","CONTACT DETAILS":"9855285080\n9814532080","EMAIL ID":"rachna.bansal62@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; RAHUL BANSAL (S)","AREA":1985,"RATE":3.25}'),
    (311, 310, 'acfc9d00-9561-5d9e-9f92-66a392878089', 'owner-email:hs14059@gmail.com', 'AJIT KAUR / GUNPREET KAUR / HARBHAJAN SINGH', '+919501002483', '9501002483', 'hs14059@gmail.com', 'hs14059@gmail.com', true, 'WORKBOOK', 'T9-402', 'T9', 9, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":310,"OWNER NAME":"AJIT KAUR\nGUNPREET KAUR\nHARBHAJAN SINGH","TOWER-\nFLATNO.":"T9-402","CONTACT DETAILS":9501002483,"EMAIL ID":"hs14059@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1985,"RATE":3.25}'),
    (312, 311, 'bb3a0b6e-0300-5c98-8bf6-a8c9c5651947', 'owner-email:sharansarang16@gmail.com', 'AMANPREET SINGH', '+919958319138', '9958319138', 'sharansarang16@gmail.com', 'sharansarang16@gmail.com', true, 'WORKBOOK', 'T9-501', 'T9', 9, '5', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":311,"OWNER NAME":"AMANPREET SINGH","TOWER-\nFLATNO.":"T9-501","CONTACT DETAILS":9958319138,"EMAIL ID":"sharansarang16@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (313, 312, '6b9665d9-225f-59e5-a496-9e18e591529f', 'owner-email:ysingla78@gmail.com', 'YOGESH SINGLA', '+919781710233', '9781710233', 'ysingla78@gmail.com', 'ysingla78@gmail.com', true, 'WORKBOOK', 'T9-502', 'T9', 9, '5', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":312,"OWNER NAME":"YOGESH SINGLA","TOWER-\nFLATNO.":"T9-502","CONTACT DETAILS":9781710233,"EMAIL ID":"ysingla78@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (314, 313, 'f996a51f-6cfc-5937-aba7-6ba67da57d84', 'owner-email:jhrsingh4@gmail.com', 'JAGPREET SINGH', '+918269962000', '8269962000', 'jhrsingh4@gmail.com', 'jhrsingh4@gmail.com', true, 'WORKBOOK', 'T9-601', 'T9', 9, '6', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":313,"OWNER NAME":"JAGPREET SINGH","TOWER-\nFLATNO.":"T9-601","CONTACT DETAILS":8269962000,"EMAIL ID":"jhrsingh4@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (315, 314, 'b4051279-4545-5ab2-8b2f-3006e5ded974', 'owner-email:anmolpreet_singh@yahoo.com', 'SUVINDERPAL SINGH / ANMOLPREET SINGH', '+919855544769', '9855544769', 'anmolpreet_singh@yahoo.com', 'anmolpreet_singh@yahoo.com', true, 'WORKBOOK', 'T9-602', 'T9', 9, '6', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":314,"OWNER NAME":"SUVINDERPAL SINGH\nANMOLPREET SINGH","TOWER-\nFLATNO.":"T9-602","CONTACT DETAILS":9855544769,"EMAIL ID":"anmolpreet_singh@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (316, 315, 'e6c31cfb-8b5a-5486-9b38-5abcfa71d747', 'owner-profile:kuldeep.singh.bhatia.charanjeet.kaur.bhatia:+919811056693', 'KULDEEP SINGH BHATIA / CHARANJEET KAUR BHATIA', '+919811056693', '9811056693; 9507000003; 8968653955', 'kuldeep.singh.prince44@gmail.com; gurjeetbrar678@gmail.com; harbinderrsinghbhullar@gmail.com', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T9-701', 'T9', 9, '7', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'FATEHKARAN SINGH BAJWA', '{"S.No":315,"OWNER NAME":"KULDEEP SINGH BHATIA \nCHARANJEET KAUR BHATIA","TOWER-\nFLATNO.":"T9-701","CONTACT DETAILS":"9811056693\n9507000003\n8968653955","EMAIL ID":"kuldeep.singh.prince44@gmail.com\ngurjeetbrar678@gmail.com\nharbinderrsinghbhullar@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"FATEHKARAN SINGH BAJWA","AREA":1985,"RATE":3.25}'),
    (317, 316, '98c6ecd4-09ef-508f-b35e-130143075327', 'owner-email:sidhu3017@gmail.com', 'JAGDEEP SINGH', '+919167348132', '9167348132; 7208739196', 'sidhu3017@gmail.com', 'sidhu3017@gmail.com', true, 'WORKBOOK', 'T9-702', 'T9', 9, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":316,"OWNER NAME":"JAGDEEP SINGH","TOWER-\nFLATNO.":"T9-702","CONTACT DETAILS":"9167348132\n7208739196","EMAIL ID":"sidhu3017@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1985,"RATE":3.25}'),
    (318, 317, 'e88aba61-daf2-5bf2-922b-442cafb72899', 'owner-email:gsminhas49@icloud.com', 'SURINDER KAUR MINHAS / GURNAM SINGH MINHAS', '+919814272584', '9814272584', 'gsminhas49@icloud.com', 'gsminhas49@icloud.com', true, 'WORKBOOK', 'T10-101', 'T10', 10, '1', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'HARMANPREET; ARCHANA;', '{"S.No":317,"OWNER NAME":"SURINDER KAUR MINHAS\nGURNAM SINGH MINHAS","TOWER-\nFLATNO.":"T10-101","CONTACT DETAILS":9814272584,"EMAIL ID":"gsminhas49@icloud.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HARMANPREET; ARCHANA;","AREA":1985,"RATE":3.25}'),
    (319, 318, '844b8937-7c79-5c3f-9302-d506bf0d8a53', 'owner-email:kavita7chauhan@gmail.com', 'KAVITA CHAUHAN / SUKHPREET SINGH CHAUHAN', '+919855148515', '9855148515; 9779278192', 'kavita7chauhan@gmail.com', 'kavita7chauhan@gmail.com', true, 'WORKBOOK', 'T10-102', 'T10', 10, '1', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":318,"OWNER NAME":"KAVITA CHAUHAN\nSUKHPREET SINGH CHAUHAN","TOWER-\nFLATNO.":"T10-102","CONTACT DETAILS":"9855148515\n9779278192","EMAIL ID":"kavita7chauhan@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (320, 319, '9799a54a-abdb-56cd-a8d2-aef06c4759ac', 'owner-email:manindersidhu1522@yahoo.com', 'GURINDER PAL SINGH BRAR / MANINDER KAUR', '+919815669941', '9815669941; 7310000004', 'manindersidhu1522@yahoo.com; frozensidhu1522@gmail.com', 'manindersidhu1522@yahoo.com', true, 'WORKBOOK', 'T10-201', 'T10', 10, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":319,"OWNER NAME":"GURINDER PAL SINGH BRAR\nMANINDER KAUR","TOWER-\nFLATNO.":"T10-201","CONTACT DETAILS":"9815669941\n7310000004","EMAIL ID":"manindersidhu1522@yahoo.com\nfrozensidhu1522@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (321, 320, '844b8937-7c79-5c3f-9302-d506bf0d8a53', 'owner-email:kavita7chauhan@gmail.com', 'KAVITA CHAUHAN / SUKHPREET SINGH CHAUHAN', '+919855148515', '9855148515; 9779278192', 'kavita7chauhan@gmail.com', 'kavita7chauhan@gmail.com', true, 'WORKBOOK', 'T10-202', 'T10', 10, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":320,"OWNER NAME":"KAVITA CHAUHAN\nSUKHPREET SINGH CHAUHAN","TOWER-\nFLATNO.":"T10-202","CONTACT DETAILS":"9855148515\n9779278192","EMAIL ID":"kavita7chauhan@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (322, 321, '64170227-4252-577c-b2ef-463cebe25d02', 'owner-email:baljitkhalsalovy@gmail.com', 'BALJEET SINGH / RANDEEP KAUR', '+917607848484', '7607848484', 'BaljitKhalsalovy@gmail.com', 'baljitkhalsalovy@gmail.com', true, 'WORKBOOK', 'T10-301', 'T10', 10, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":321,"OWNER NAME":"BALJEET SINGH\nRANDEEP KAUR","TOWER-\nFLATNO.":"T10-301","CONTACT DETAILS":7607848484,"EMAIL ID":"BaljitKhalsalovy@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (323, 322, 'c1ab42ee-2fce-5793-b094-36124b564a8e', 'owner-email:kainat.ind@gmail.com', 'KAINAT RIZWAN / SANIA RIZWAN', '+919915076920', '9915076920; 9988002989', 'kainat.ind@gmail.com', 'kainat.ind@gmail.com', true, 'WORKBOOK', 'T10-302', 'T10', 10, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":322,"OWNER NAME":"KAINAT RIZWAN\nSANIA RIZWAN","TOWER-\nFLATNO.":"T10-302","CONTACT DETAILS":"9915076920\n9988002989","EMAIL ID":"kainat.ind@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (324, 323, '35e6ddfb-5199-5ce2-8acf-940c77cd8b8c', 'owner-email:rpreet041@gmail.com', 'SATNAM KAUR', '+919965500043', '9965500043', 'rpreet041@gmail.com', 'rpreet041@gmail.com', true, 'WORKBOOK', 'T10-401', 'T10', 10, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":323,"OWNER NAME":"SATNAM KAUR","TOWER-\nFLATNO.":"T10-401","CONTACT DETAILS":9965500043,"EMAIL ID":"rpreet041@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (325, 324, '53aa9bba-862e-5855-a1dd-093b119bb9d8', 'owner-email:mohanthandhi@hotmail.com', 'REEMA KAUR THANDI', '+919820805496', '9820805496', 'mohanthandhi@hotmail.com', 'mohanthandhi@hotmail.com', true, 'WORKBOOK', 'T10-402', 'T10', 10, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":324,"OWNER NAME":"REEMA KAUR THANDI","TOWER-\nFLATNO.":"T10-402","CONTACT DETAILS":9820805496,"EMAIL ID":"mohanthandhi@hotmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1985,"RATE":3.25}'),
    (326, 325, '9721233b-083b-52ee-9c6d-4bf49df190a8', 'owner-email:geetesh92sharma@gmail.com', 'PRIYANKA JINDAL / GEETESH SHARMA', '+917601000069', '7601000069', 'geetesh92sharma@gmail.com', 'geetesh92sharma@gmail.com', true, 'WORKBOOK', 'T10-501', 'T10', 10, '5', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":325,"OWNER NAME":"PRIYANKA JINDAL\nGEETESH SHARMA","TOWER-\nFLATNO.":"T10-501","CONTACT DETAILS":7601000069,"EMAIL ID":"geetesh92sharma@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (327, 326, '92f14624-377b-56e7-85aa-a90ba35043ac', 'owner-email:newshopindia@gmail.com', 'ARCHIT NANDA / AJAY NANDA', '+918288990281', '8288990281', 'newshopindia@gmail.com', 'newshopindia@gmail.com', true, 'WORKBOOK', 'T10-502', 'T10', 10, '5', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'ARMAN GILHOTRA; UPASNA SHARMA;', '{"S.No":326,"OWNER NAME":"ARCHIT NANDA\nAJAY NANDA","TOWER-\nFLATNO.":"T10-502","CONTACT DETAILS":8288990281,"EMAIL ID":"newshopindia@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"ARMAN GILHOTRA; UPASNA SHARMA;","AREA":1985,"RATE":3.25}'),
    (328, 327, '75199937-f276-571b-a1b3-694b7921860b', 'owner-email:gurdeepbajli@gmail.com', 'GURJEET SINGH', '+917601000002', '7601000002', 'gurdeepbajli@gmail.com', 'gurdeepbajli@gmail.com', true, 'WORKBOOK', 'T10-601', 'T10', 10, '6', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":327,"OWNER NAME":"GURJEET SINGH","TOWER-\nFLATNO.":"T10-601","CONTACT DETAILS":7601000002,"EMAIL ID":"gurdeepbajli@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (329, 328, '8f7828fb-d2af-506b-be6c-ebfefbf0a1fb', 'owner-email:deepakoly@yahoo.com', 'DIDAR ALI', '+919872586539', '9872586539', 'deepakoly@yahoo.com', 'deepakoly@yahoo.com', true, 'WORKBOOK', 'T10-602', 'T10', 10, '6', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":328,"OWNER NAME":"DIDAR ALI","TOWER-\nFLATNO.":"T10-602","CONTACT DETAILS":9872586539,"EMAIL ID":"deepakoly@yahoo.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (330, 329, '68ce4eed-45a5-5a73-8a56-7790d2373a60', 'owner-email:amarveer1431@gmail.com', 'AMARVIR KAUR / HUSTINDER SINGH', '+919876658301', '9876658301; 9878940302', 'amarveer1431@gmail.com', 'amarveer1431@gmail.com', true, 'WORKBOOK', 'T10-701', 'T10', 10, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":329,"OWNER NAME":"AMARVIR KAUR\nHUSTINDER SINGH","TOWER-\nFLATNO.":"T10-701","CONTACT DETAILS":"9876658301\n9878940302","EMAIL ID":"amarveer1431@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (331, 330, '242649b8-78c2-532d-b8a6-6204bfc62373', 'owner-email:pd02188@hotmail.com', 'PARMINDER SINGH DHILLON', '+919646506465', '9646506465; 9876725214', 'pd02188@hotmail.com', 'pd02188@hotmail.com', true, 'WORKBOOK', 'T10-702', 'T10', 10, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED-ABROAD-VISITS OCCASIONALLY', '{"S.No":330,"OWNER NAME":"PARMINDER SINGH DHILLON","TOWER-\nFLATNO.":"T10-702","CONTACT DETAILS":"9646506465 \n9876725214","EMAIL ID":"pd02188@hotmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED-ABROAD-VISITS OCCASIONALLY","AREA":1985,"RATE":3.25}'),
    (332, 331, '412523f7-9d26-5c9a-8857-a1134841835d', 'owner-email:vedant.singla@icloud.com', 'SAROJ BALA / VEDANT SINGLA', '+918699888882', '8699888882', 'vedant.singla@icloud.com', 'vedant.singla@icloud.com', true, 'WORKBOOK', 'T11-101', 'T11', 11, '1', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":331,"OWNER NAME":"SAROJ BALA\nVEDANT SINGLA","TOWER-\nFLATNO.":"T11-101","CONTACT DETAILS":8699888882,"EMAIL ID":"vedant.singla@icloud.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (333, 332, 'c91ceb43-8dff-5790-8003-db8ff45116bc', 'owner-email:ashusingh0@gmail.com', 'ASHUTOSH SINGH / NEHA SINGH', '+917834826105', '7834826105', 'ashusingh0@gmail.com', 'ashusingh0@gmail.com', true, 'WORKBOOK', 'T11-102', 'T11', 11, '1', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'PRANJAL; SAJAL CHAUHAN ; NEHA;', '{"S.No":332,"OWNER NAME":"ASHUTOSH SINGH\nNEHA SINGH","TOWER-\nFLATNO.":"T11-102","CONTACT DETAILS":7834826105,"EMAIL ID":"ashusingh0@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PRANJAL; SAJAL CHAUHAN ; NEHA;","AREA":1985,"RATE":3.25}'),
    (334, 333, '8fa76e2e-bd63-5732-9234-90b0784047b5', 'owner-email:jotsidhu7239@gmail.com', 'NAVJOT SINGH', '+61452335900', '+61452335900', 'jotsidhu7239@gmail.com', 'jotsidhu7239@gmail.com', true, 'WORKBOOK', 'T11-201', 'T11', 11, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":333,"OWNER NAME":"NAVJOT SINGH","TOWER-\nFLATNO.":"T11-201","CONTACT DETAILS":"+61452335900","EMAIL ID":"jotsidhu7239@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (335, 334, 'ba497327-aa27-5af5-88d9-6c42ed1d3e5c', 'owner-email:chugh.raghav7@gmail.com', 'HITESHWAR BHATTAL / NEELU BHATTAL', '+919855576539', '9855576539; 9814694595', 'chugh.raghav7@gmail.com', 'chugh.raghav7@gmail.com', true, 'WORKBOOK', 'T11-202', 'T11', 11, '2', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'RAGHAV CHUGH (CA); SHIVAM SINGH;', '{"S.No":334,"OWNER NAME":"HITESHWAR BHATTAL\nNEELU BHATTAL","TOWER-\nFLATNO.":"T11-202","CONTACT DETAILS":"9855576539\n9814694595","EMAIL ID":"chugh.raghav7@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"RAGHAV CHUGH (CA); SHIVAM SINGH;","AREA":1985,"RATE":3.25}'),
    (336, 335, 'd3d86cf3-78c0-5557-b3f8-5eb3e2da86fc', 'owner-email:onkarsinghmalhi1@gmail.com', 'ONKAR SINGH', '+919569430446', '9569430446', 'onkarsinghmalhi1@gmail.com', 'onkarsinghmalhi1@gmail.com', true, 'WORKBOOK', 'T11-301', 'T11', 11, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED; ONKAR SINGH; SONALI SINGH; MANPREET SINGH;', '{"S.No":335,"OWNER NAME":"ONKAR SINGH","TOWER-\nFLATNO.":"T11-301","CONTACT DETAILS":9569430446,"EMAIL ID":"onkarsinghmalhi1@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED; ONKAR SINGH; SONALI SINGH; MANPREET SINGH;","AREA":1985,"RATE":3.25}'),
    (337, 336, '63c8ff9f-acbb-5929-904e-3498d498a182', 'owner-email:abhishek55kumar.singh@gmail.com', 'ABHISHEK KUMAR SINGH', '+919412359350', '9412359350', 'abhishek55kumar.singh@gmail.com', 'abhishek55kumar.singh@gmail.com', true, 'WORKBOOK', 'T11-302', 'T11', 11, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":336,"OWNER NAME":"ABHISHEK KUMAR SINGH","TOWER-\nFLATNO.":"T11-302","CONTACT DETAILS":9412359350,"EMAIL ID":"abhishek55kumar.singh@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (338, 337, '88c1b744-7750-5437-8812-6f251e8fd00e', 'owner-email:pepe.singh.pepe@gmail.com', 'GURPREET SINGH BHANDARI', '+919811101397', '9811101397', 'pepe.singh.pepe@gmail.com', 'pepe.singh.pepe@gmail.com', true, 'WORKBOOK', 'T11-401', 'T11', 11, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":337,"OWNER NAME":"GURPREET SINGH BHANDARI","TOWER-\nFLATNO.":"T11-401","CONTACT DETAILS":9811101397,"EMAIL ID":"pepe.singh.pepe@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (339, 338, '9c01a747-3529-5743-90b0-4633ce0f454a', 'owner-email:harvinder.mundi888@gmail.con', 'HARVINDER SINGH', '+919729467140', '9729467140', 'harvinder.mundi888@gmail.con', 'harvinder.mundi888@gmail.con', true, 'WORKBOOK', 'T11-402', 'T11', 11, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":338,"OWNER NAME":"HARVINDER SINGH","TOWER-\nFLATNO.":"T11-402","CONTACT DETAILS":9729467140,"EMAIL ID":"harvinder.mundi888@gmail.con","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (340, 339, '4c4937ac-6aeb-5058-80c8-0a8ec45bf081', 'owner-email:karangaba10@gmail.com', 'KARAN GABA', '+918930034555', '8930034555', 'karangaba10@gmail.com', 'karangaba10@gmail.com', true, 'WORKBOOK', 'T11-501', 'T11', 11, '5', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":339,"OWNER NAME":"KARAN GABA","TOWER-\nFLATNO.":"T11-501","CONTACT DETAILS":8930034555,"EMAIL ID":"karangaba10@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (341, 340, '1ab231e0-79f2-5f55-8059-9284084881bc', 'owner-email:jassigill218@gmail.com', 'JASMITA SEKHON / NISHAN SINGH SEKHON / MAHAN SINGH SEKHON', '+919903177713', '9903177713; 9874412590; 9717024402', 'jassigill218@gmail.com; nishansinghsekhon@gmail.com', 'jassigill218@gmail.com', true, 'WORKBOOK', 'T11-502', 'T11', 11, '5', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'PARSHOTTAM PURI;', '{"S.No":340,"OWNER NAME":"JASMITA SEKHON\nNISHAN SINGH SEKHON\nMAHAN SINGH SEKHON","TOWER-\nFLATNO.":"T11-502","CONTACT DETAILS":"9903177713\n9874412590\n9717024402","EMAIL ID":"jassigill218@gmail.com\nnishansinghsekhon@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"PARSHOTTAM PURI;","AREA":1985,"RATE":3.25}'),
    (342, 341, '1a7033d4-43c5-514d-8077-2fbc389b4b53', 'owner-email:ramanbehl1980@gmail.com', 'RAMAN BEHAL', '+919876422340', '9876422340', 'ramanbehl1980@gmail.com', 'ramanbehl1980@gmail.com', true, 'WORKBOOK', 'T11-601', 'T11', 11, '6', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":341,"OWNER NAME":"RAMAN BEHAL","TOWER-\nFLATNO.":"T11-601","CONTACT DETAILS":9876422340,"EMAIL ID":"ramanbehl1980@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (343, 342, 'e48dc526-e008-522c-b4c1-ee1dd0cd91fd', 'owner-email:jaswalbipan@gmail.com', 'BIPAN RANI JASWAL', '+919779586318', '9779586318; 9872539344', 'jaswalbipan@gmail.com; dev23081963@gmail.com', 'jaswalbipan@gmail.com', true, 'WORKBOOK', 'T11-602', 'T11', 11, '6', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":342,"OWNER NAME":"BIPAN RANI JASWAL","TOWER-\nFLATNO.":"T11-602","CONTACT DETAILS":"9779586318\n9872539344","EMAIL ID":"jaswalbipan@gmail.com\ndev23081963@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (344, 343, '66d2e834-fc1b-5460-a84e-9e9248b44055', 'owner-email:khairafurnitures@gmail.com', 'ARVINDER SINGH KHAIRA', '+917009073820', '7009073820; 9888886140', 'khairafurnitures@gmail.com; chugh.raghav7@gmail.com', 'khairafurnitures@gmail.com', true, 'WORKBOOK', 'T11-701', 'T11', 11, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":343,"OWNER NAME":"ARVINDER SINGH KHAIRA","TOWER-\nFLATNO.":"T11-701","CONTACT DETAILS":"7009073820\n9888886140","EMAIL ID":"khairafurnitures@gmail.com\nchugh.raghav7@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (345, 344, '66d2e834-fc1b-5460-a84e-9e9248b44055', 'owner-email:khairafurnitures@gmail.com', 'ARVINDER SINGH KHAIRA', '+917009073820', '7009073820; 9888886140', 'khairafurnitures@gmail.com; chugh.raghav7@gmail.com', 'khairafurnitures@gmail.com', true, 'WORKBOOK', 'T11-702', 'T11', 11, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":344,"OWNER NAME":"ARVINDER SINGH KHAIRA","TOWER-\nFLATNO.":"T11-702","CONTACT DETAILS":"7009073820\n9888886140","EMAIL ID":"khairafurnitures@gmail.com\nchugh.raghav7@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (346, 345, '7efc6c7a-5c59-5ab1-94d9-5d4b37357309', 'owner-profile:sangeeta.gupta.vasu.mahajan:+918803400000', 'SANGEETA GUPTA / VASU MAHAJAN', '+918803400000', '8803400000', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T12-101', 'T12', 12, '1', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'SAHIL CHOPRA;', '{"S.No":345,"OWNER NAME":"SANGEETA GUPTA\nVASU MAHAJAN","TOWER-\nFLATNO.":"T12-101","CONTACT DETAILS":8803400000,"EMAIL ID":"NA","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"SAHIL CHOPRA;","AREA":1985,"RATE":3.25}'),
    (347, 346, '902daf52-8d4e-59cf-ae3a-28373cd0f5f1', 'owner-profile:kanchan.chugh.aman.chugh:+919888032231', 'KANCHAN CHUGH / AMAN CHUGH', '+919888032231', '9888032231; 9888426262', 'NA', null, false, 'NOT_PROVIDED_OR_DUPLICATE', 'T12-102', 'T12', 12, '1', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'VACANT', 'VACANT', '{"S.No":346,"OWNER NAME":"KANCHAN CHUGH\nAMAN CHUGH","TOWER-\nFLATNO.":"T12-102","CONTACT DETAILS":"9888032231\n9888426262","EMAIL ID":"NA","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"VACANT","AREA":1985,"RATE":3.25}'),
    (348, 347, 'adc11d06-6989-5d21-a57f-b8fbfe0ac93d', 'owner-email:ikunal797@gmail.com', 'CHANDA ARORA / ANIL ARORA', '+919914815301', '9914815301; 9855399007', 'ikunal797@gmail.com', 'ikunal797@gmail.com', true, 'WORKBOOK', 'T12-201', 'T12', 12, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":347,"OWNER NAME":"CHANDA ARORA\nANIL ARORA","TOWER-\nFLATNO.":"T12-201","CONTACT DETAILS":"9914815301\n9855399007","EMAIL ID":"ikunal797@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (349, 348, 'e49dbead-313a-51c6-b279-c7fbc18be7c7', 'owner-email:fangs005@gmail.com', 'DR. DHRUV LAL', '+917589279979', '7589279979', 'fangs005@gmail.com', 'fangs005@gmail.com', true, 'WORKBOOK', 'T12-202', 'T12', 12, '2', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":348,"OWNER NAME":"DR. DHRUV LAL","TOWER-\nFLATNO.":"T12-202","CONTACT DETAILS":7589279979,"EMAIL ID":"fangs005@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (350, 349, '03b9aa1b-113a-5ece-a37d-337178bc6ee3', 'owner-email:arunsalhotragsp@gmail.com', 'ARUN KUMAR SALHOTRA', '+919779866378', '9779866378', 'arunsalhotragsp@gmail.com', 'arunsalhotragsp@gmail.com', true, 'WORKBOOK', 'T12-301', 'T12', 12, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":349,"OWNER NAME":"ARUN KUMAR SALHOTRA","TOWER-\nFLATNO.":"T12-301","CONTACT DETAILS":9779866378,"EMAIL ID":"arunsalhotragsp@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (351, 350, '032cece4-ae76-57ea-b00d-b0febf60430b', 'owner-email:gurjas.skillset@gmail.com', 'GURJAS KAUR BEDI', '+919899561178', '9899561178', 'gurjas.skillset@gmail.com', 'gurjas.skillset@gmail.com', true, 'WORKBOOK', 'T12-302', 'T12', 12, '3', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":350,"OWNER NAME":"GURJAS KAUR BEDI","TOWER-\nFLATNO.":"T12-302","CONTACT DETAILS":9899561178,"EMAIL ID":"gurjas.skillset@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (352, 351, 'be798dd9-a985-5faa-8735-f5838ebdcce7', 'owner-email:vanita.khichi01@gmail.com', 'VANITA KHICHI', '+919815278969', '9815278969', 'vanita.khichi01@gmail.com', 'vanita.khichi01@gmail.com', true, 'WORKBOOK', 'T12-401', 'T12', 12, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":351,"OWNER NAME":"VANITA KHICHI","TOWER-\nFLATNO.":"T12-401","CONTACT DETAILS":9815278969,"EMAIL ID":"vanita.khichi01@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (353, 352, '3641f7c2-b114-52bf-8bfd-51fe510da019', 'owner-email:docgaurav@gmail.com', 'DR. GAURAV GUPTA', '+919872303775', '9872303775', 'docgaurav@gmail.com', 'docgaurav@gmail.com', true, 'WORKBOOK', 'T12-402', 'T12', 12, '4', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":352,"OWNER NAME":"DR. GAURAV GUPTA","TOWER-\nFLATNO.":"T12-402","CONTACT DETAILS":9872303775,"EMAIL ID":"docgaurav@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (354, 353, '4bfdd6b3-9589-5b50-90d3-27ed7a291fa0', 'owner-email:hellonikku1@rediffmail.com', 'NIKHIL SACHDEVA', '+919988800880', '9988800880', 'hellonikku1@rediffmail.com', 'hellonikku1@rediffmail.com', true, 'WORKBOOK', 'T12-501', 'T12', 12, '5', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":353,"OWNER NAME":"NIKHIL SACHDEVA","TOWER-\nFLATNO.":"T12-501","CONTACT DETAILS":9988800880,"EMAIL ID":"hellonikku1@rediffmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (355, 354, '306f2039-2340-5cde-bce2-1992234c66a9', 'owner-email:harwinderkaur0808@gmail.com', 'HARWINDER KAUR / MANJIT SINGH', '+919855084182', '9855084182; 9814342126; 8847563485', 'harwinderkaur0808@gmail.com; rishiveerpratap@gmail.com', 'harwinderkaur0808@gmail.com', true, 'WORKBOOK', 'T12-502', 'T12', 12, '5', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'AVNEET BRAR GILL', '{"S.No":354,"OWNER NAME":"HARWINDER KAUR\nMANJIT SINGH","TOWER-\nFLATNO.":"T12-502","CONTACT DETAILS":"9855084182\n9814342126\n8847563485","EMAIL ID":"harwinderkaur0808@gmail.com\nrishiveerpratap@gmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"AVNEET BRAR GILL","AREA":1985,"RATE":3.25}'),
    (356, 355, '3b668abc-09f4-5241-b8cd-97fe653c6bc0', 'owner-email:nagra.anandita@hotmail.com', 'SIMRIT KAUR', '+919910305345', '9910305345; 9289690902', 'nagra.anandita@hotmail.com', 'nagra.anandita@hotmail.com', true, 'WORKBOOK', 'T12-601', 'T12', 12, '6', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'HARSH SHARMA; TARANBEER SINGH; SHIVANSH SHEKHAR; GURU MARKAN; NAVNEET YADAV;', '{"S.No":355,"OWNER NAME":"SIMRIT KAUR","TOWER-\nFLATNO.":"T12-601","CONTACT DETAILS":"9910305345\n9289690902","EMAIL ID":"nagra.anandita@hotmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"HARSH SHARMA; TARANBEER SINGH; SHIVANSH SHEKHAR; GURU MARKAN; NAVNEET YADAV;","AREA":1985,"RATE":3.25}'),
    (357, 356, '1c268c1d-859c-5753-9f56-a0b2964d854b', 'owner-email:neerajgour@hotmail.com', 'COL. NEERAJ GOUR', '+917087814525', '7087814525', 'neerajgour@hotmail.com', 'neerajgour@hotmail.com', true, 'WORKBOOK', 'T12-602', 'T12', 12, '6', '1985 SQFT', 1985.00, 3.25, 'TENANT', 'TENANTED', 'YASH MANN', '{"S.No":356,"OWNER NAME":"COL. NEERAJ GOUR","TOWER-\nFLATNO.":"T12-602","CONTACT DETAILS":7087814525,"EMAIL ID":"neerajgour@hotmail.com","RESIDENT\nSTATUS":"TENANT","OCCUPANCY\nSTATUS":"YASH MANN","AREA":1985,"RATE":3.25}'),
    (358, 357, 'a6687c66-608f-5f03-84e4-5690a53de445', 'owner-email:hssandhu101@gmail.com', 'SHIVINDER GILL', '+15595177666', '+15595177666; 8872147614', 'hssandhu101@gmail.com', 'hssandhu101@gmail.com', true, 'WORKBOOK', 'T12-701', 'T12', 12, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":357,"OWNER NAME":"SHIVINDER GILL","TOWER-\nFLATNO.":"T12-701","CONTACT DETAILS":"+15595177666\n8872147614","EMAIL ID":"hssandhu101@gmail.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}'),
    (359, 358, 'ea1300c2-8590-510f-be76-acc5b8aa6b26', 'owner-email:info@sasteghar.com', 'RUPINDER SINGH JASSAL / SUMERA JASSAL', '+918198031116', '8198031116; 9815301947', 'info@sasteghar.com', 'info@sasteghar.com', true, 'WORKBOOK', 'T12-702', 'T12', 12, '7', '1985 SQFT', 1985.00, 3.25, 'OWNER', 'SELF_OCCUPIED', 'SELF OCCUPIED', '{"S.No":358,"OWNER NAME":"RUPINDER SINGH JASSAL\nSUMERA JASSAL","TOWER-\nFLATNO.":"T12-702","CONTACT DETAILS":"8198031116 \n9815301947","EMAIL ID":"info@sasteghar.com","RESIDENT\nSTATUS":"OWNER","OCCUPANCY\nSTATUS":"SELF OCCUPIED","AREA":1985,"RATE":3.25}');

  create temporary table ajowa_tenant_import (
    source_row integer not null,
    tenant_user_id uuid not null,
    flat_number text not null,
    tenant_sequence integer not null,
    tenant_name text not null,
    tenant_mobile text,
    source_occupancy text
  ) on commit drop;

  insert into ajowa_tenant_import (
    source_row,
    tenant_user_id,
    flat_number,
    tenant_sequence,
    tenant_name,
    tenant_mobile,
    source_occupancy
  )
  values
    (9, '81848d42-050d-50c4-ab25-77724d7720b2', 'T1-302', 1, 'RANBIR SINGH / SONAM DOGRA', null, 'RANBIR SINGH; SONAM DOGRA;'),
    (11, 'b011e5b2-5a7f-5f96-bc16-b3ee5e5f0261', 'T1-401', 1, 'ASHISH PANJETTA', null, 'ASHISH PANJETTA;'),
    (12, '33520b11-873a-533a-a838-990459e67dfd', 'T1-402', 1, 'MANDEEP', null, 'MANDEEP;'),
    (13, '62162151-6283-51b4-aa28-c4a1a3dfe323', 'T1-403', 1, 'GURSEV SINGH', null, 'GURSEV SINGH;'),
    (22, 'fe68952c-5f4d-58cb-a5fe-c624e0f0b44d', 'T1-703', 1, 'PRIYANSHU HOODA / RAHUL YADAV', null, 'PRIYANSHU HOODA; RAHUL YADAV;'),
    (29, 'ebf71dd7-bf1b-554f-9ca5-dea43475a42d', 'T1-1001', 1, 'GIRISH ARORA', null, 'GIRISH ARORA;'),
    (46, 'b1ec7b3b-50bf-5c73-986e-0129b40bc769', 'T2-203', 1, 'SUKHPAL SINGH DAHRI / KAMALJIT KAUR / AKASHDEEP SINGH DAHRI / ARSHDEEP SINGH DAHRI / EKTA ARORA / RAJVIR BK', null, 'SUKHPAL SINGH DAHRI; KAMALJIT KAUR; AKASHDEEP SINGH DAHRI; ARSHDEEP SINGH DAHRI; EKTA ARORA; RAJVIR BK'),
    (52, 'b5f411c4-e7fd-5734-aca9-8eea701c95e0', 'T2-403', 1, 'RAVINDER SHARMA / MANDEEP DHALIWAL / DHRUV SHARMA / MEENA SHARMA / SUKHDEEP SINGH', null, 'RAVINDER SHARMA; MANDEEP DHALIWAL; DHRUV SHARMA; MEENA SHARMA; SUKHDEEP SINGH;'),
    (55, '06638f15-0dd0-5d74-b0e2-784dcd7e59ca', 'T2-503', 1, 'GURINDER PAL TANDON / NAVDEEP TANDON / SUNNY CHOUDHARY', null, 'GURINDER PAL TANDON; NAVDEEP TANDON; SUNNY CHOUDHARY;'),
    (56, 'ed4d6667-5fcb-5e2d-b6ba-fac8d31b8e7c', 'T2-601', 1, 'SANJEEV KUMAR VERMA', null, 'SANJEEV KUMAR VERMA;'),
    (59, '7280651e-3f1e-54ae-b9c8-9c3454c89b75', 'T2-701', 1, 'HEAVENPREET KAUR / ARUN KUMAR', null, 'HEAVENPREET KAUR; ARUN KUMAR;'),
    (60, '8042ed5c-39f5-5494-a451-32c3a75c9c60', 'T2-702', 1, 'MALVI NILESH / INDERJIT SINGH / AMAN KUMAR / JOBANPREET SINGH / SHARANJEET KAUR / ANOOP KUMAR / PARMVIR SINGH', null, 'MALVI NILESH; INDERJIT SINGH; AMAN KUMAR; JOBANPREET SINGH; SHARANJEET KAUR; ANOOP KUMAR; PARMVIR SINGH;'),
    (61, 'db78cf4b-a1bf-54a7-b0d5-e11a9a3cfab2', 'T2-703', 1, 'JOLLY MITTAL / NISHA MITTAL / AMIT KOHLI', null, 'JOLLY MITTAL; NISHA MITTAL; AMIT KOHLI'),
    (63, '68db684d-f98e-5fdc-b733-7ab76cffa6f3', 'T2-802', 1, 'AKASHVEER SINGH SANDHU / JASKARAN SINGH / PRAKASH', null, 'AKASHVEER SINGH SANDHU; JASKARAN SINGH; PRAKASH ;'),
    (69, 'e9b8bed1-14ff-50c1-aadb-3cbe22998af1', 'T2-1002', 1, 'JAGMEET SINGH / HARJINDER SINGH / KARAMDEEP SINGH / AJAIB SINGH', null, 'JAGMEET SINGH; HARJINDER SINGH; KARAMDEEP SINGH; AJAIB SINGH;'),
    (71, 'a3a83c0d-5ed9-5497-9b1f-802ff45939c6', 'T2-1101', 1, 'QUICK SILVER PRODUCTIONS / SUKHWINDER SINGH / ARVINDER SINGH KHAIRA', null, 'QUICK SILVER PRODUCTIONS; SUKHWINDER SINGH; ARVINDER SINGH KHAIRA'),
    (73, 'b35d3a65-9c3b-54bc-97c8-251fa759b687', 'T2-1103', 1, 'MANDEEP SINGH / MEENU / JAGDEEP SINGH / VISHAKHA SHARMA', null, 'MANDEEP SINGH; MEENU; JAGDEEP SINGH; VISHAKHA SHARMA;'),
    (82, 'dc136f44-f4a5-58db-abf6-97044cf37e7d', 'T3-201', 1, 'PARVINDER SINGH / INDERJEET SINGH / HARSHPREET SINGH', null, 'PARVINDER SINGH; INDERJEET SINGH; HARSHPREET SINGH;'),
    (86, '772e2072-720c-5655-b140-58101b6abb4a', 'T3-401', 1, 'YT MONEY PRODUCTIONS THROUGH DIRECTOR / NIKIT BASSI / AMITA KAUSHAL', null, 'YT MONEY PRODUCTIONS THROUGH DIRECTOR; NIKIT BASSI; AMITA KAUSHAL;'),
    (90, '82fdce09-0eb5-5a4a-a3d1-614ead08d621', 'T3-601', 1, 'NEAL NAVINCHANDRA SONI / SHARANJIT KAUR SONI / NEZLIN KAUR / NAVINCHANDRA MOTILAL SONI', null, 'NEAL NAVINCHANDRA SONI; SHARANJIT KAUR SONI; NEZLIN KAUR; NAVINCHANDRA MOTILAL SONI;'),
    (92, 'f528516b-2052-5cc1-ab13-8a0c8a706649', 'T3-701', 1, 'BHAGWANT SINGH / HARMIT SINGH / MEET SINGH / SHUBHAM BANSAL / AMANINDER SINGH / LAKHWINDER SINGH / BAHADUR CARETAKER', null, 'BHAGWANT SINGH; HARMIT SINGH; MEET SINGH; SHUBHAM BANSAL; AMANINDER SINGH; LAKHWINDER SINGH; BAHADUR CARETAKER;'),
    (96, '6f6e7bc9-7818-5f10-af32-644825fa5ba1', 'T3-901', 1, 'VINAYAKA PRAKASH / SURBHI JASSI / DAMANJEET KAUR', null, 'VINAYAKA PRAKASH; SURBHI JASSI; DAMANJEET KAUR;'),
    (101, 'a169a3cd-5a2e-5ec9-a361-9e92507ecbaa', 'T3-1102', 1, 'VIKAS VAID / KIRTI KUMAR / SHIVAM GARG', null, 'VIKAS VAID; KIRTI KUMAR; SHIVAM GARG;'),
    (109, '131a6bf0-c139-57a4-9cd3-b90ec981a5f7', 'T4-202', 1, 'JERRY / KHUSHHAL SINGH RANA', null, 'JERRY; KHUSHHAL SINGH RANA;'),
    (110, '5b0dea2e-4a66-5d31-9a80-e94249952566', 'T4-301', 1, 'PARUL NARWAL / ANJALI / JHANVI SHARMA', null, 'PARUL NARWAL; ANJALI; JHANVI SHARMA;'),
    (112, 'de6331a2-9251-556f-ace9-4a652f2f76bf', 'T4-401', 1, 'NITESH / BAL BAHADUR (ATTENDANT)', null, 'NITESH; BAL BAHADUR (ATTENDANT);'),
    (113, 'cc3a4178-5651-5bcb-afb6-d920a5dc3d1e', 'T4-402', 1, 'NAVTESH PARMAR / ADITI (MANAGER & STAFF) / AIR BNB', null, 'NAVTESH PARMAR; ADITI (MANAGER & STAFF); AIR BNB'),
    (116, '0231a169-ce02-5050-a511-0bc9080251b9', 'T4-601', 1, 'SUKHWINDER SINGH', null, 'SUKHWINDER SINGH;'),
    (118, '9736482d-52b2-50d3-bb1f-bb4aa89e5e75', 'T4-701', 1, 'HARDIAL SINGH SONI', null, 'HARDIAL SINGH SONI;'),
    (121, '9fc48ac0-8c64-59fc-91b9-8cb88708fb93', 'T4-802', 1, 'SATWINDER SINGH (MONTY) / ARVINDERPAL SINGH MALUKA / JASPREET SINGH / NAVNEET SINGH', null, 'SATWINDER SINGH (MONTY); ARVINDERPAL SINGH MALUKA; JASPREET SINGH; NAVNEET SINGH;'),
    (122, '35fd4701-c3bb-5e4c-8ca3-e1d18a05b24b', 'T4-901', 1, 'FURQAN FAROOQ / IRFAN BHAT', null, 'FURQAN FAROOQ; IRFAN BHAT;'),
    (124, 'e7973048-40b9-5401-bcad-c7c7813fba75', 'T4-1001', 1, 'VIJAY BANSAL', null, 'VIJAY BANSAL;'),
    (127, '4892a651-a092-5648-ab69-1b2621f23b59', 'T4-1102', 1, 'DANESH DINSHAW CHOTIA / AESHNA DASGUPTA', null, 'DANESH DINSHAW CHOTIA; AESHNA DASGUPTA;'),
    (131, '72029acc-a818-59a0-acdd-388dd9ee33ce', 'T4-1402', 1, 'DAVPINDER SINGH / BHUPINDER SINGH / DEEPAK KUMAR', null, 'DAVPINDER SINGH; BHUPINDER SINGH; DEEPAK KUMAR;'),
    (134, 'fbb21430-b37b-5b0e-8e5a-d49fcaa4c960', 'T5-103', 1, 'NARDEEP SINGH / MANPREET KAUR', null, 'NARDEEP SINGH; MANPREET KAUR;'),
    (136, '2ff6a6a3-bd8f-5591-954d-d147611c2d31', 'T5-201', 1, 'KIRANDEEP KAUR / MANGAL SINGH', null, 'KIRANDEEP KAUR; MANGAL SINGH;'),
    (138, 'd5541aed-44a7-582c-b9d7-e3dfe5170dfc', 'T5-203', 1, 'NITIRESH BHARADWAJ / ANISHA / ARYAN SAIN', null, 'NITIRESH BHARADWAJ; ANISHA; ARYAN SAIN;'),
    (140, 'af37e0e8-1255-5124-bdbb-14b82b745dea', 'T5-301', 1, 'SUNIL KUMAR / GEETANJALI', null, 'SUNIL KUMAR; GEETANJALI;'),
    (142, '3c4ebfe6-9986-56a0-8d67-0352eed4a3c5', 'T5-303', 1, 'DALJIT RAJ MANMOHAN SINGH / HARMINDER KAUR', null, 'DALJIT RAJ MANMOHAN SINGH; HARMINDER KAUR;'),
    (143, 'b01258a0-817d-5829-8e97-3322c3685385', 'T5-304', 1, 'MANPREET SINGH / ANMOLDEEP SINGH / BEER SUKHMAN SINGH', null, 'MANPREET SINGH; ANMOLDEEP SINGH; BEER SUKHMAN SINGH;'),
    (146, '1fd38707-2d32-502d-9448-7d08622cc271', 'T5-403', 1, 'MANSI CHOUDHARY / JITENDER KUMAR / SANSKAR DEVI', null, 'MANSI CHOUDHARY; JITENDER KUMAR; SANSKAR DEVI;'),
    (148, '54ad254a-13f7-5777-b5d0-451906187d96', 'T5-501', 1, 'MATHIAS PAGEAU', null, 'MATHIAS PAGEAU;'),
    (150, '9621f5a7-141a-5d88-98cd-3c41f59ccccf', 'T5-503', 1, 'RAMANDEEP KAUR / NIRPAL SINGH BARING / HARNOOR SINGH / NAVDEEP KAUR / SUKHJINDER SINGH / SATNAM SINGH (D), PANKAJ-CHETAN (ACCOUNTANT)', null, 'RAMANDEEP KAUR; NIRPAL SINGH BARING; HARNOOR SINGH; NAVDEEP KAUR; SUKHJINDER SINGH; SATNAM SINGH (D), PANKAJ-CHETAN (ACCOUNTANT);'),
    (153, '7a4b7dca-0113-5037-82c8-81b9d86378d0', 'T5-602', 1, 'PRIYA KHANNA / SIMRAN SHARMA / ANJALI MALHOTRA / KOMALPREET KAUR / YOGITA RAJPUT (L) / RIYA (DOCTOR INTERN) (L) / TINA SHARMA (L)', null, 'PRIYA KHANNA; SIMRAN SHARMA; ANJALI MALHOTRA; KOMALPREET KAUR; YOGITA RAJPUT (L); RIYA (DOCTOR INTERN) (L); TINA SHARMA (L);'),
    (156, '13645db3-d0aa-553f-827c-b086611e15d7', 'T5-701', 1, 'VIKAS BHANDARI / AMAN UNIYAL', null, 'VIKAS BHANDARI; AMAN UNIYAL;'),
    (157, 'e4ba8df6-27c4-534a-8bed-41f9c7f47461', 'T5-702', 1, 'ANSHUL KAMBOJ / RUCHIKA KAMBOJ', null, 'ANSHUL KAMBOJ; RUCHIKA KAMBOJ;'),
    (162, '3f890813-71b2-56d8-afa6-2c113fe6f393', 'T5-803', 1, 'PARMINDER SINGH TOOR (L) / NAVREET / AMRINDER / KARTIK (L) / ARSH BHULLAR', null, 'PARMINDER SINGH TOOR (L); NAVREET; AMRINDER; KARTIK (L); ARSH BHULLAR;'),
    (164, '18d78741-be41-5eeb-95bd-23eb74c9b75d', 'T5-901', 1, 'ABHISHEK SHARMA / RAJAT LOHIA / VANSH BANSAL', null, 'ABHISHEK SHARMA; RAJAT LOHIA; VANSH BANSAL;'),
    (165, 'eec45923-baec-5dc4-bb38-dfc851346430', 'T5-902', 1, 'AKASHVEER SINGH SANDHU / SHARANJIT SINGH', null, 'AKASHVEER SINGH SANDHU; SHARANJIT SINGH;'),
    (166, '79ec5461-b949-5ae3-922d-55198f3f64fc', 'T5-903', 1, 'SUKHDEEP KAUR / MUKESH GARG', null, 'SUKHDEEP KAUR; MUKESH GARG;'),
    (168, '7aee6801-abf9-55c5-8137-1e91c5b60c86', 'T5-1001', 1, 'INDER PREET SINGH', null, 'INDER PREET SINGH;'),
    (174, 'a5650a2d-e21a-5ce2-9f5b-e39fe29a27db', 'T5-1103', 1, 'RIDHAM GOYAL / RAHUL / HARSHIT GUPTA / MANAV GARG', null, 'RIDHAM GOYAL; RAHUL; HARSHIT GUPTA; MANAV GARG;'),
    (180, '3893c958-786d-542c-9094-24bbcbaca96b', 'T5-1401', 1, 'DEEPAK KUMAR / TARUN', null, 'DEEPAK KUMAR; TARUN;'),
    (185, '4c9fb16e-49f5-5eb0-88ad-4a9b1ca9a1a8', 'T6-102', 1, 'THAKUR ARVIND SINGH / MARYAM ZAKARIAE / ARYAN THAKUR', null, 'THAKUR ARVIND SINGH; MARYAM ZAKARIAE; ARYAN THAKUR;'),
    (190, '2d634e7d-e0d6-5bf5-95bb-d2b3f6f73c0c', 'T6-203', 1, 'NAVDEEP KAUR', null, 'NAVDEEP KAUR;'),
    (192, '3a4e49fe-0c0a-5999-b910-ec372ecbcdab', 'T6-301', 1, 'MANOJ KUMAR SABHARWAL / AMARJIT SINGH / TARKESHWAR SINGH HUNDAL', null, 'MANOJ KUMAR SABHARWAL; AMARJIT SINGH; TARKESHWAR SINGH HUNDAL;'),
    (196, 'f2a1e648-8032-5b6b-bc20-8cb069d16a62', 'T6-401', 1, 'JASHANPREET KAUR / SUDESH KAUR / NAVNEET KAUR', null, 'JASHANPREET KAUR; SUDESH KAUR; NAVNEET KAUR;'),
    (198, '1bcda0d5-28f4-53fd-a94e-5269fc335dee', 'T6-403', 1, 'JAGROOP SINGH SANDHU / HARSIMRAN KAUR / FATEH SINGH / HARNOOR SINGH', null, 'JAGROOP SINGH SANDHU; HARSIMRAN KAUR; FATEH SINGH; HARNOOR SINGH;'),
    (203, 'b74d4c8d-7a44-5cae-acd7-bf328dc52034', 'T6-504', 1, 'SIMRANJIT SINGH CHAHAL / JATIN SINGLA / SANJEEV ARORA', null, 'SIMRANJIT SINGH CHAHAL; JATIN SINGLA; SANJEEV ARORA;'),
    (211, '575c679f-1ba3-5fc9-a6ec-e459be3ad880', 'T6-704', 1, 'RENU GOYAL', null, 'RENU GOYAL;'),
    (212, '449a2ef2-2ffe-504a-ac69-d134052495b1', 'T6-801', 1, 'DILDAR SINGH GILL', null, 'DILDAR SINGH GILL;'),
    (217, '97971716-d9ca-5b69-b468-1ca2209892e1', 'T6-902', 1, 'ABHISHEK ARORA / VAISHALI', null, 'ABHISHEK ARORA; VAISHALI;'),
    (218, '561a5166-df3d-5c1d-8c00-5eb4b655ad93', 'T6-903', 1, 'LUXMI DEVI / JAGRITI / BHARTI / ROOPAM CHAUHAN (H) / KOMALPREET KAUR', null, 'LUXMI DEVI; JAGRITI; BHARTI; ROOPAM CHAUHAN (H); KOMALPREET KAUR;'),
    (223, 'a5827ca5-7a78-5b72-8181-eb97265671b2', 'T6-1004', 1, 'JATINDER / HARSHBAB SINGH', null, 'JATINDER; HARSHBAB SINGH;'),
    (227, 'c96cabf9-9f01-558e-9a24-c1007d016d3e', 'T6-1104', 1, 'UDAY PRATAP SINGH', null, 'UDAY PRATAP SINGH;'),
    (229, '9790951a-834a-5cde-ab73-7a993031b64e', 'T6-1202', 1, 'AMRITPAL KAUR AHLUWALIA / ANUP KUMAR RAI / DHARAM PAL SINGH AHLUWALIA / RAVINDER KAUR AHLUWALIA', null, 'AMRITPAL KAUR AHLUWALIA; ANUP KUMAR RAI; DHARAM PAL SINGH AHLUWALIA; RAVINDER KAUR AHLUWALIA;'),
    (230, 'c655437a-a79b-5fd1-b93c-9b90fdc8e009', 'T6-1203', 1, 'HARDIK PAHWA', null, 'HARDIK PAHWA;'),
    (233, '0d57ba3d-a77e-5ab4-8ad7-7b7727f37a0a', 'T6-1402', 1, 'RASHMI LAXMAN SHETTY / MISHIKA / ANKIT MEHTA / ARVIND MEHTA / RAKSHA MEHTA', null, 'RASHMI LAXMAN SHETTY; MISHIKA; ANKIT MEHTA; ARVIND MEHTA; RAKSHA MEHTA'),
    (234, '5274235e-124c-55c6-8ec9-38937991bf93', 'T6-1403', 1, 'HARDIK PAHWA', null, 'HARDIK PAHWA;'),
    (235, 'a729c1b3-35a1-5554-ab90-5cb39a041cb9', 'T6-1404', 1, 'RIYA ATTRI / KHUSHI SHARMA', null, 'RIYA ATTRI; KHUSHI SHARMA;'),
    (236, 'ad7e9c4f-200e-506a-baaf-3bd33c550160', 'T7-101', 1, 'AMIT KANWAR / AKHIL SHARMA / ISHANT KAMAL', null, 'AMIT KANWAR; AKHIL SHARMA; ISHANT KAMAL;'),
    (237, '7932f96d-afd6-5002-a953-bddf4461fbce', 'T7-102', 1, 'SANDEEP KUMAR / NAVRAJ SANGHA / PRABHPREET SINGH KAHLON / NEETU BHARTI', null, 'SANDEEP KUMAR; NAVRAJ SANGHA; PRABHPREET SINGH KAHLON; NEETU BHARTI;'),
    (239, '7bae9f93-17f0-5210-882f-df352c900e6a', 'T7-104', 1, 'BHAGWANT SINGH / ANJU RANI / VISHAKHA BHARDWAJ', null, 'BHAGWANT SINGH; ANJU RANI; VISHAKHA BHARDWAJ;'),
    (244, '2c625afd-66bd-565c-9ef3-eb2fca40680c', 'T7-301', 1, 'SAURABH RANA / CHIRAG KAPILA', null, 'SAURABH RANA; CHIRAG KAPILA;'),
    (245, 'e3d2221c-5086-5904-9042-3ef7d8b23629', 'T7-302', 1, 'NAVNEET SINGH / RISHAV SHARMA', null, 'NAVNEET SINGH; RISHAV SHARMA;'),
    (246, '07ced174-6af4-54bb-aba0-e5b8605d0e9c', 'T7-303', 1, 'LOVISH BEHL', null, 'LOVISH BEHL;'),
    (251, '37c9bfb8-f45d-5ced-a2f1-e3c7598e6307', 'T7-404', 1, 'NISHIKA SHARMA / PRATISHTHA SINGH', null, 'NISHIKA SHARMA; PRATISHTHA SINGH;'),
    (254, '97360591-f25e-5f23-8a7a-f28a6cb44360', 'T7-503', 1, 'ERNEST LESLIE GAUDOIN', null, 'ERNEST LESLIE GAUDOIN'),
    (258, 'b9bc343f-9354-5e65-aa5f-c9e9171b9f32', 'T7-603', 1, 'GURSEWAK SINGH', null, 'GURSEWAK SINGH;'),
    (259, '3f40db10-847e-5e0c-9ff3-aedf0f9f224b', 'T7-604', 1, 'UDAY CHAUHAN / POOJA CHAUHAN', null, 'UDAY CHAUHAN; POOJA CHAUHAN;'),
    (260, '22f2ff52-9ad7-508c-9704-389b9b4b2b47', 'T7-701', 1, 'JANG DHILLON-GREWAL / KULWINDER SINGH / HUSANPREET SINGH / AMARPAL SINGH / HARSHDEEP SINGH', null, 'JANG DHILLON-GREWAL; KULWINDER SINGH; HUSANPREET SINGH; AMARPAL SINGH; HARSHDEEP SINGH;'),
    (262, 'd27eac3c-f900-5388-8096-680a497b5b49', 'T7-703', 1, 'GURBHAIJ KAUR / JASVIR KAUR', null, 'GURBHAIJ KAUR; JASVIR KAUR;'),
    (263, '89e56579-0e16-5adb-b757-1a0515d4d784', 'T7-704', 1, 'MANINDER SINGH / TEJINDER SINGH / GURPREET SINGH', null, 'MANINDER SINGH; TEJINDER SINGH; GURPREET SINGH;'),
    (264, '254abd6a-de23-508f-b340-6d91a374afa6', 'T7-801', 1, 'SHARANDEEP SINGH / RAVINDER KUMAR', null, 'SHARANDEEP SINGH; RAVINDER KUMAR;'),
    (270, 'a99b2434-1945-5fcc-bfc2-d13ec925a3db', 'T8-101', 1, 'HIMANSHU GUMBER / KUNAL GILL / DEVYANSH GARG', null, 'HIMANSHU GUMBER; KUNAL GILL; DEVYANSH GARG;'),
    (273, 'a6901a1c-cb3e-5131-b925-4de7cce899be', 'T8-104', 1, 'ONKAR SINGH / SONALI SINGH / MANPREET SINGH', null, 'ONKAR SINGH; SONALI SINGH; MANPREET SINGH;'),
    (274, 'c6b652db-4d21-543b-a1d8-9b8cd6c06193', 'T8-201', 1, 'INDER PREET SINGH / RAJNI / KIRAT KAUR / HARMAN GILL / GEET', null, 'INDER PREET SINGH; RAJNI; KIRAT KAUR; HARMAN GILL; GEET;'),
    (276, '34a11ff4-fabe-5d3e-8e5f-640e93c22058', 'T8-203', 1, 'ANKITA VERMA / HEENA NARULA', null, 'ANKITA VERMA; HEENA NARULA;'),
    (277, '971ae25c-1ea1-5147-ac06-6534faca26b5', 'T8-204', 1, 'AASHISH / ANKIT', null, 'AASHISH; ANKIT;'),
    (282, '6d0fd58b-5ff4-515c-9160-1e1664922575', 'T8-401', 1, 'MANDEEP SINGH DHINDSA', null, 'MANDEEP SINGH DHINDSA;'),
    (283, 'ffdccb8f-7f0d-50ea-a093-fba793ece20b', 'T8-402', 1, 'JAYANT KALRA', null, 'JAYANT KALRA;'),
    (287, 'baf69900-6e13-5aac-9b2f-675726ec50a0', 'T8-502', 1, 'KEWAL SINGH / BALJINDER KAUR / TEJINDER SINGH', null, 'KEWAL SINGH; BALJINDER KAUR; TEJINDER SINGH;'),
    (288, '8a26791a-0eb7-5962-b4b1-a8d0df6f5f14', 'T8-503', 1, 'GURPREET SINGH / SONIA SINGH / BRISHEEN KAUR', null, 'GURPREET SINGH; SONIA SINGH; BRISHEEN KAUR'),
    (294, '025b14fd-a063-57f5-bc6e-4b68a7f2eb3a', 'T8-701', 1, 'NISHA BHATT', null, 'NISHA BHATT;'),
    (296, '879dcd0a-b2eb-54b3-b489-0e0606e92efb', 'T8-703', 1, 'PARAMJEET SINGH / SUKHWINDER SINGH / RAKHIL SHARMA / INDRAJ SURYA', null, 'PARAMJEET SINGH; SUKHWINDER SINGH; RAKHIL SHARMA; INDRAJ SURYA;'),
    (305, 'd7b900d4-50f5-5a3e-95a2-d5eb2a8ba853', 'T9-102', 1, 'SRISHTY', null, 'SRISHTY;'),
    (309, 'b49230cc-d481-5530-9903-7057ae12fdd9', 'T9-302', 1, 'JASPAL SINGH', null, 'JASPAL SINGH;'),
    (316, '936eaa10-8368-5a23-8d45-4e0e5f807b2e', 'T9-701', 1, 'FATEHKARAN SINGH BAJWA', null, 'FATEHKARAN SINGH BAJWA'),
    (318, '5f41620a-f1d6-5509-be37-27e5bc6ebd72', 'T10-101', 1, 'HARMANPREET / ARCHANA', null, 'HARMANPREET; ARCHANA;'),
    (327, 'f9ef52fd-5fde-5226-bf6c-41d9324d36c2', 'T10-502', 1, 'ARMAN GILHOTRA / UPASNA SHARMA', null, 'ARMAN GILHOTRA; UPASNA SHARMA;'),
    (333, '924c4ad8-35c1-5268-9ef4-0320a0c60de6', 'T11-102', 1, 'PRANJAL / SAJAL CHAUHAN / NEHA', null, 'PRANJAL; SAJAL CHAUHAN ; NEHA;'),
    (335, '80efdb94-73c0-5a69-b40d-7fa56ee7756b', 'T11-202', 1, 'RAGHAV CHUGH (CA) / SHIVAM SINGH', null, 'RAGHAV CHUGH (CA); SHIVAM SINGH;'),
    (341, '8c9716af-e314-527d-9436-598a2ec23b02', 'T11-502', 1, 'PARSHOTTAM PURI', null, 'PARSHOTTAM PURI;'),
    (346, '2f61f2f5-d272-5706-8281-0847549da2f7', 'T12-101', 1, 'SAHIL CHOPRA', null, 'SAHIL CHOPRA;'),
    (355, '5bedbe1d-ede6-5aa4-aa3d-6817fdedca21', 'T12-502', 1, 'AVNEET BRAR GILL', null, 'AVNEET BRAR GILL'),
    (356, '0c6b346a-1825-5c35-be2f-ba9aeb87245f', 'T12-601', 1, 'HARSH SHARMA / TARANBEER SINGH / SHIVANSH SHEKHAR / GURU MARKAN / NAVNEET YADAV', null, 'HARSH SHARMA; TARANBEER SINGH; SHIVANSH SHEKHAR; GURU MARKAN; NAVNEET YADAV;'),
    (357, '8ea76c4a-bb23-55cc-ae5c-e0f8df2b04ad', 'T12-602', 1, 'YASH MANN', null, 'YASH MANN');

  insert into society_profile (
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
    'AJOWA',
    'AJOWA Society',
    'AJOWA-REG-001',
    'AJOWA Main Office',
    'Mohali',
    'Punjab',
    '160055',
    'vishnu@envsoft.io',
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
      'managerBroadcastScope', 'CONFIGURABLE',
      'billingTenure', 'MONTHLY',
      'excessPaymentHandling', 'KEEP_AS_ADVANCE',
      'graceDays', 0,
      'lateFeePerDay', 50
    )
  )
  on conflict (code) do update
    set name = excluded.name,
        registration_number = excluded.registration_number,
        address_line_1 = excluded.address_line_1,
        city = excluded.city,
        state = excluded.state,
        pincode = excluded.pincode,
        contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone,
        timezone = excluded.timezone,
        settings = excluded.settings,
        updated_at = now()
  returning id into v_society_id;

  create temporary table ajowa_removed_local_auth_users on commit drop as
  select auth_user_id
  from users
  where society_id = v_society_id
    and auth_user_id is not null
    and (
      coalesce(email::text, '') ~ '^(owner|tenant)\..*@ajowa\.local$'
      or email::text in ('owner1@ajowa.local', 'tenant@ajowa.local', 'manager@ajowa.local')
    );

  delete from flat_residents fr
  using users u
  where fr.user_id = u.id
    and u.society_id = v_society_id
    and (
      coalesce(u.email::text, '') ~ '^(owner|tenant)\..*@ajowa\.local$'
      or u.email::text in ('owner1@ajowa.local', 'tenant@ajowa.local', 'manager@ajowa.local')
    );

  delete from users
  where society_id = v_society_id
    and (
      coalesce(email::text, '') ~ '^(owner|tenant)\..*@ajowa\.local$'
      or email::text in ('owner1@ajowa.local', 'tenant@ajowa.local', 'manager@ajowa.local')
    );

  delete from auth_accounts aa
  using ajowa_removed_local_auth_users du
  where aa.user_id = du.auth_user_id;

  delete from auth_users au
  using ajowa_removed_local_auth_users du
  where au.id = du.auth_user_id;

  insert into auth_users (name, email, email_verified, created_at, updated_at)
  values ('AJOWA Admin', 'vishnu@envsoft.io', true, now(), now())
  on conflict (email) do update
    set name = excluded.name,
        email_verified = true,
        updated_at = now()
  returning id into v_admin_auth_id;

  insert into auth_accounts (account_id, provider_id, user_id, password, created_at, updated_at)
  values (v_admin_auth_id::text, 'credential', v_admin_auth_id, v_password_hash, now(), now())
  on conflict (provider_id, account_id) do update
    set password = excluded.password,
        updated_at = now();

  insert into users (
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
  values (v_society_id, v_admin_auth_id, 'ADMIN', 'AJOWA Admin', 'vishnu@envsoft.io', '+919999999991', '+919999999991', true, false, true, true, 'VERIFIED', 'NOT_REQUIRED', 'ALL_CHANNELS')
  on conflict (society_id, email) do update
    set auth_user_id = excluded.auth_user_id,
        role = excluded.role,
        full_name = excluded.full_name,
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

  select id into v_admin_user_id
  from users
  where society_id = v_society_id and email = 'vishnu@envsoft.io';

  create temporary table ajowa_service_department_seed (
    id uuid not null,
    code text not null,
    name text not null,
    description text not null,
    allows_queue_visibility boolean not null
  ) on commit drop;

  insert into ajowa_service_department_seed (
    id,
    code,
    name,
    description,
    allows_queue_visibility
  )
  values
    ('12546ab0-da54-5712-bbbe-6873a5c0edf0', 'SECURITY', 'Security & Gate', 'Gate operations, visitor entry, patrolling, access incidents, and resident safety support.', true),
    ('3f06ec02-61c1-53ad-be5f-b0af49818912', 'HOUSEKEEPING', 'Housekeeping', 'Cleaning of lobbies, corridors, common toilets, staircases, and shared resident areas.', true),
    ('8ba67726-b0d8-5fca-83cb-7e8bc7a2981e', 'PLUMBING', 'Plumbing', 'Leakages, bathroom and kitchen plumbing, blocked drains, valves, and water-line repairs.', true),
    ('833fcab0-4a29-58ff-89fe-0977fd1578a2', 'ELECTRICAL', 'Electrical', 'Power issues, fixtures, DB panels, common-area lighting, and apartment electrical complaints.', true),
    ('6f670c5f-e958-5bc9-82c7-9df583fb1cdf', 'LIFT_ELEVATOR', 'Lift & Elevator', 'Lift breakdowns, door issues, emergency alarms, preventive checks, and vendor coordination.', true),
    ('21abee3f-3a4f-504b-91f0-723d440788a6', 'CIVIL_REPAIRS', 'Civil Repairs', 'Masonry, seepage, plaster, tiles, doors, railings, and minor structural repair coordination.', true),
    ('62cd6d23-f5f2-5475-b1d4-a5adfdf003f3', 'FIRE_SAFETY', 'Fire & Safety', 'Fire alarms, extinguishers, hydrants, evacuation readiness, and safety compliance checks.', true),
    ('02f2e23f-a65f-578a-b275-4e15c24b1bff', 'WATER_STP', 'Water Supply & STP', 'Water supply, pumps, tanks, sewage treatment plant, pressure issues, and water quality concerns.', true),
    ('3e731820-22c8-5cac-bbe2-fc1fb30b98fa', 'WASTE_MANAGEMENT', 'Waste Management', 'Door-to-door collection, garbage rooms, segregation, disposal vendors, and waste-area cleanliness.', true),
    ('17ef1bce-8b65-555d-a032-621b8cc9f7f3', 'LANDSCAPING', 'Landscaping & Horticulture', 'Garden upkeep, lawn care, plants, irrigation, pruning, and outdoor common-area beautification.', true),
    ('3dc6adca-4fac-5f13-82aa-ffb18e7ea46f', 'PEST_CONTROL', 'Pest Control', 'Scheduled pest treatment, mosquito control, termite checks, and complaint-based treatment.', true),
    ('a3791e43-0b45-56cf-97ee-a2c1923cae5b', 'PARKING_TRAFFIC', 'Parking & Traffic', 'Parking allocation support, vehicle movement, basement traffic, and unauthorized parking concerns.', true),
    ('09ba2bfe-ad25-5e46-9a9d-72c2dac35242', 'AMENITIES', 'Clubhouse & Amenities', 'Clubhouse, gym, pool, play area, community hall, sports facilities, and booking-related support.', true),
    ('2d70fa8d-c820-52a9-8214-257693dba0aa', 'ADMIN_BILLING', 'Admin & Billing Helpdesk', 'Resident helpdesk, billing questions, documents, move-in support, and society-office coordination.', true);

  insert into service_departments (
    id,
    society_id,
    code,
    name,
    description,
    is_active,
    allows_queue_visibility
  )
  select
    id,
    v_society_id,
    code,
    name,
    description,
    true,
    allows_queue_visibility
  from ajowa_service_department_seed
  on conflict (society_id, code) do update
    set name = excluded.name,
        description = excluded.description,
        is_active = true,
        allows_queue_visibility = excluded.allows_queue_visibility,
        updated_at = now();

  create temporary table ajowa_service_route_seed (
    category_key text not null,
    category_label text not null,
    location_type text,
    department_code text not null,
    default_priority text not null
  ) on commit drop;

  insert into ajowa_service_route_seed (
    category_key,
    category_label,
    location_type,
    department_code,
    default_priority
  )
  values
    ('SECURITY', 'Security / gate support', 'COMMON_AREA', 'SECURITY', 'HIGH'),
    ('HOUSEKEEPING', 'Housekeeping', null, 'HOUSEKEEPING', 'MEDIUM'),
    ('CLEANING', 'Cleaning', null, 'HOUSEKEEPING', 'MEDIUM'),
    ('PLUMBING', 'Plumbing', null, 'PLUMBING', 'MEDIUM'),
    ('ELECTRICAL', 'Electrical', null, 'ELECTRICAL', 'MEDIUM'),
    ('LIFT', 'Lift / elevator', 'COMMON_AREA', 'LIFT_ELEVATOR', 'HIGH'),
    ('CIVIL', 'Civil repair', null, 'CIVIL_REPAIRS', 'MEDIUM'),
    ('OTHER', 'General helpdesk', null, 'ADMIN_BILLING', 'LOW');

  delete from service_category_routes
  where society_id = v_society_id;

  insert into service_category_routes (
    society_id,
    category_key,
    category_label,
    location_type,
    department_id,
    default_priority,
    is_active
  )
  select
    v_society_id,
    route.category_key,
    route.category_label,
    route.location_type::service_location_type,
    department.id,
    route.default_priority::service_priority,
    true
  from ajowa_service_route_seed route
  inner join service_departments department
    on department.society_id = v_society_id
    and department.code = route.department_code;

  create temporary table ajowa_service_sla_seed (
    department_code text,
    priority text not null,
    acknowledge_within_minutes integer not null,
    resolve_within_minutes integer not null
  ) on commit drop;

  insert into ajowa_service_sla_seed (
    department_code,
    priority,
    acknowledge_within_minutes,
    resolve_within_minutes
  )
  values
    (null, 'LOW', 1440, 10080),
    (null, 'MEDIUM', 240, 2880),
    (null, 'HIGH', 60, 720),
    (null, 'EMERGENCY', 15, 120),
    ('SECURITY', 'EMERGENCY', 5, 60),
    ('FIRE_SAFETY', 'EMERGENCY', 5, 60),
    ('LIFT_ELEVATOR', 'HIGH', 30, 360),
    ('LIFT_ELEVATOR', 'EMERGENCY', 10, 90),
    ('WATER_STP', 'HIGH', 30, 480);

  delete from service_sla_rules
  where society_id = v_society_id;

  insert into service_sla_rules (
    society_id,
    department_id,
    priority,
    acknowledge_within_minutes,
    resolve_within_minutes,
    is_active
  )
  select
    v_society_id,
    department.id,
    sla.priority::service_priority,
    sla.acknowledge_within_minutes,
    sla.resolve_within_minutes,
    true
  from ajowa_service_sla_seed sla
  left join service_departments department
    on department.society_id = v_society_id
    and department.code = sla.department_code;

  insert into blocks (society_id, code, name, sort_order)
  select distinct
    v_society_id,
    tower_code,
    'Tower ' || tower_number,
    tower_number
  from ajowa_unit_import
  on conflict (society_id, code) do update
    set name = excluded.name,
        sort_order = excluded.sort_order,
        is_active = true,
        updated_at = now();

  insert into flats (
    society_id,
    block_id,
    flat_number,
    floor_label,
    unit_type,
    area_sq_ft,
    occupancy_status,
    is_active,
    import_metadata
  )
  select
    v_society_id,
    b.id,
    i.flat_number,
    i.floor_label,
    i.unit_type,
    i.area_sq_ft,
    i.occupancy_status,
    true,
    jsonb_build_object(
      'sourceFile', 'Workbook1.xlsx',
      'sourceRow', i.source_row,
      'serialNumber', i.serial_number,
      'sourceData', i.source_data,
      'normalized', jsonb_build_object(
        'towerCode', i.tower_code,
        'towerNumber', i.tower_number,
        'flatNumber', i.flat_number,
        'floorLabel', i.floor_label,
        'unitType', i.unit_type,
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft,
        'residentStatus', i.resident_status,
        'occupancyStatus', i.occupancy_status,
        'occupancyRaw', i.occupancy_raw
      )
    )
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  on conflict (block_id, flat_number) do update
    set floor_label = excluded.floor_label,
        unit_type = excluded.unit_type,
        area_sq_ft = excluded.area_sq_ft,
        occupancy_status = excluded.occupancy_status,
        import_metadata = excluded.import_metadata,
        is_active = true,
        updated_at = now();

  with owner_accounts as (
    select distinct on (owner_login_email)
      owner_name,
      owner_login_email,
      owner_can_login
    from ajowa_unit_import
    where owner_login_email is not null
    order by owner_login_email, source_row
  )
  insert into auth_users (name, email, email_verified, created_at, updated_at)
  select owner_name, owner_login_email, false, now(), now()
  from owner_accounts
  on conflict (email) do update
    set name = excluded.name,
        updated_at = now();

  with owner_accounts as (
    select distinct owner_login_email
    from ajowa_unit_import
    where owner_login_email is not null
  )
  insert into auth_accounts (account_id, provider_id, user_id, password, created_at, updated_at)
  select au.id::text, 'credential', au.id, v_password_hash, now(), now()
  from owner_accounts oa
  inner join auth_users au on au.email = oa.owner_login_email
  on conflict (provider_id, account_id) do update
    set password = excluded.password,
        updated_at = now();

  with owner_accounts as (
    select distinct on (owner_identity_key)
      owner_user_id,
      owner_identity_key,
      owner_name,
      owner_mobile,
      owner_login_email,
      owner_can_login
    from ajowa_unit_import
    where owner_login_email is not null
    order by owner_identity_key, source_row
  )
  insert into users (
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
  select
    v_society_id,
    au.id,
    'RESIDENT',
    oa.owner_name,
    oa.owner_login_email,
    oa.owner_mobile,
    oa.owner_mobile,
    oa.owner_can_login,
    oa.owner_can_login,
    false,
    true,
    'PENDING',
    'PENDING',
    'ALL_CHANNELS'
  from owner_accounts oa
  inner join auth_users au on au.email = oa.owner_login_email
  on conflict (society_id, email) do update
    set auth_user_id = excluded.auth_user_id,
        role = excluded.role,
        full_name = excluded.full_name,
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

  with owner_accounts as (
    select distinct on (owner_identity_key)
      owner_user_id,
      owner_identity_key,
      owner_name,
      owner_mobile
    from ajowa_unit_import
    where owner_login_email is null
    order by owner_identity_key, source_row
  )
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
  select
    oa.owner_user_id,
    v_society_id,
    null,
    'RESIDENT',
    oa.owner_name,
    null,
    oa.owner_mobile,
    oa.owner_mobile,
    false,
    false,
    false,
    true,
    'PENDING',
    'PENDING',
    'ALL_CHANNELS'
  from owner_accounts oa
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
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

  with tenant_accounts as (
    select distinct on (tenant_user_id)
      tenant_user_id,
      tenant_name,
      tenant_mobile
    from ajowa_tenant_import
    order by tenant_user_id, source_row
  )
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
  select
    ta.tenant_user_id,
    v_society_id,
    null,
    'RESIDENT',
    ta.tenant_name,
    null,
    ta.tenant_mobile,
    ta.tenant_mobile,
    false,
    false,
    false,
    true,
    'PENDING',
    'PENDING',
    'ALL_CHANNELS'
  from tenant_accounts ta
  on conflict (id) do update
    set role = excluded.role,
        full_name = excluded.full_name,
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

  insert into flat_residents (
    flat_id,
    user_id,
    relationship_type,
    is_primary_contact,
    is_billing_contact,
    can_login,
    is_active,
    ownership_start_date,
    occupancy_status,
    access_scope,
    relationship_note,
    import_metadata
  )
  select
    f.id,
    u.id,
    'OWNER',
    i.occupancy_status <> 'TENANTED',
    true,
    i.owner_can_login,
    true,
    '2026-06-01',
    i.occupancy_status,
    'OWNERSHIP',
    concat(
      'Imported from Workbook1.xlsx row ', i.source_row,
      '; S.No: ', i.serial_number,
      '; resident status: ', i.resident_status,
      '; email source: ', i.owner_email_source,
      '; flat: ', i.flat_number,
      '; area: ', i.area_sq_ft,
      '; rate: ', i.rate_per_sq_ft,
      '; source contact: ', coalesce(i.raw_contact, ''),
      '; source email: ', coalesce(i.raw_email, ''),
      '; occupancy: ', coalesce(i.occupancy_raw, '')
    ),
    jsonb_build_object(
      'sourceFile', 'Workbook1.xlsx',
      'sourceRow', i.source_row,
      'serialNumber', i.serial_number,
      'relationshipSource', 'OWNER',
      'sourceData', i.source_data,
      'normalized', jsonb_build_object(
        'ownerIdentityKey', i.owner_identity_key,
        'ownerName', i.owner_name,
        'ownerMobile', i.owner_mobile,
        'ownerLoginEmail', i.owner_login_email,
        'ownerCanLogin', i.owner_can_login,
        'ownerEmailSource', i.owner_email_source,
        'flatNumber', i.flat_number,
        'residentStatus', i.resident_status,
        'occupancyStatus', i.occupancy_status,
        'occupancyRaw', i.occupancy_raw,
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft
      )
    )
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = i.flat_number
  inner join users u on u.society_id = v_society_id
    and (
      (i.owner_login_email is not null and u.email = i.owner_login_email)
      or (i.owner_login_email is null and u.id = i.owner_user_id)
    )
  where not exists (
    select 1
    from flat_residents existing
    where existing.flat_id = f.id
      and existing.user_id = u.id
      and existing.relationship_type = 'OWNER'
  );

  update flat_residents fr
  set is_primary_contact = i.occupancy_status <> 'TENANTED',
      is_billing_contact = true,
      can_login = i.owner_can_login,
      is_active = true,
      ownership_start_date = coalesce(fr.ownership_start_date, '2026-06-01'),
      occupancy_status = i.occupancy_status,
      access_scope = 'OWNERSHIP',
      relationship_note = concat(
        'Imported from Workbook1.xlsx row ', i.source_row,
        '; S.No: ', i.serial_number,
        '; resident status: ', i.resident_status,
        '; email source: ', i.owner_email_source,
        '; flat: ', i.flat_number,
        '; area: ', i.area_sq_ft,
        '; rate: ', i.rate_per_sq_ft,
        '; source contact: ', coalesce(i.raw_contact, ''),
        '; source email: ', coalesce(i.raw_email, ''),
        '; occupancy: ', coalesce(i.occupancy_raw, '')
      ),
      import_metadata = jsonb_build_object(
        'sourceFile', 'Workbook1.xlsx',
        'sourceRow', i.source_row,
        'serialNumber', i.serial_number,
        'relationshipSource', 'OWNER',
        'sourceData', i.source_data,
        'normalized', jsonb_build_object(
          'ownerIdentityKey', i.owner_identity_key,
          'ownerName', i.owner_name,
          'ownerMobile', i.owner_mobile,
          'ownerLoginEmail', i.owner_login_email,
          'ownerCanLogin', i.owner_can_login,
          'ownerEmailSource', i.owner_email_source,
          'flatNumber', i.flat_number,
          'residentStatus', i.resident_status,
          'occupancyStatus', i.occupancy_status,
          'occupancyRaw', i.occupancy_raw,
          'areaSqFt', i.area_sq_ft,
          'ratePerSqFt', i.rate_per_sq_ft
        )
      ),
      updated_at = now()
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = i.flat_number
  inner join users u on u.society_id = v_society_id
    and (
      (i.owner_login_email is not null and u.email = i.owner_login_email)
      or (i.owner_login_email is null and u.id = i.owner_user_id)
    )
  where fr.flat_id = f.id
    and fr.user_id = u.id
    and fr.relationship_type = 'OWNER';

  insert into flat_residents (
    flat_id,
    user_id,
    relationship_type,
    is_primary_contact,
    is_billing_contact,
    can_login,
    is_active,
    lease_start_date,
    lease_end_date,
    occupancy_status,
    access_scope,
    relationship_note,
    import_metadata
  )
  select
    f.id,
    u.id,
    'TENANT',
    t.tenant_sequence = 1,
    false,
    false,
    true,
    '2026-06-01',
    '2027-05-31',
    'TENANTED',
    'TENANCY',
    concat(
      'Tenant imported from Workbook1.xlsx row ', t.source_row,
      '; S.No: ', i.serial_number,
      '; flat: ', i.flat_number,
      '; area: ', i.area_sq_ft,
      '; rate: ', i.rate_per_sq_ft,
      '; source occupancy: ', coalesce(t.source_occupancy, '')
    ),
    jsonb_build_object(
      'sourceFile', 'Workbook1.xlsx',
      'sourceRow', i.source_row,
      'serialNumber', i.serial_number,
      'relationshipSource', 'TENANT',
      'sourceData', i.source_data,
      'normalized', jsonb_build_object(
        'tenantName', t.tenant_name,
        'tenantMobile', t.tenant_mobile,
        'flatNumber', i.flat_number,
        'residentStatus', i.resident_status,
        'occupancyStatus', 'TENANTED',
        'occupancyRaw', i.occupancy_raw,
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft
      )
    )
  from ajowa_tenant_import t
  inner join ajowa_unit_import i on i.flat_number = t.flat_number
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = t.flat_number
  inner join users u on u.society_id = v_society_id and u.id = t.tenant_user_id
  where not exists (
    select 1
    from flat_residents existing
    where existing.flat_id = f.id
      and existing.user_id = u.id
      and existing.relationship_type = 'TENANT'
  );

  update flat_residents fr
  set is_primary_contact = t.tenant_sequence = 1,
      is_billing_contact = false,
      can_login = false,
      is_active = true,
      lease_start_date = coalesce(fr.lease_start_date, '2026-06-01'),
      lease_end_date = coalesce(fr.lease_end_date, '2027-05-31'),
      occupancy_status = 'TENANTED',
      access_scope = 'TENANCY',
      relationship_note = concat(
        'Tenant imported from Workbook1.xlsx row ', t.source_row,
        '; S.No: ', i.serial_number,
        '; flat: ', i.flat_number,
        '; area: ', i.area_sq_ft,
        '; rate: ', i.rate_per_sq_ft,
        '; source occupancy: ', coalesce(t.source_occupancy, '')
      ),
      import_metadata = jsonb_build_object(
        'sourceFile', 'Workbook1.xlsx',
        'sourceRow', i.source_row,
        'serialNumber', i.serial_number,
        'relationshipSource', 'TENANT',
        'sourceData', i.source_data,
        'normalized', jsonb_build_object(
          'tenantName', t.tenant_name,
          'tenantMobile', t.tenant_mobile,
          'flatNumber', i.flat_number,
          'residentStatus', i.resident_status,
          'occupancyStatus', 'TENANTED',
          'occupancyRaw', i.occupancy_raw,
          'areaSqFt', i.area_sq_ft,
          'ratePerSqFt', i.rate_per_sq_ft
        )
      ),
      updated_at = now()
  from ajowa_tenant_import t
  inner join ajowa_unit_import i on i.flat_number = t.flat_number
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = t.flat_number
  inner join users u on u.society_id = v_society_id and u.id = t.tenant_user_id
  where fr.flat_id = f.id
    and fr.user_id = u.id
    and fr.relationship_type = 'TENANT';

  delete from maintenance_charges
  where society_id = v_society_id
    and is_active = true;

  insert into maintenance_charges (
    society_id,
    scope,
    charge_name,
    amount,
    calculation_method,
    rate_per_sq_ft,
    charge_breakdown,
    is_active
  )
  values (
    v_society_id,
    'SOCIETY_DEFAULT',
    'CAM Charges',
    3.25,
    'AREA_RATE',
    3.25,
    jsonb_build_array(
      jsonb_build_object(
        'label', 'CAM Charges',
        'amount', 3.25,
        'calculationMethod', 'AREA_RATE',
        'ratePerSqFt', 3.25
      )
    ),
    true
  );

  insert into billing_periods (
    society_id,
    label,
    frequency,
    start_date,
    end_date,
    due_date,
    is_locked
  )
  values (
    v_society_id,
    'June 2026',
    'MONTHLY',
    '2026-06-01',
    '2026-06-30',
    '2026-06-10',
    false
  )
  on conflict (society_id, start_date, end_date) do update
    set label = excluded.label,
        frequency = excluded.frequency,
        due_date = excluded.due_date,
        is_locked = excluded.is_locked,
        updated_at = now()
  returning id into v_period_id;

  insert into maintenance_dues (
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
  select
    v_society_id,
    v_period_id,
    f.id,
    '2026-06-10',
    round(i.area_sq_ft * i.rate_per_sq_ft, 2),
    0,
    0,
    0,
    round(i.area_sq_ft * i.rate_per_sq_ft, 2),
    round(i.area_sq_ft * i.rate_per_sq_ft, 2),
    'OPEN',
    jsonb_build_array(
      jsonb_build_object(
        'label', 'CAM Charges',
        'amount', round(i.area_sq_ft * i.rate_per_sq_ft, 2),
        'calculationMethod', 'AREA_RATE',
        'areaSqFt', i.area_sq_ft,
        'ratePerSqFt', i.rate_per_sq_ft,
        'sourceFile', 'Workbook1.xlsx',
        'sourceRow', i.source_row,
        'serialNumber', i.serial_number,
        'sourceData', i.source_data
      )
    )
  from ajowa_unit_import i
  inner join blocks b on b.society_id = v_society_id and b.code = i.tower_code
  inner join flats f on f.block_id = b.id and f.flat_number = i.flat_number
  on conflict (billing_period_id, flat_id) do update
    set due_date = excluded.due_date,
        base_amount = excluded.base_amount,
        late_fee_amount = excluded.late_fee_amount,
        waived_amount = excluded.waived_amount,
        paid_amount = excluded.paid_amount,
        total_amount = excluded.total_amount,
        balance_amount = excluded.balance_amount,
        status = excluded.status,
        charge_breakdown = excluded.charge_breakdown,
        updated_at = now();

  insert into document_sequences (document_type, sequence_year, last_value)
  values
    ('RECEIPT', 2026, 0),
    ('JOURNAL_VOUCHER', 2026, 0),
    ('SERVICE_REQUEST', 2026, 0)
  on conflict (document_type, sequence_year) do update
    set last_value = greatest(document_sequences.last_value, excluded.last_value),
        updated_at = now();
end;
$$;
