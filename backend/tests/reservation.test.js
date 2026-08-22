'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createActor, createMedicine, createInventory, db } = require('./helpers');
const reservationService = require('../src/services/reservation.service');
const { ROLES, TABLES, RESERVATION_STATUS } = require('../src/config/constants');

let client;
let hospital;
let otherHospital;
let supplier;
let medicine;

test.before(async () => {
  client = await startTestServer();
  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  otherHospital = await createActor({ role: ROLES.HOSPITAL, client });
  supplier = await createActor({ role: ROLES.SUPPLIER, client });
  medicine = await createMedicine();
});

test.after(async () => {
  await client.close();
});

const availableOf = async (id) => {
  const row = await db.findById(TABLES.INVENTORY, id);
  return Number(row.quantity) - Number(row.reserved_quantity);
};

test('reserving 20 of 50 leaves 30 available', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 50,
  });

  const response = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 20 },
    { token: hospital.token }
  );

  assert.equal(response.status, 201);
  assert.equal(response.body.data.reservations.length, 1);
  assert.equal(response.body.data.reservations[0].quantity, 20);
  assert.equal(response.body.data.reservations[0].status, 'ACTIVE');
  assert.ok(response.body.data.expiresAt);

  const row = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(row.quantity), 50, 'total stock does not change on reservation');
  assert.equal(Number(row.reserved_quantity), 20);
  assert.equal(await availableOf(stock.id), 30);
});

test('a reservation larger than what is available is refused', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 10,
  });

  const response = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 25 },
    { token: hospital.token }
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'INVENTORY_NOT_AVAILABLE');
  assert.equal(await availableOf(stock.id), 10, 'a refused reservation must not move any stock');
});

test('concurrent reservations can never oversell the same batch', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 100,
  });

  // Ten hospitals all grab 30 units at once. Only three can win.
  const attempts = Array.from({ length: 10 }, () =>
    client.post('/api/reservations', { inventoryId: stock.id, quantity: 30 }, { token: hospital.token })
  );
  const results = await Promise.all(attempts);

  const granted = results.filter((result) => result.status === 201);
  const refused = results.filter((result) => result.status === 409);

  assert.equal(granted.length, 3, 'exactly three 30-unit holds fit into 100 units');
  assert.equal(refused.length, 7);

  const row = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(row.reserved_quantity), 90);
  assert.ok(Number(row.reserved_quantity) <= Number(row.quantity), 'stock must never be oversold');
  assert.equal(await availableOf(stock.id), 10);
});

test('a multi-batch reservation is all or nothing', async () => {
  const good = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 40,
  });
  const short = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 2,
  });

  const response = await client.post(
    '/api/reservations',
    {
      allocation: [
        { inventoryId: good.id, quantity: 30 },
        { inventoryId: short.id, quantity: 30 }, // This line cannot be filled.
      ],
    },
    { token: hospital.token }
  );

  assert.equal(response.status, 409);
  // The first line must have been rolled back, not left stranded.
  assert.equal(await availableOf(good.id), 40);
  assert.equal(await availableOf(short.id), 2);
});

test('releasing a reservation gives the stock straight back', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 30,
  });

  const created = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 25 },
    { token: hospital.token }
  );
  assert.equal(await availableOf(stock.id), 5);

  const reservationId = created.body.data.reservations[0].id;
  const released = await client.delete(`/api/reservations/${reservationId}`, { token: hospital.token });

  assert.equal(released.status, 200);
  assert.equal(released.body.data.status, 'RELEASED');
  assert.equal(await availableOf(stock.id), 30);
});

test('an expired reservation is swept and its stock returned', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 20,
  });

  const created = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 15 },
    { token: hospital.token }
  );
  const reservationId = created.body.data.reservations[0].id;
  assert.equal(await availableOf(stock.id), 5);

  // Wind the clock past the hold's expiry.
  await db.update(TABLES.RESERVATIONS, reservationId, {
    expires_at: new Date(Date.now() - 60000).toISOString(),
  });

  const swept = await reservationService.expireDue();
  assert.ok(swept >= 1);

  const reservation = await db.findById(TABLES.RESERVATIONS, reservationId);
  assert.equal(reservation.status, RESERVATION_STATUS.EXPIRED);
  assert.equal(await availableOf(stock.id), 20, 'expired holds must not keep stock hostage');
});

test('an expired reservation cannot be turned into an order', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 20,
  });

  const created = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 5 },
    { token: hospital.token }
  );
  const reservationId = created.body.data.reservations[0].id;

  await db.update(TABLES.RESERVATIONS, reservationId, {
    expires_at: new Date(Date.now() - 60000).toISOString(),
  });

  const order = await client.post(
    '/api/orders',
    { reservationIds: [reservationId] },
    { token: hospital.token }
  );

  assert.equal(order.status, 409);
  assert.equal(order.body.error.code, 'RESERVATION_EXPIRED');
});

test('one hospital cannot release another hospital\'s reservation', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 30,
  });

  const created = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 10 },
    { token: hospital.token }
  );
  const reservationId = created.body.data.reservations[0].id;

  const response = await client.delete(`/api/reservations/${reservationId}`, {
    token: otherHospital.token,
  });

  assert.equal(response.status, 403);
  assert.equal(await availableOf(stock.id), 20, 'the hold must survive the failed attempt');
});

test('an organisation cannot reserve stock from its own shelf', async () => {
  const stock = await createInventory({
    organizationId: hospital.organization.id,
    medicineId: medicine.id,
    quantity: 30,
  });

  const response = await client.post(
    '/api/reservations',
    { inventoryId: stock.id, quantity: 5 },
    { token: hospital.token }
  );

  assert.equal(response.status, 400);
});

test('reserving against a batch that does not exist returns 404', async () => {
  const response = await client.post(
    '/api/reservations',
    { inventoryId: '00000000-0000-0000-0000-000000000000', quantity: 1 },
    { token: hospital.token }
  );

  assert.equal(response.status, 404);
});

test('a supplier sees the holds placed against its own stock', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 60,
  });
  await client.post('/api/reservations', { inventoryId: stock.id, quantity: 7 }, { token: hospital.token });

  const response = await client.get('/api/reservations?status=ACTIVE', { token: supplier.token });

  assert.equal(response.status, 200);
  assert.ok(response.body.data.some((reservation) => reservation.inventoryId === stock.id));
});
