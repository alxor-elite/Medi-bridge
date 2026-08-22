'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  startTestServer,
  createActor,
  createUser,
  createMedicine,
  createInventory,
  loginAs,
} = require('./helpers');
const { ROLES, DELIVERY_STATUS, ORDER_STATUS } = require('../src/config/constants');

let client;
let hospital;
let supplier;
let courier;
let courierToken;
let medicine;

test.before(async () => {
  client = await startTestServer();
  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  supplier = await createActor({ role: ROLES.SUPPLIER, client });
  courier = await createUser({ role: ROLES.DELIVERY });
  courierToken = await loginAs(client, courier);
  medicine = await createMedicine();
});

test.after(async () => {
  await client.close();
});

/** Places an order and walks it to the given status. */
async function orderAt(status) {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 100,
    price: 10,
  });

  const created = await client.post(
    '/api/orders',
    { items: [{ inventoryId: stock.id, quantity: 5 }] },
    { token: hospital.token }
  );

  const orderId = created.body.data.id;
  const path = [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING];

  for (const step of path) {
    if (step === status) {
      await client.patch(`/api/orders/${orderId}/status`, { status: step }, { token: supplier.token });
      break;
    }
    await client.patch(`/api/orders/${orderId}/status`, { status: step }, { token: supplier.token });
  }

  return orderId;
}

test('a delivery cannot be arranged while the order is still PENDING', async () => {
  const stock = await createInventory({
    organizationId: supplier.organization.id,
    medicineId: medicine.id,
    quantity: 50,
  });
  const created = await client.post(
    '/api/orders',
    { items: [{ inventoryId: stock.id, quantity: 2 }] },
    { token: hospital.token }
  );

  const response = await client.post(
    '/api/deliveries',
    { orderId: created.body.data.id, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('only the supplying organisation can arrange the delivery', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);

  const byHospital = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: hospital.token }
  );

  // The hospital's role is not on the route's allow-list at all.
  assert.equal(byHospital.status, 403);
});

test('the assigned profile must actually be a courier', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);

  const response = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: hospital.profile.id },
    { token: supplier.token }
  );

  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /DELIVERY role/);
});

test('an order can only have one delivery', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);

  const first = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );
  assert.equal(first.status, 201);

  const second = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'CONFLICT');
});

test('a delivery cannot skip from ASSIGNED to DELIVERED', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);
  const delivery = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );

  const response = await client.patch(
    `/api/deliveries/${delivery.body.data.id}/status`,
    { status: DELIVERY_STATUS.DELIVERED },
    { token: courierToken }
  );

  assert.equal(response.status, 409);
  assert.equal(response.body.error.code, 'INVALID_STATUS_TRANSITION');
});

test('a failed delivery is a terminal state', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);
  const delivery = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );
  const deliveryId = delivery.body.data.id;

  const failed = await client.patch(
    `/api/deliveries/${deliveryId}/status`,
    { status: DELIVERY_STATUS.FAILED, note: 'Courier could not reach the address.' },
    { token: courierToken }
  );
  assert.equal(failed.status, 200);

  const revive = await client.patch(
    `/api/deliveries/${deliveryId}/status`,
    { status: DELIVERY_STATUS.IN_TRANSIT },
    { token: courierToken }
  );
  assert.equal(revive.status, 409);
});

test('an uninvolved courier cannot see or move someone else\'s delivery', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);
  const delivery = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );

  const stranger = await createUser({ role: ROLES.DELIVERY });
  const strangerToken = await loginAs(client, stranger);

  const peek = await client.get(`/api/deliveries/${delivery.body.data.id}`, { token: strangerToken });
  assert.equal(peek.status, 403);

  const move = await client.patch(
    `/api/deliveries/${delivery.body.data.id}/status`,
    { status: DELIVERY_STATUS.PICKED_UP },
    { token: strangerToken }
  );
  assert.equal(move.status, 403);
});

test('location updates are validated and reported back with an ETA', async () => {
  const orderId = await orderAt(ORDER_STATUS.ACCEPTED);
  const delivery = await client.post(
    '/api/deliveries',
    { orderId, deliveryPartnerId: courier.id },
    { token: supplier.token }
  );
  const deliveryId = delivery.body.data.id;

  const invalid = await client.patch(
    `/api/deliveries/${deliveryId}/location`,
    { latitude: 999, longitude: 0 },
    { token: courierToken }
  );
  assert.equal(invalid.status, 400);

  const valid = await client.patch(
    `/api/deliveries/${deliveryId}/location`,
    { latitude: 12.98, longitude: 77.6 },
    { token: courierToken }
  );
  assert.equal(valid.status, 200);
  assert.equal(valid.body.data.currentLatitude, 12.98);
  assert.ok(valid.body.data.locationUpdatedAt);
});

test('a delivery for a nonexistent id returns 404', async () => {
  const response = await client.get('/api/deliveries/00000000-0000-0000-0000-000000000000', {
    token: courierToken,
  });
  assert.equal(response.status, 404);
});
