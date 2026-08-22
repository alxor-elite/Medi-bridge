'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startTestServer,
  createActor,
  createMedicine,
  createInventory,
  db,
} = require('./helpers');
const { ROLES, VERIFICATION_STATUS, TABLES } = require('../src/config/constants');

let client;
let supplier;
let otherSupplier;
let hospital;
let medicine;

test.before(async () => {
  client = await startTestServer();
  supplier = await createActor({ role: ROLES.SUPPLIER, client });
  otherSupplier = await createActor({ role: ROLES.SUPPLIER, client });
  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  medicine = await createMedicine({ name: 'Adrenor 1mg/ml' });
});

test.after(async () => {
  await client.close();
});

test('a supplier can add stock and read it back with a freshness label', async () => {
  const created = await client.post(
    '/api/inventory',
    { itemType: 'MEDICINE', medicineId: medicine.id, quantity: 50, price: 120, batchNumber: 'B-1' },
    { token: supplier.token }
  );

  assert.equal(created.status, 201);
  assert.equal(created.body.data.quantity, 50);
  assert.equal(created.body.data.availableQuantity, 50);
  assert.equal(created.body.data.reservedQuantity, 0);
  // Just written, so it must be FRESH.
  assert.equal(created.body.data.stockFreshness, 'FRESH');
  assert.ok(created.body.data.lastUpdated);
});

test('stock that has not been touched for hours reports as STALE', async () => {
  const row = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    updated_at: new Date(Date.now() - 8 * 3600 * 1000).toISOString(),
  });

  const response = await client.get(`/api/inventory/${row.id}`, { token: supplier.token });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.stockFreshness, 'STALE');
  assert.ok(response.body.data.minutesSinceUpdate >= 480);
});

test('stock updated a couple of hours ago reports as RECENT', async () => {
  const row = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    updated_at: new Date(Date.now() - 2 * 3600 * 1000).toISOString(),
  });

  const response = await client.get(`/api/inventory/${row.id}`, { token: supplier.token });
  assert.equal(response.body.data.stockFreshness, 'RECENT');
});

test('adding stock rejects a negative quantity and a negative price', async () => {
  const response = await client.post(
    '/api/inventory',
    { itemType: 'MEDICINE', medicineId: medicine.id, quantity: -5, price: -1 },
    { token: supplier.token }
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('stock cannot point at a medicine that does not exist', async () => {
  const response = await client.post(
    '/api/inventory',
    { itemType: 'MEDICINE', medicineId: '00000000-0000-0000-0000-000000000000', quantity: 5 },
    { token: supplier.token }
  );

  assert.equal(response.status, 404);
});

test('a supplier cannot edit or delete another supplier\'s inventory', async () => {
  const row = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
  });

  const edit = await client.patch(`/api/inventory/${row.id}`, { quantity: 999 }, { token: otherSupplier.token });
  assert.equal(edit.status, 403);
  assert.equal(edit.body.error.code, 'FORBIDDEN');

  const remove = await client.delete(`/api/inventory/${row.id}`, { token: otherSupplier.token });
  assert.equal(remove.status, 403);

  // And the row is untouched.
  const unchanged = await db.findById(TABLES.INVENTORY, row.id);
  assert.equal(Number(unchanged.quantity), 100);
});

test('a hospital cannot modify a supplier\'s inventory', async () => {
  const row = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
  });

  const response = await client.patch(`/api/inventory/${row.id}`, { quantity: 1 }, { token: hospital.token });
  assert.equal(response.status, 403);
});

test('quantity cannot be dropped below what is already reserved', async () => {
  const row = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 40,
  });
  await db.reserveStock(row.id, 30);

  const response = await client.patch(`/api/inventory/${row.id}`, { quantity: 10 }, { token: supplier.token });

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'INVENTORY_NOT_AVAILABLE');

  // Setting it to exactly the reserved amount is still allowed.
  const allowed = await client.patch(`/api/inventory/${row.id}`, { quantity: 30 }, { token: supplier.token });
  assert.equal(allowed.status, 200);
  assert.equal(allowed.body.data.availableQuantity, 0);
});

test('a batch with live reservations cannot be deleted', async () => {
  const row = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 20,
  });
  await db.reserveStock(row.id, 5);

  const response = await client.delete(`/api/inventory/${row.id}`, { token: supplier.token });
  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'INVENTORY_NOT_AVAILABLE');
});

test('an unverified organisation cannot add stock', async () => {
  const pending = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { verification_status: VERIFICATION_STATUS.PENDING },
  });

  const response = await client.post(
    '/api/inventory',
    { itemType: 'MEDICINE', medicineId: medicine.id, quantity: 10 },
    { token: pending.token }
  );

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'ORGANIZATION_NOT_VERIFIED');
});

test('another organisation reads a public projection without batch numbers', async () => {
  await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    batch_number: 'SECRET-BATCH',
  });

  const own = await client.get(`/api/inventory?organizationId=${supplier.organization.id}`, {
    token: supplier.token,
  });
  assert.ok(own.body.data.some((item) => item.batchNumber === 'SECRET-BATCH'));

  const foreign = await client.get(`/api/inventory?organizationId=${supplier.organization.id}`, {
    token: hospital.token,
  });
  assert.equal(foreign.status, 200);
  assert.ok(foreign.body.data.length > 0);
  assert.ok(
    foreign.body.data.every((item) => item.batchNumber === undefined),
    'batch numbers must not leak to other organisations'
  );
});

test('inventory for a missing item returns a clean 404', async () => {
  const response = await client.get('/api/inventory/00000000-0000-0000-0000-000000000000', {
    token: supplier.token,
  });
  assert.equal(response.status, 404);
  assert.equal(response.body.error.code, 'NOT_FOUND');
  assert.equal(response.body.success, false);
});
