'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createActor, createMedicine, createInventory } = require('./helpers');
const { ROLES, VERIFICATION_STATUS, ORGANIZATION_TYPES } = require('../src/config/constants');

let client;
let hospital;
let medicine;

/** The hospital sits at the city centre; suppliers are placed around it. */
const ORIGIN = { latitude: 12.9716, longitude: 77.5946 };

test.before(async () => {
  client = await startTestServer();

  hospital = await createActor({
    role: ROLES.HOSPITAL,
    client,
    organization: { type: ORGANIZATION_TYPES.HOSPITAL, ...ORIGIN },
  });

  medicine = await createMedicine({ name: 'Adrenor 1mg/ml', generic_name: 'Adrenaline (Epinephrine)' });
});

test.after(async () => {
  await client.close();
});

test('search finds a verified supplier with enough stock and ranks it', async () => {
  const near = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { name: 'Nearby Pharmacy', latitude: 12.9756, longitude: 77.5996 },
  });
  await createInventory({
    organizationId: near.organization.id,
    medicineId: medicine.id,
    quantity: 45,
    price: 100,
  });

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=20`, {
    token: hospital.token,
  });

  assert.equal(response.status, 200);
  const [best] = response.body.data.results;

  assert.ok(best, 'a supplier should be found');
  assert.equal(best.supplierId, near.organization.id);
  assert.equal(best.verified, true);
  assert.equal(best.stock, 45);
  assert.ok(best.distanceKm > 0 && best.distanceKm < 5, `expected a short distance, got ${best.distanceKm}`);
  assert.ok(best.estimatedMinutes > 0);
  assert.equal(best.stockFreshness, 'FRESH');
  assert.ok(best.recommendationScore >= 0 && best.recommendationScore <= 100);
  assert.equal(best.recommended, true);
  // The allocation tells the frontend exactly what to reserve next.
  assert.equal(best.allocation.reduce((sum, line) => sum + line.quantity, 0), 20);
});

test('unverified organisations never appear in results', async () => {
  const pending = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: {
      name: 'Unverified Depot',
      verification_status: VERIFICATION_STATUS.PENDING,
      latitude: 12.9718,
      longitude: 77.5948,
    },
  });
  await createInventory({
    organizationId: pending.organization.id,
    medicineId: medicine.id,
    quantity: 5000, // Enormous stock, right next door - and still excluded.
    price: 1,
  });

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=20`, {
    token: hospital.token,
  });

  const ids = response.body.data.results.map((result) => result.supplierId);
  assert.ok(!ids.includes(pending.organization.id), 'a PENDING organisation must not be offered');
});

test('suppliers without enough available stock are excluded', async () => {
  const thin = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { name: 'Nearly Empty Chemist', latitude: 12.972, longitude: 77.595 },
  });
  await createInventory({
    organizationId: thin.organization.id,
    medicineId: medicine.id,
    quantity: 3,
  });

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=50`, {
    token: hospital.token,
  });

  const ids = response.body.data.results.map((result) => result.supplierId);
  assert.ok(!ids.includes(thin.organization.id));
});

test('stock already reserved by someone else does not count as available', async () => {
  const supplier = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { name: 'Fully Committed Pharmacy', latitude: 12.9722, longitude: 77.5952 },
  });
  await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 60,
    reserved_quantity: 55, // Only 5 genuinely free.
  });

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=20`, {
    token: hospital.token,
  });

  const ids = response.body.data.results.map((result) => result.supplierId);
  assert.ok(!ids.includes(supplier.organization.id));
});

test('expired batches are never offered', async () => {
  const supplier = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { name: 'Expired Stock Store', latitude: 12.9724, longitude: 77.5954 },
  });
  await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 500,
    expiry_date: new Date(Date.now() - 86400000).toISOString().slice(0, 10),
  });

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=20`, {
    token: hospital.token,
  });

  const ids = response.body.data.results.map((result) => result.supplierId);
  assert.ok(!ids.includes(supplier.organization.id));
});

test('a closer supplier outranks a far one, all else being equal', async () => {
  const closeBy = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { name: 'Across The Road', latitude: 12.9726, longitude: 77.5956 },
  });
  const farAway = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { name: 'Other Side Of Town', latitude: 13.15, longitude: 77.75 },
  });

  for (const organization of [closeBy.organization, farAway.organization]) {
    await createInventory({ organizationId: organization.id, medicineId: medicine.id, quantity: 200, price: 100 });
  }

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=10&limit=50`, {
    token: hospital.token,
  });

  const results = response.body.data.results;
  const closeIndex = results.findIndex((result) => result.supplierId === closeBy.organization.id);
  const farIndex = results.findIndex((result) => result.supplierId === farAway.organization.id);

  assert.ok(closeIndex !== -1 && farIndex !== -1);
  assert.ok(closeIndex < farIndex, 'the nearer supplier should rank higher');
  assert.ok(results[closeIndex].distanceKm < results[farIndex].distanceKm);
  assert.ok(results[closeIndex].estimatedMinutes < results[farIndex].estimatedMinutes);
});

test('a maximum ETA marks who can and cannot make it in time', async () => {
  const response = await client.get(
    `/api/search/suppliers?medicineId=${medicine.id}&quantity=10&maximumEtaMinutes=10&limit=50`,
    { token: hospital.token }
  );

  const results = response.body.data.results;
  assert.ok(results.length > 0);

  for (const result of results) {
    assert.equal(result.meetsDeadline, result.estimatedMinutes <= 10);
    if (result.recommended) {
      assert.equal(result.meetsDeadline, true, 'nothing that misses the deadline may be recommended');
    }
  }
});

test('searching by name works, for the AI parser and a plain search box', async () => {
  const response = await client.get('/api/search/suppliers?medicineName=Adrenor&quantity=5', {
    token: hospital.token,
  });

  assert.equal(response.status, 200);
  assert.equal(response.body.data.query.itemId, medicine.id);
  assert.ok(response.body.data.results.length > 0);
});

test('a medicine nobody stocks returns an empty result, not an invented one', async () => {
  const unstocked = await createMedicine({ name: 'Nobody Stocks This 10mg' });

  const response = await client.get(`/api/search/suppliers?medicineId=${unstocked.id}&quantity=1`, {
    token: hospital.token,
  });

  assert.equal(response.status, 200);
  assert.deepEqual(response.body.data.results, []);
  assert.equal(response.body.data.meta.candidatesConsidered, 0);
});

test('search requires a verified organisation', async () => {
  const pending = await createActor({
    role: ROLES.HOSPITAL,
    client,
    organization: { verification_status: VERIFICATION_STATUS.PENDING },
  });

  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=1`, {
    token: pending.token,
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'ORGANIZATION_NOT_VERIFIED');
});

test('search rejects a nonsensical quantity', async () => {
  const response = await client.get(`/api/search/suppliers?medicineId=${medicine.id}&quantity=0`, {
    token: hospital.token,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});
