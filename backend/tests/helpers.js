'use strict';

/**
 * Test harness.
 *
 * Every test file runs the real API in-process against the in-memory driver,
 * so the assertions exercise the actual routes, middleware and services -
 * nothing is stubbed. `node --test` gives each file its own process, and
 * therefore its own clean database.
 *
 * These assignments must happen before anything under src/ is required,
 * because config/env.js reads process.env once at load time.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';
process.env.DB_DRIVER = 'memory';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-definitely-long-enough-32';
process.env.BCRYPT_SALT_ROUNDS = process.env.BCRYPT_SALT_ROUNDS || '4'; // Fast, tests do not need cost.
process.env.CLIENT_URL = 'http://localhost:5173';

const { validateEnv } = require('../src/config/env');
const { createApp } = require('../src/app');
const db = require('../src/db');
const {
  TABLES,
  ROLES,
  ORGANIZATION_TYPES,
  VERIFICATION_STATUS,
  ITEM_TYPES,
} = require('../src/config/constants');
const { hashPassword } = require('../src/utils/security');

validateEnv();

/** Boots the API on an ephemeral port and returns a client bound to it. */
async function startTestServer() {
  const app = createApp();

  const server = await new Promise((resolve) => {
    const listener = app.listen(0, () => resolve(listener));
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;

  async function request(method, path, { token, body, headers = {} } = {}) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    const text = await response.text();
    let parsed = null;
    try {
      parsed = text ? JSON.parse(text) : null;
    } catch {
      parsed = text;
    }

    return { status: response.status, body: parsed };
  }

  return {
    baseUrl,
    request,
    get: (path, options) => request('GET', path, options),
    post: (path, body, options) => request('POST', path, { ...options, body }),
    patch: (path, body, options) => request('PATCH', path, { ...options, body }),
    delete: (path, options) => request('DELETE', path, options),
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

/* -------------------------------------------------------------------------
 * Fixtures - created directly through the database so a test can start from
 * the state it cares about rather than replaying registration every time.
 * ---------------------------------------------------------------------- */

const TEST_PASSWORD = 'TestPassw0rd!';
let counter = 0;
const nextId = () => {
  counter += 1;
  return counter;
};

async function createOrganization(overrides = {}) {
  const index = nextId();
  return db.insert(TABLES.ORGANIZATIONS, {
    name: `Test Org ${index}`,
    type: ORGANIZATION_TYPES.PHARMACY,
    registration_number: `REG-${index}-${Date.now()}`,
    license_number: `LIC-${index}`,
    phone: '+910000000000',
    email: `org${index}@example.com`,
    address: `${index} Test Street`,
    latitude: 12.9716,
    longitude: 77.5946,
    verification_status: VERIFICATION_STATUS.VERIFIED,
    verification_notes: null,
    verified_at: new Date().toISOString(),
    verified_by: null,
    reliability_score: 80,
    ...overrides,
  });
}

async function createUser({ role = ROLES.HOSPITAL, organizationId = null, ...overrides } = {}) {
  const index = nextId();
  return db.insert(TABLES.PROFILES, {
    email: `user${index}@example.com`,
    password_hash: await hashPassword(TEST_PASSWORD),
    full_name: `Test User ${index}`,
    phone: '+910000000001',
    role,
    organization_id: organizationId,
    ...overrides,
  });
}

/** Signs a user in through the real login endpoint and returns their token. */
async function loginAs(client, profile, password = TEST_PASSWORD) {
  const response = await client.post('/api/auth/login', { email: profile.email, password });
  if (response.status !== 200) {
    throw new Error(`Test login failed for ${profile.email}: ${JSON.stringify(response.body)}`);
  }
  return response.body.data.token;
}

/** An organisation plus a signed-in member of it, which is what most tests need. */
async function createActor({ role = ROLES.HOSPITAL, organization = {}, client } = {}) {
  const org = await createOrganization({
    type: role === ROLES.HOSPITAL ? ORGANIZATION_TYPES.HOSPITAL : ORGANIZATION_TYPES.PHARMACY,
    ...organization,
  });
  const profile = await createUser({ role, organizationId: org.id });
  const token = client ? await loginAs(client, profile) : null;
  return { organization: org, profile, token };
}

async function createMedicine(overrides = {}) {
  const index = nextId();
  return db.insert(TABLES.MEDICINES, {
    name: `Test Medicine ${index}`,
    generic_name: `Generic ${index}`,
    manufacturer: 'Test Pharma',
    category: 'Emergency',
    description: 'Seeded by the test harness.',
    strength: '1mg/ml',
    form: 'Injection',
    requires_prescription: true,
    ...overrides,
  });
}

async function createInventory({ organizationId, medicineId, quantity = 100, ...overrides } = {}) {
  return db.insert(TABLES.INVENTORY, {
    organization_id: organizationId,
    item_type: ITEM_TYPES.MEDICINE,
    medicine_id: medicineId,
    equipment_id: null,
    batch_number: `BATCH-${nextId()}`,
    quantity,
    reserved_quantity: 0,
    unit: 'unit',
    price: 100,
    expiry_date: new Date(Date.now() + 200 * 86400000).toISOString().slice(0, 10),
    storage_requirement: 'ROOM_TEMPERATURE',
    condition: null,
    low_stock_threshold: 5,
    ...overrides,
  });
}

module.exports = {
  startTestServer,
  createOrganization,
  createUser,
  createActor,
  createMedicine,
  createInventory,
  loginAs,
  db,
  TEST_PASSWORD,
};
