export type LegalSection = {
  title: string
  intro?: string
  bullets?: string[]
}

export type LegalDocument = {
  eyebrow: string
  title: string
  intro: string
  sections: LegalSection[]
}

export const societyPolicyDocument: LegalDocument = {
  eyebrow: 'AJOWA Society Policy',
  title: 'AJOWA Detailed Society Policy',
  intro:
    'This page summarizes the operating, access, safety, amenity, and conduct rules shared in Annexure A for ACME Jubilee Owner Welfare Association (AJOWA). Residents, tenants, guests, staff, and service providers are expected to comply with these rules while using the society and its facilities.',
  sections: [
    {
      title: '1. Maintenance Charges and Dues',
      bullets: [
        'Monthly maintenance fees are payable on a quarterly basis and are due by the 10th day of the quarter, as decided by the RWA from time to time.',
        'Late payment charges of Rs 50 per day apply from the 11th day of the quarter until all outstanding amounts are cleared.',
        'If dues remain unpaid beyond the first month of the quarter, society services and facilities, including DG backup, housekeeping support, gym, swimming pool, and clubhouse access, may be suspended until dues are cleared.',
        'If dues remain unpaid beyond the second month of the quarter, the RWA may restrict non-essential society services and society-facilitated access for couriers, deliveries, vendors, and visitors, subject to law and emergency requirements.',
        'Restoration of suspended services may require payment of outstanding dues, late payment charges, and a restoration charge of Rs 5,000.',
        'Cheque or payment dishonour charges are recoverable from the defaulting member along with an administrative charge of Rs 500.',
        'Common area electricity charges are currently included in maintenance charges. If billed separately in future, the same late payment and recovery rules will apply.',
      ],
    },
    {
      title: '2. Visitor and Entry Management',
      bullets: [
        'Residents must install and use the MyGate app or the society-approved visitor access workflow.',
        'Visitors, guests, helpers, vendors, delivery personnel, and service providers must be managed through the approved visitor management system.',
        'Security sends an arrival notification to the concerned resident for approval.',
        'Entry is allowed only after resident approval through the application or approved society process.',
      ],
    },
    {
      title: '3. Pet Policy',
      bullets: [
        'Pets must not roam freely and must remain on a leash and under owner or pet-walker control when outdoors.',
        'Pets should use lifts only when no other resident is present in the lift cabin.',
        'Pet owners or pet walkers must carry cleaning tools and immediately clean pet waste in all common areas.',
        'Pet policy violations may attract a penalty of Rs 500 per incident, and repeated violations may attract a penalty up to Rs 5,000 or further action.',
        'Pets must be properly vaccinated, and updated vaccination records, including rabies vaccination, must be provided to the RWA.',
        'Pets must not be tied, confined, or left unattended in balconies, corridors, or common areas in a way that disturbs others.',
      ],
    },
    {
      title: '4. Parking and Vehicle Movement',
      bullets: [
        'Residents must park only in designated or allotted parking slots and must not use visitor parking for regular or long-term parking.',
        'Parking in another resident\'s allotted slot without permission is prohibited.',
        'Vehicles must not be parked in driveways, ramps, fire access areas, near lift lobbies, at entry or exit points, or anywhere that obstructs traffic, emergency access, or maintenance operations.',
        'Resident vehicles must be registered with the society\'s vehicle access system and display the prescribed access tag after payment of applicable charges.',
        'Vehicles parked in violation may be wheel-clamped and released only after payment of a Rs 500 penalty. Repeated violations may attract penalties up to Rs 5,000.',
        'Entry and exit gates, one-way traffic rules, CCTV monitoring, and a speed limit of 20 km/hr must be followed at all times.',
        'Damage to boom barriers, common areas, landscaping, parking infrastructure, or other vehicles is recoverable from the responsible owner or driver. Boom-barrier damage may attract a Rs 10,000 penalty plus actual repair costs.',
      ],
    },
    {
      title: '5. Building, Renovation, and Common Areas',
      bullets: [
        'No permanent or temporary structural alteration to the builder-provided setup may be undertaken without prior RWA approval and compliance with applicable standards.',
        'Balcony enclosures, facade changes, unsafe water features, and similar modifications are restricted to protect safety and building appearance.',
        'Renovation or construction work inside flats is allowed only between 9:00 a.m. and 6:00 p.m.',
        'Residents must notify the RWA before renovation and submit a refundable security deposit of Rs 5,000 per flat.',
        'Contractor details, debris removal, and non-obstruction of lifts, corridors, and common spaces are mandatory.',
        'Corridors, lift lobbies, terraces, emergency exits, service shafts, and other common passages must remain clean, safe, and unobstructed.',
      ],
    },
    {
      title: '6. Amenities and Facility Usage',
      bullets: [
        'Clubhouse, gym, sauna, swimming pool, mini theatre, and other society facilities are subject to society rules, booking availability, operating hours, and dues clearance.',
        'Only residents without outstanding dues may use certain amenities, including gym, sauna room, swimming pool, and other clubhouse facilities.',
        'Amenity bookings may be chargeable. Damage to booked facilities or common property is recoverable from the user.',
        'Use of amenities is at the resident\'s own risk where stated by the policy, and parents or guardians are responsible for dependent children.',
        'Guests may use eligible facilities only within the limits allowed by the applicable society policy and only when accompanied where required.',
      ],
    },
    {
      title: '7. Staff, Workers, and Support Services',
      bullets: [
        'Domestic helpers, drivers, household staff, and workers must be registered and pre-approved through the society\'s visitor management process.',
        'Where required by the RWA, residents must provide Aadhaar copy, photograph, police verification, rent agreement, or other prescribed records.',
        'Residents are responsible for the conduct and compliance of the personnel they employ or invite into the premises.',
        'Resident support and minor maintenance assistance are limited to the scope defined by the RWA and builder-provided systems.',
      ],
    },
    {
      title: '8. Conduct, Safety, and Community Living',
      bullets: [
        'Residents, occupants, visitors, and guests must behave respectfully and must not create nuisance, disturbance, unsafe conditions, or interference with common facilities.',
        'High-volume music, obstruction of common areas, littering, spitting, unsafe storage, balcony misuse, and unauthorized advertisements or commercial activity are prohibited without approval.',
        'Children, guests, tenants, and staff using society premises remain the responsibility of the resident or guardian connected to them.',
        'Feeding of stray animals is permitted only at locations designated by the RWA and in accordance with applicable law and authority directions.',
        'Residents leaving for an extended period are advised to switch off unnecessary utilities and share emergency contact or access arrangements where appropriate.',
      ],
    },
    {
      title: '9. Tenancy and Shifting',
      bullets: [
        'Residents and tenants must inform the property manager before shifting in or out of the society.',
        'RWA NOC is mandatory before shifting in or shifting out.',
        'A fee of Rs 3,000 may apply for tenant household shifting. Damage to common area property during shifting remains the owner\'s responsibility.',
        'Police verification, rent agreement copies, KYC, and other required records must be submitted as prescribed by the RWA.',
        'Flats must not be used as hostels, guest houses, Airbnb units, mess facilities, or for similar unauthorized occupancy models if prohibited by the RWA.',
        'Tenants may use society facilities in accordance with society rules, but they must not sublet, create nuisance, obstruct common areas, or engage in unlawful or anti-social activity.',
      ],
    },
  ],
}

export const refundPolicyDocument: LegalDocument = {
  eyebrow: 'AJOWA Refund Policy',
  title: 'Refund Policy',
  intro:
    'This Refund Policy applies to payments collected for AJOWA society charges, amenity bookings, deposits, registrations, and related society services made through approved online or offline payment channels.',
  sections: [
    {
      title: '1. General Rule',
      bullets: [
        'Payments made toward maintenance dues, common charges, penalties, dishonour charges, restoration charges, NOC charges, registration charges, and similar society levies are generally non-refundable once received and posted against the member account.',
        'Residents are responsible for reviewing the amount, billing period, and purpose of payment before completing a transaction.',
      ],
    },
    {
      title: '2. Cases Where Refund or Adjustment May Be Considered',
      bullets: [
        'Duplicate payments for the same charge and period may be refunded or adjusted against future dues after verification.',
        'Excess payments may be adjusted to the resident ledger or refunded, depending on the RWA decision and accounting review.',
        'If a payment is debited from the payer but is not successfully credited to the society account or resident ledger, the matter will be reviewed after bank or gateway reconciliation.',
        'Refundable security deposits, including approved renovation or event-related deposits, may be returned after inspection, deductions for damages if any, and confirmation that all related dues are cleared.',
      ],
    },
    {
      title: '3. Non-Refundable Items',
      bullets: [
        'Late payment charges, cheque dishonour charges, administrative charges, restoration charges, penalties, and fees imposed for policy violations are non-refundable.',
        'Charges for consumed services, completed bookings, used amenity slots, or already-issued approvals and certificates are non-refundable unless the RWA decides otherwise.',
      ],
    },
    {
      title: '4. Amenity and Facility Booking Refunds',
      bullets: [
        'Amenity or facility booking charges are not automatically refundable once a booking is confirmed.',
        'If AJOWA is unable to provide the booked facility for operational reasons, closure, or administrative cancellation, the RWA may approve a refund or rebooking credit.',
        'If a resident seeks cancellation, any refund or credit is subject to the applicable booking rules, timing of cancellation, and any deductions approved by the RWA.',
        'Any damage, extra cleaning, unpaid dues, or policy violation linked to the booking may be adjusted before release of any refundable deposit.',
      ],
    },
    {
      title: '5. Refund Process',
      bullets: [
        'Refund requests should be submitted to the RWA or property management with payment proof, resident details, and reason for the request.',
        'All refund requests are subject to verification of the resident ledger, bank or payment gateway records, and applicable society rules.',
        'Approved refunds are typically processed back to the original payment source where feasible, or through another approved mode recorded by the society.',
        'Processing time depends on internal verification and banking timelines.',
      ],
    },
    {
      title: '6. Final Authority',
      bullets: [
        'AJOWA reserves the right to approve, reject, adjust, or partially settle any refund request based on the governing society rules, ledger position, supporting documents, and the facts of the case.',
      ],
    },
  ],
}

export const termsDocument: LegalDocument = {
  eyebrow: 'AJOWA Terms and Conditions',
  title: 'Terms and Conditions',
  intro:
    'These Terms and Conditions govern the use of the AJOWA website, resident portal, payment workflows, visitor approvals, service requests, amenity bookings, and other society-related digital services.',
  sections: [
    {
      title: '1. Acceptance and Scope',
      bullets: [
        'By using the AJOWA portal, making a payment, requesting access, booking a facility, or using society-managed digital services, you agree to comply with these terms and with applicable AJOWA policies.',
        'These terms apply to residents, owners, tenants, family members, guests, staff, vendors, and any user acting through a resident-linked account or society-approved workflow.',
      ],
    },
    {
      title: '2. Account and User Responsibility',
      bullets: [
        'Users must provide accurate, current, and complete information while registering, paying dues, submitting documents, or requesting approvals.',
        'Users are responsible for maintaining the confidentiality of their login credentials, devices, OTPs, and approvals made through the portal or visitor management tools.',
        'Any activity performed through a resident-linked account may be treated as authorized unless reported promptly as unauthorized.',
      ],
    },
    {
      title: '3. Payments and Charges',
      bullets: [
        'All maintenance dues, amenity fees, penalties, deposits, and other charges are payable as determined by AJOWA from time to time.',
        'Late fees, dishonour charges, restoration charges, and other policy-based recoveries may be added automatically or manually to the resident ledger.',
        'Payment confirmation is subject to successful receipt, reconciliation, and posting in society records.',
      ],
    },
    {
      title: '4. Access, Visitors, and Facility Use',
      bullets: [
        'Visitor approvals, staff entries, service provider access, and amenity usage must follow the society\'s prescribed approval and verification process.',
        'Access to amenities or services may be denied, restricted, or suspended where dues remain unpaid, required records are missing, or policy violations occur.',
        'Facility bookings, guest usage, shifting approvals, and contractor entry remain subject to timing, availability, safety rules, and RWA approval.',
      ],
    },
    {
      title: '5. Conduct and Prohibited Use',
      bullets: [
        'Users must not misuse the portal, falsify records, bypass approval flows, interfere with security processes, or use the society or its systems for unlawful, harmful, or unauthorized purposes.',
        'Users must not use the portal or society facilities in a way that creates nuisance, safety risk, obstruction, property damage, or disturbance to residents and staff.',
        'Commercial publicity, unauthorized tenancy models, subletting where prohibited, or misuse of common areas may lead to restriction, penalty, suspension, or other action under society policy.',
      ],
    },
    {
      title: '6. Documents, Approvals, and Compliance',
      bullets: [
        'AJOWA may require users to submit identity records, rent agreements, police verification, vaccination records, KYC, vehicle details, contractor details, or other documents needed for compliance and community administration.',
        'Failure to provide required records may delay or prevent access, approvals, bookings, or service activation.',
      ],
    },
    {
      title: '7. Liability and Risk',
      bullets: [
        'Use of society amenities and facilities is subject to the policy rules applicable to each facility, including any self-risk clauses stated by the society.',
        'Users remain responsible for damages caused by themselves, their family members, tenants, guests, staff, contractors, workers, pets, or vehicles.',
        'AJOWA is not responsible for loss caused by inaccurate user submissions, third-party banking delays, user negligence, or misuse of facilities contrary to policy.',
      ],
    },
    {
      title: '8. Suspension, Enforcement, and Updates',
      bullets: [
        'AJOWA may suspend or restrict portal features, amenity access, society services, or certain approvals where dues remain unpaid, rules are violated, or safety and administrative needs require action.',
        'These terms and related policies may be updated by AJOWA from time to time. Continued use after an update constitutes acceptance of the revised terms.',
        'In the event of any conflict between portal content and a formally adopted society rule or RWA decision, the governing society rule or decision will prevail.',
      ],
    },
  ],
}
