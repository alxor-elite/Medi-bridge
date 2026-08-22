'use strict';

const { validateEnv, env } = require('../src/config/env');
const db = require('../src/db');
const { hashPassword } = require('../src/utils/security');
const {
  CITY,
  LOCALITIES,
  HOSPITAL_NAMES,
  PHARMACY_NAMES,
  SUPPLIER_NAMES,
  MEDICINE_BASE,
  EQUIPMENT_BASE,
} = require('./seed-data');
const {
  TABLES,
  ROLES,
  ORGANIZATION_TYPES,
  VERIFICATION_STATUS,
  ITEM_TYPES,
  EQUIPMENT_CONDITION,
  ORDER_STATUS,
  PRIORITY,
} = require('../src/config/constants');

/**
 * Demo data for the hackathon.
 *
 * Everything here is invented: no real organisation, no real person and
 * absolutely no patient data. Run it with `npm run seed`.
 *
 * The generator is deterministic (fixed RNG seed) so a demo run looks the same
 * every time and a bug is reproducible.
 */

const DEMO_PASSWORD = 'MediBridge#2026';

/** Small deterministic PRNG (mulberry32) - same seed, same demo, every time. */
function createRandom(seed = 20260822) {
  let state = seed >>> 0;
  return function random() {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const random = createRandom();
const pick = (list) => list[Math.floor(random() * list.length)];
const between = (min, max) => min + random() * (max - min);
const intBetween = (min, max) => Math.floor(between(min, max + 1));

/** A point within roughly `radiusKm` of the city centre. */
function scatter(radiusKm = 16) {
  const angle = random() * Math.PI * 2;
  const distance = Math.sqrt(random()) * radiusKm;
  return {
    latitude: Number((CITY.latitude + (distance / 111) * Math.cos(angle)).toFixed(6)),
    longitude:
      Number(
        (CITY.longitude + (distance / (111 * Math.cos((CITY.latitude * Math.PI) / 180))) * Math.sin(angle)).toFixed(6)
      ),
  };
}

function isoDaysFromNow(days) {
  return new Date(Date.now() + days * 86400000).toISOString().slice(0, 10);
}

function minutesAgoIso(minutes) {
  return new Date(Date.now() - minutes * 60000).toISOString();
}

async function seed({ quiet = false } = {}) {
  const log = (...args) => {
    if (!quiet) console.log(...args);
  };

  // One bcrypt call for the whole demo: every seeded account shares the same
  // password, and hashing it 150 times would make seeding needlessly slow.
  const passwordHash = await hashPassword(DEMO_PASSWORD);

  /* --- Catalogue ------------------------------------------------------- */
  const medicineRows = [];
  for (const base of MEDICINE_BASE) {
    for (const strength of base.strengths) {
      medicineRows.push({
        name: `${base.brand} ${strength}`,
        generic_name: base.generic,
        manufacturer: pick(['Cipla', 'Sun Pharma', 'Dr Reddys', 'Zydus', 'Alkem', 'Abbott', 'GSK', 'Mankind']),
        category: base.category,
        description: `${base.generic} ${strength}, ${base.form.toLowerCase()}.`,
        strength,
        form: base.form,
        requires_prescription: Boolean(base.rx),
      });
    }
  }
  const medicines = await db.insertMany(TABLES.MEDICINES, medicineRows);
  log(`  medicines            ${medicines.length}`);

  const equipmentRows = [];
  for (const base of EQUIPMENT_BASE) {
    for (const model of base.models) {
      equipmentRows.push({
        name: `${base.name} ${model}`,
        category: base.category,
        manufacturer: base.manufacturer,
        model,
        description: `${base.name} (${base.manufacturer} ${model}).`,
      });
    }
  }
  const equipment = await db.insertMany(TABLES.EQUIPMENT, equipmentRows);
  log(`  equipment            ${equipment.length}`);

  /* --- Organisations --------------------------------------------------- */
  const organizations = [];
  let registrationCounter = 1000;

  function buildOrganization(name, type, index) {
    const locality = LOCALITIES[index % LOCALITIES.length];
    const position = scatter();
    registrationCounter += 1;

    // A few organisations are deliberately left unverified so the demo can
    // show that they never appear in emergency search results. The first of
    // each type is always verified, because those are the accounts a demo
    // reaches for first and they should just work.
    const verified = index === 0 || index % 11 !== 0;

    return {
      name: `${name} ${type === ORGANIZATION_TYPES.HOSPITAL ? 'Hospital' : ''}`.trim(),
      type,
      registration_number: `KA-${type.slice(0, 3)}-${registrationCounter}`,
      license_number: `LIC-${type.slice(0, 2)}-${registrationCounter}`,
      phone: `+9180${intBetween(40000000, 49999999)}`,
      email: `contact${registrationCounter}@example.com`,
      address: `${intBetween(1, 240)}, ${locality} Main Road, ${locality}, ${CITY.name} 5600${String(intBetween(1, 99)).padStart(2, '0')}`,
      latitude: position.latitude,
      longitude: position.longitude,
      verification_status: verified ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.PENDING,
      verification_notes: verified ? 'Documents reviewed by the MediBridge admin team.' : null,
      verified_at: verified ? minutesAgoIso(intBetween(1440, 20000)) : null,
      verified_by: null,
      reliability_score: verified ? intBetween(72, 99) : 75,
    };
  }

  HOSPITAL_NAMES.forEach((name, index) =>
    organizations.push(buildOrganization(name, ORGANIZATION_TYPES.HOSPITAL, index))
  );
  PHARMACY_NAMES.forEach((name, index) =>
    organizations.push(buildOrganization(name, ORGANIZATION_TYPES.PHARMACY, index + 3))
  );
  SUPPLIER_NAMES.forEach((name, index) =>
    organizations.push(buildOrganization(name, ORGANIZATION_TYPES.SUPPLIER, index + 7))
  );

  const savedOrganizations = await db.insertMany(TABLES.ORGANIZATIONS, organizations);
  const hospitals = savedOrganizations.filter((org) => org.type === ORGANIZATION_TYPES.HOSPITAL);
  const pharmacies = savedOrganizations.filter((org) => org.type === ORGANIZATION_TYPES.PHARMACY);
  const suppliers = savedOrganizations.filter((org) => org.type === ORGANIZATION_TYPES.SUPPLIER);

  log(`  organizations        ${savedOrganizations.length} (${hospitals.length} hospitals, ${pharmacies.length} pharmacies, ${suppliers.length} suppliers)`);

  /* --- People ---------------------------------------------------------- */
  const profileRows = [
    {
      email: 'admin@medibridge.dev',
      password_hash: passwordHash,
      full_name: 'MediBridge Administrator',
      phone: '+918000000000',
      role: ROLES.ADMIN,
      organization_id: null,
    },
  ];

  const FIRST_NAMES = ['Aarav', 'Divya', 'Rohan', 'Meera', 'Karthik', 'Sneha', 'Imran', 'Lakshmi', 'Vikram', 'Anita', 'Joseph', 'Fatima'];
  const LAST_NAMES = ['Rao', 'Nair', 'Sharma', 'Iyer', 'Reddy', 'Khan', 'Dsouza', 'Patel', 'Menon', 'Gowda'];

  // Numbered per type, so the demo accounts are hospital1..20, pharmacy1..30
  // and supplier1..10 - guessable, and matching what the READMEs advertise.
  const perTypeCount = {};

  savedOrganizations.forEach((organization) => {
    const role = organization.type === ORGANIZATION_TYPES.HOSPITAL ? ROLES.HOSPITAL : ROLES.SUPPLIER;
    const slug = organization.type.toLowerCase();
    perTypeCount[slug] = (perTypeCount[slug] || 0) + 1;

    profileRows.push({
      email: `${slug}${perTypeCount[slug]}@medibridge.dev`,
      password_hash: passwordHash,
      full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `+9198${intBetween(10000000, 99999999)}`,
      role,
      organization_id: organization.id,
    });
  });

  // Couriers belong to no organisation - they are assigned per delivery.
  for (let index = 1; index <= 8; index += 1) {
    profileRows.push({
      email: `courier${index}@medibridge.dev`,
      password_hash: passwordHash,
      full_name: `${pick(FIRST_NAMES)} ${pick(LAST_NAMES)}`,
      phone: `+9199${intBetween(10000000, 99999999)}`,
      role: ROLES.DELIVERY,
      organization_id: null,
    });
  }

  const profiles = await db.insertMany(TABLES.PROFILES, profileRows);
  log(`  profiles             ${profiles.length}`);

  /* --- Verification documents ------------------------------------------ */
  const documentRows = savedOrganizations.flatMap((organization) => {
    const owner = profiles.find((profile) => profile.organization_id === organization.id);
    return [
      {
        organization_id: organization.id,
        document_type: 'DRUG_LICENSE',
        document_number: organization.license_number,
        file_url: `https://example.com/medibridge-demo/${organization.id}/drug-license.pdf`,
        issued_by: 'Karnataka State Drugs Control Department',
        expires_on: isoDaysFromNow(intBetween(200, 900)),
        uploaded_by: owner ? owner.id : null,
        notes: 'Demo document. Not a real licence.',
      },
      {
        organization_id: organization.id,
        document_type: 'REGISTRATION_CERTIFICATE',
        document_number: organization.registration_number,
        file_url: `https://example.com/medibridge-demo/${organization.id}/registration.pdf`,
        issued_by: 'Registrar of Firms',
        expires_on: null,
        uploaded_by: owner ? owner.id : null,
        notes: 'Demo document. Not a real certificate.',
      },
    ];
  });
  await db.insertMany(TABLES.VERIFICATION_DOCUMENTS, documentRows);
  log(`  documents            ${documentRows.length}`);

  /* --- Inventory ------------------------------------------------------- */
  const stockHolders = [...pharmacies, ...suppliers, ...hospitals.slice(0, 6)];
  const inventoryRows = [];

  for (const organization of stockHolders) {
    const isSupplier = organization.type === ORGANIZATION_TYPES.SUPPLIER;
    const medicineCount = isSupplier ? intBetween(45, 70) : intBetween(18, 35);

    const chosen = new Set();
    while (chosen.size < medicineCount) chosen.add(Math.floor(random() * medicines.length));

    for (const index of chosen) {
      const medicine = medicines[index];
      const quantity = isSupplier ? intBetween(60, 900) : intBetween(5, 180);

      inventoryRows.push({
        organization_id: organization.id,
        item_type: ITEM_TYPES.MEDICINE,
        medicine_id: medicine.id,
        equipment_id: null,
        batch_number: `B${intBetween(100000, 999999)}`,
        quantity,
        reserved_quantity: 0,
        unit: medicine.form === 'Tablet' || medicine.form === 'Capsule' ? 'strip' : 'unit',
        price: Number(between(8, 2400).toFixed(2)),
        expiry_date: isoDaysFromNow(intBetween(45, 900)),
        storage_requirement:
          medicine.description?.includes('Injection') && random() < 0.3
            ? 'COLD_CHAIN_2_8C'
            : pick(['ROOM_TEMPERATURE', 'COOL_DRY_PLACE']),
        condition: null,
        low_stock_threshold: intBetween(5, 25),
        // Spread of update times so the FRESH / RECENT / STALE demo is real.
        updated_at: minutesAgoIso(intBetween(1, 900)),
      });
    }

    const equipmentCount = isSupplier ? intBetween(10, 20) : intBetween(2, 6);
    const chosenEquipment = new Set();
    while (chosenEquipment.size < equipmentCount) chosenEquipment.add(Math.floor(random() * equipment.length));

    for (const index of chosenEquipment) {
      inventoryRows.push({
        organization_id: organization.id,
        item_type: ITEM_TYPES.EQUIPMENT,
        medicine_id: null,
        equipment_id: equipment[index].id,
        batch_number: null,
        quantity: intBetween(1, 25),
        reserved_quantity: 0,
        unit: 'item',
        price: Number(between(1800, 240000).toFixed(2)),
        expiry_date: null,
        storage_requirement: 'ROOM_TEMPERATURE',
        condition: pick(Object.values(EQUIPMENT_CONDITION)),
        low_stock_threshold: intBetween(1, 4),
        updated_at: minutesAgoIso(intBetween(1, 900)),
      });
    }
  }

  const inventory = await db.insertMany(TABLES.INVENTORY, inventoryRows);
  log(`  inventory            ${inventory.length}`);

  /* --- A little order history ------------------------------------------ */
  // Gives the dashboard something to show and the reliability score something
  // to be computed from.
  const verifiedHospitals = hospitals.filter((org) => org.verification_status === VERIFICATION_STATUS.VERIFIED);
  const verifiedSellers = [...pharmacies, ...suppliers].filter(
    (org) => org.verification_status === VERIFICATION_STATUS.VERIFIED
  );

  const orderRows = [];
  const orderItemRows = [];
  const finishedStatuses = [
    ORDER_STATUS.DELIVERED, ORDER_STATUS.DELIVERED, ORDER_STATUS.DELIVERED,
    ORDER_STATUS.CANCELLED, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.PENDING, ORDER_STATUS.ACCEPTED,
  ];

  for (let index = 0; index < 40; index += 1) {
    const hospital = pick(verifiedHospitals);
    const seller = pick(verifiedSellers);
    if (!hospital || !seller || hospital.id === seller.id) continue;

    const sellerStock = inventory.filter(
      (row) => row.organization_id === seller.id && row.item_type === ITEM_TYPES.MEDICINE
    );
    if (sellerStock.length === 0) continue;

    const status = pick(finishedStatuses);
    const createdAt = minutesAgoIso(intBetween(120, 40000));
    const orderId = undefined; // assigned by the driver
    const lineCount = intBetween(1, 3);

    const order = {
      reference: `MB-DEMO-${String(index + 1).padStart(4, '0')}`,
      hospital_id: hospital.id,
      supplier_id: seller.id,
      created_by: profiles.find((profile) => profile.organization_id === hospital.id)?.id ?? null,
      priority: pick(Object.values(PRIORITY)),
      status,
      total_amount: 0,
      currency: 'INR',
      delivery_address: hospital.address,
      delivery_latitude: hospital.latitude,
      delivery_longitude: hospital.longitude,
      required_by_minutes: pick([null, 30, 60, 120]),
      notes: null,
      cancelled_reason: status === ORDER_STATUS.CANCELLED ? 'Sourced from another supplier in time.' : null,
      status_history: [{ status: ORDER_STATUS.PENDING, at: createdAt, by: null }],
      created_at: createdAt,
      updated_at: createdAt,
      _lines: Array.from({ length: lineCount }, () => {
        const stock = pick(sellerStock);
        const quantity = intBetween(1, 20);
        const unitPrice = Number(stock.price);
        return {
          inventory_id: stock.id,
          item_type: ITEM_TYPES.MEDICINE,
          medicine_id: stock.medicine_id,
          equipment_id: null,
          item_name: medicines.find((medicine) => medicine.id === stock.medicine_id)?.name || 'Medicine',
          quantity,
          unit_price: unitPrice,
          line_total: Number((unitPrice * quantity).toFixed(2)),
        };
      }),
      _orderId: orderId,
    };

    order.total_amount = Number(order._lines.reduce((sum, line) => sum + line.line_total, 0).toFixed(2));
    orderRows.push(order);
  }

  const savedOrders = await db.insertMany(
    TABLES.ORDERS,
    orderRows.map(({ _lines, _orderId, ...order }) => order)
  );

  savedOrders.forEach((order, index) => {
    for (const line of orderRows[index]._lines) {
      orderItemRows.push({ ...line, order_id: order.id, created_at: order.created_at });
    }
  });

  await db.insertMany(TABLES.ORDER_ITEMS, orderItemRows);
  log(`  orders               ${savedOrders.length} (${orderItemRows.length} line items)`);

  return {
    medicines: medicines.length,
    equipment: equipment.length,
    organizations: savedOrganizations.length,
    profiles: profiles.length,
    inventory: inventory.length,
    orders: savedOrders.length,
    demoPassword: DEMO_PASSWORD,
    accounts: {
      admin: 'admin@medibridge.dev',
      hospital: 'hospital1@medibridge.dev',
      pharmacy: 'pharmacy1@medibridge.dev',
      supplier: 'supplier1@medibridge.dev',
      courier: profiles.find((profile) => profile.role === ROLES.DELIVERY)?.email,
    },
  };
}

/** CLI entry point: `npm run seed`. */
async function main() {
  validateEnv();

  const existing = await db.count(TABLES.ORGANIZATIONS, {});
  if (existing > 0 && !process.argv.includes('--force')) {
    console.error(
      `[seed] The database already holds ${existing} organisation(s). Re-run with --force if you really want to add the demo data on top.`
    );
    process.exit(1);
  }

  console.log(`[seed] seeding MediBridge demo data into the ${db.name} database...`);
  const summary = await seed();

  console.log('\n[seed] done. Demo accounts (all share one password):');
  console.log(`  password: ${summary.demoPassword}`);
  console.log(`  admin:    ${summary.accounts.admin}`);
  console.log(`  hospital: ${summary.accounts.hospital}`);
  console.log(`  pharmacy: ${summary.accounts.pharmacy}`);
  console.log(`  supplier: ${summary.accounts.supplier}`);
  console.log(`  courier:  ${summary.accounts.courier}`);

  if (env.dbDriver === 'memory') {
    console.log(
      '\n[seed] NOTE: DB_DRIVER=memory keeps data in this process only, so this seed is gone already.\n' +
        '       Set SEED_ON_START=true to seed the API automatically when it boots instead.'
    );
  }
}

if (require.main === module) {
  main().catch((error) => {
    console.error('[seed] failed:', error);
    process.exit(1);
  });
}

module.exports = { seed, DEMO_PASSWORD };
