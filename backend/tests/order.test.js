'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createActor, createMedicine, createInventory, db } = require('./helpers');
const { ROLES, TABLES, ORDER_STATUS } = require('../src/config/constants');

let client;
let hospital;
let otherHospital;
let supplier;
let otherSupplier;
let medicine;

test.before(async () => {
  client = await startTestServer();
  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  otherHospital = await createActor({ role: ROLES.HOSPITAL, client });
  supplier = await createActor({ role: ROLES.SUPPLIER, client });
  otherSupplier = await createActor({ role: ROLES.SUPPLIER, client });
  medicine = await createMedicine();
});

test.after(async () => {
  await client.close();
});

/** Places an order straight from inventory lines, reserving them on the way. */
async function placeOrder({ quantity = 10, price = 50, token = hospital.token } = {}) {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 200,
    price,
  });

  const response = await client.post(
    '/api/orders',
    {
      items: [{ inventoryId: stock.id, quantity }],
      priority: 'CRITICAL',
      deliveryAddress: 'Emergency Ward, Test Hospital',
    },
    { token }
  );

  return { response, stock };
}

test('a hospital can place an order, and it starts PENDING with a priced line', async () => {
  const { response } = await placeOrder({ quantity: 10, price: 50 });

  assert.equal(response.status, 201);
  const order = response.body.data;

  assert.equal(order.status, ORDER_STATUS.PENDING);
  assert.equal(order.priority, 'CRITICAL');
  assert.equal(order.hospitalId, hospital.organization.id);
  assert.equal(order.supplierId, supplier.organization.id);
  assert.equal(order.totalAmount, 500);
  assert.equal(order.items.length, 1);
  assert.equal(order.items[0].quantity, 10);
  assert.ok(order.reference.startsWith('MB-'));
});

test('placing an order reserves the stock but does not remove it yet', async () => {
  const { response, stock } = await placeOrder({ quantity: 25 });
  assert.equal(response.status, 201);

  const row = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(row.quantity), 200, 'the goods are still on the shelf until dispatch');
  assert.equal(Number(row.reserved_quantity), 25);
});

test('an order for more than exists is refused and nothing is reserved', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 5,
  });

  const response = await client.post(
    '/api/orders',
    { items: [{ inventoryId: stock.id, quantity: 500 }] },
    { token: hospital.token }
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'INVENTORY_NOT_AVAILABLE');

  const row = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(row.reserved_quantity), 0);
});

test('the happy path walks PENDING to DELIVERED', async () => {
  const { response, stock } = await placeOrder({ quantity: 10 });
  const orderId = response.body.data.id;

  const steps = [
    { status: ORDER_STATUS.ACCEPTED, token: supplier.token },
    { status: ORDER_STATUS.PREPARING, token: supplier.token },
    { status: ORDER_STATUS.DISPATCHED, token: supplier.token },
    { status: ORDER_STATUS.OUT_FOR_DELIVERY, token: supplier.token },
    { status: ORDER_STATUS.DELIVERED, token: hospital.token },
  ];

  for (const step of steps) {
    const result = await client.patch(`/api/orders/${orderId}/status`, { status: step.status }, { token: step.token });
    assert.equal(result.status, 200, `moving to ${step.status} failed: ${JSON.stringify(result.body)}`);
    assert.equal(result.body.data.status, step.status);
  }

  // Dispatch is where the goods physically leave the shelf.
  const row = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(row.quantity), 190);
  assert.equal(Number(row.reserved_quantity), 0);

  const final = await client.get(`/api/orders/${orderId}`, { token: hospital.token });
  assert.equal(final.body.data.status, ORDER_STATUS.DELIVERED);
  assert.equal(final.body.data.statusHistory.length, 6, 'every step is recorded');
});

test('a delivered order cannot go back to PREPARING', async () => {
  const { response } = await placeOrder();
  const orderId = response.body.data.id;

  for (const status of ['ACCEPTED', 'PREPARING', 'DISPATCHED', 'OUT_FOR_DELIVERY', 'DELIVERED']) {
    await client.patch(`/api/orders/${orderId}/status`, { status }, { token: supplier.token });
  }

  const backwards = await client.patch(
    `/api/orders/${orderId}/status`,
    { status: ORDER_STATUS.PREPARING },
    { token: supplier.token }
  );

  assert.equal(backwards.status, 409);
  assert.equal(backwards.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('an order cannot skip straight from PENDING to DELIVERED', async () => {
  const { response } = await placeOrder();

  const skipped = await client.patch(
    `/api/orders/${response.body.data.id}/status`,
    { status: ORDER_STATUS.DELIVERED },
    { token: supplier.token }
  );

  assert.equal(skipped.status, 409);
  assert.equal(skipped.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('a hospital cannot accept or dispatch its own order', async () => {
  const { response } = await placeOrder();
  const orderId = response.body.data.id;

  const accepted = await client.patch(
    `/api/orders/${orderId}/status`,
    { status: ORDER_STATUS.ACCEPTED },
    { token: hospital.token }
  );

  assert.equal(accepted.status, 403);
  assert.match(accepted.body.error.message, /SUPPLIER/);
});

test('an unrelated supplier cannot touch someone else\'s order', async () => {
  const { response } = await placeOrder();
  const orderId = response.body.data.id;

  const hijack = await client.patch(
    `/api/orders/${orderId}/status`,
    { status: ORDER_STATUS.ACCEPTED },
    { token: otherSupplier.token }
  );

  assert.equal(hijack.status, 403);
});

test('an unrelated hospital cannot even read the order', async () => {
  const { response } = await placeOrder();

  const peek = await client.get(`/api/orders/${response.body.data.id}`, { token: otherHospital.token });
  assert.equal(peek.status, 403);
});

test('cancelling before dispatch returns the reserved stock', async () => {
  const { response, stock } = await placeOrder({ quantity: 40 });
  const orderId = response.body.data.id;

  const before = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(before.reserved_quantity), 40);

  const cancelled = await client.patch(
    `/api/orders/${orderId}/status`,
    { status: ORDER_STATUS.CANCELLED, reason: 'Sourced elsewhere in time.' },
    { token: hospital.token }
  );

  assert.equal(cancelled.status, 200);
  assert.equal(cancelled.body.data.status, ORDER_STATUS.CANCELLED);
  assert.equal(cancelled.body.data.cancelledReason, 'Sourced elsewhere in time.');

  const after = await db.findById(TABLES.INVENTORY, stock.id);
  assert.equal(Number(after.quantity), 200);
  assert.equal(Number(after.reserved_quantity), 0, 'a cancelled order must free the stock again');
});

test('an order lists only for the two parties involved', async () => {
  await placeOrder();

  const hospitalView = await client.get('/api/orders', { token: hospital.token });
  const supplierView = await client.get('/api/orders', { token: supplier.token });
  const strangerView = await client.get('/api/orders', { token: otherHospital.token });

  assert.ok(hospitalView.body.data.length > 0);
  assert.ok(supplierView.body.data.length > 0);
  assert.ok(
    hospitalView.body.data.every((order) => order.hospitalId === hospital.organization.id),
    'a hospital sees only its own orders'
  );
  assert.equal(strangerView.body.data.length, 0, 'an uninvolved hospital sees nothing');
});

test('an unknown status value is rejected before it reaches the service', async () => {
  const { response } = await placeOrder();

  const bogus = await client.patch(
    `/api/orders/${response.body.data.id}/status`,
    { status: 'TELEPORTED' },
    { token: supplier.token }
  );

  assert.equal(bogus.status, 400);
  assert.equal(bogus.body.error.code, 'VALIDATION_ERROR');
});

test('an order for a nonexistent id returns 404', async () => {
  const response = await client.get('/api/orders/00000000-0000-0000-0000-000000000000', {
    token: hospital.token,
  });
  assert.equal(response.status, 404);
});
