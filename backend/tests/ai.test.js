'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createActor, createMedicine, createInventory } = require('./helpers');
const { ROLES } = require('../src/config/constants');

let client;
let hospital;
let supplier;
let adrenaline;

test.before(async () => {
  client = await startTestServer();
  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  supplier = await createActor({ role: ROLES.SUPPLIER, client });

  adrenaline = await createMedicine({
    name: 'Adrenor 1mg/ml',
    generic_name: 'Adrenaline (Epinephrine)',
    category: 'Emergency',
  });
  await createMedicine({ name: 'Dolo 650mg', generic_name: 'Paracetamol', category: 'Analgesic' });

  await createInventory({
    organizationId: supplier.organization.id,
    medicineId: adrenaline.id,
    quantity: 120,
    price: 240,
  });
});

test.after(async () => {
  await client.close();
});

test('the brief\'s example sentence parses into the documented structure', async () => {
  const response = await client.post(
    '/api/ai/parse-request',
    { text: 'We urgently need 20 adrenaline injections within 30 minutes.' },
    { token: hospital.token }
  );

  assert.equal(response.status, 200);
  const parsed = response.body.data;

  assert.equal(parsed.quantity, 20);
  assert.equal(parsed.maximumEtaMinutes, 30);
  assert.equal(parsed.priority, 'CRITICAL');
  assert.equal(parsed.confidence, 'HIGH');
  // The medicine is resolved against the real catalogue, never invented.
  assert.equal(parsed.medicineId, adrenaline.id);
  assert.match(parsed.genericName, /Adrenaline/i);
});

test('the deadline is not mistaken for the quantity', async () => {
  const response = await client.post(
    '/api/ai/parse-request',
    { text: 'Need paracetamol 650mg, 15 strips, in 2 hours' },
    { token: hospital.token }
  );

  const parsed = response.body.data;
  assert.equal(parsed.quantity, 15, 'the strength and the deadline must not be read as the count');
  assert.equal(parsed.maximumEtaMinutes, 120);
});

test('urgency is read from the wording as well as the clock', async () => {
  const critical = await client.post(
    '/api/ai/parse-request',
    { text: 'Cardiac arrest in the ICU, need adrenaline immediately' },
    { token: hospital.token }
  );
  assert.equal(critical.body.data.priority, 'CRITICAL');

  const routine = await client.post(
    '/api/ai/parse-request',
    { text: 'Please restock 40 units of Dolo when convenient' },
    { token: hospital.token }
  );
  assert.equal(routine.body.data.priority, 'NORMAL');
  assert.equal(routine.body.data.quantity, 40);
});

test('a medicine that is not in the catalogue is reported, not invented', async () => {
  const response = await client.post(
    '/api/ai/parse-request',
    { text: 'We need 10 units of Unobtainium Elixir right away' },
    { token: hospital.token }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.medicineId, null);
  assert.equal(response.body.data.medicine, null);
  assert.ok(response.body.data.unresolved.includes('medicine'));
  assert.equal(response.body.data.confidence, 'LOW');
});

test('parsed requests feed the ordinary search, and every fact comes from the database', async () => {
  const response = await client.post(
    '/api/ai/emergency-search',
    { text: 'Critical: we need 20 adrenaline within 30 minutes' },
    { token: hospital.token }
  );

  assert.equal(response.status, 200);
  assert.equal(response.body.data.parsed.quantity, 20);

  const [best] = response.body.data.results;
  assert.ok(best, 'the real search should find the seeded supplier');
  assert.equal(best.supplierId, supplier.organization.id);
  assert.equal(best.stock, 120, 'stock comes from the inventory table, not from the parser');
  assert.equal(best.unitPrice, 240);
});

test('an unmatchable request is refused rather than searched blindly', async () => {
  const response = await client.post(
    '/api/ai/emergency-search',
    { text: 'send help please' },
    { token: hospital.token }
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /catalogue/i);
});

test('empty text is rejected by validation', async () => {
  const response = await client.post('/api/ai/parse-request', { text: '' }, { token: hospital.token });
  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('the shortage forecast reports days of cover and refuses other organisations', async () => {
  const own = await client.get('/api/ai/shortage-forecast', { token: supplier.token });
  assert.equal(own.status, 200);
  assert.ok(Array.isArray(own.body.data.items));

  const item = own.body.data.items.find((entry) => entry.medicineId === adrenaline.id);
  assert.ok(item);
  assert.equal(item.availableQuantity, 120);
  // No delivered orders yet, so there is no usage to project from - and the
  // forecast must say so rather than implying infinite cover.
  assert.equal(item.predictedDaysRemaining, null);
  assert.equal(item.risk, 'NO_RECENT_USAGE');

  const other = await client.get(
    `/api/ai/shortage-forecast?organizationId=${supplier.organization.id}`,
    { token: hospital.token }
  );
  assert.equal(other.status, 403);
});
