'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createUser, loginAs, db } = require('./helpers');
const { ROLES, TABLES, ORDER_STATUS, DELIVERY_STATUS } = require('../src/config/constants');

/**
 * The acceptance flow from section 32 of the build brief, start to finish and
 * strictly over HTTP - no fixtures, no reaching into services. If this passes,
 * the MVP does what MediBridge claims:
 *
 *   register -> verify -> stock -> search -> reserve -> order -> deliver
 *
 * The only thing seeded directly is the first administrator, because there is
 * deliberately no public route that mints one.
 */

let client;

test.before(async () => {
  client = await startTestServer();
});

test.after(async () => {
  await client.close();
});

test('the full emergency procurement flow works end to end', async (t) => {
  /* --- 0. The platform administrator ---------------------------------- */
  const adminProfile = await createUser({ role: ROLES.ADMIN, email: 'flow-admin@medibridge.dev' });
  const adminToken = await loginAs(client, adminProfile);

  /* --- 1. A hospital registers ---------------------------------------- */
  const hospitalRegistration = await client.post('/api/auth/register', {
    email: 'flow-hospital@example.com',
    password: 'HospitalPass123',
    fullName: 'Dr Anita Menon',
    phone: '+919800000001',
    role: ROLES.HOSPITAL,
    organization: {
      name: 'Cauvery Emergency Care',
      type: 'HOSPITAL',
      registrationNumber: 'KA-HOS-FLOW-1',
      licenseNumber: 'LIC-HOS-FLOW-1',
      address: 'Indiranagar, Bengaluru',
      latitude: 12.9716,
      longitude: 77.5946,
    },
  });

  assert.equal(hospitalRegistration.status, 201);
  const hospitalOrgId = hospitalRegistration.body.data.organization.id;
  let hospitalToken = hospitalRegistration.body.data.token;
  assert.equal(hospitalRegistration.body.data.organization.verificationStatus, 'PENDING');

  await t.test('an unverified hospital cannot search yet', async () => {
    const blocked = await client.get('/api/search/suppliers?medicineName=anything&quantity=1', {
      token: hospitalToken,
    });
    assert.equal(blocked.status, 403);
    assert.equal(blocked.body.error.code, 'ORGANIZATION_NOT_VERIFIED');
  });

  /* --- 2. The admin verifies the hospital ------------------------------ */
  const documentUpload = await client.post(
    `/api/organizations/${hospitalOrgId}/documents`,
    {
      documentType: 'DRUG_LICENSE',
      documentNumber: 'LIC-HOS-FLOW-1',
      fileUrl: 'https://example.com/demo/hospital-licence.pdf',
      issuedBy: 'Karnataka State Drugs Control Department',
    },
    { token: hospitalToken }
  );
  assert.equal(documentUpload.status, 201);

  const queue = await client.get('/api/admin/verifications?status=PENDING', { token: adminToken });
  assert.equal(queue.status, 200);
  assert.ok(queue.body.data.some((organization) => organization.id === hospitalOrgId));

  const verificationCase = await client.get(`/api/admin/verifications/${hospitalOrgId}`, { token: adminToken });
  assert.equal(verificationCase.status, 200);
  assert.equal(verificationCase.body.data.documents.length, 1);
  assert.equal(verificationCase.body.data.members.length, 1);

  const approveHospital = await client.patch(
    `/api/admin/verifications/${hospitalOrgId}`,
    { status: 'VERIFIED', notes: 'Licence and registration reviewed.' },
    { token: adminToken }
  );
  assert.equal(approveHospital.status, 200);
  assert.equal(approveHospital.body.data.verificationStatus, 'VERIFIED');

  /* --- 3. A supplier registers ----------------------------------------- */
  const supplierRegistration = await client.post('/api/auth/register', {
    email: 'flow-supplier@example.com',
    password: 'SupplierPass123',
    fullName: 'Rohan Rao',
    role: ROLES.SUPPLIER,
    organization: {
      name: 'MedPlus Indiranagar',
      type: 'PHARMACY',
      registrationNumber: 'KA-PHA-FLOW-1',
      address: '100 Feet Road, Indiranagar, Bengaluru',
      latitude: 12.9784, // ~1.2 km from the hospital
      longitude: 77.6008,
    },
  });

  assert.equal(supplierRegistration.status, 201);
  const supplierOrgId = supplierRegistration.body.data.organization.id;
  const supplierToken = supplierRegistration.body.data.token;

  /* --- 4. The admin verifies the supplier ------------------------------ */
  const approveSupplier = await client.patch(
    `/api/admin/verifications/${supplierOrgId}`,
    { status: 'VERIFIED' },
    { token: adminToken }
  );
  assert.equal(approveSupplier.status, 200);

  /* --- 5. The supplier adds a medicine to the catalogue ---------------- */
  const medicine = await client.post(
    '/api/medicines',
    {
      name: 'Adrenor 1mg/ml',
      genericName: 'Adrenaline (Epinephrine)',
      manufacturer: 'Cipla',
      category: 'Emergency',
      strength: '1mg/ml',
      form: 'Injection',
      requiresPrescription: true,
    },
    { token: supplierToken }
  );

  assert.equal(medicine.status, 201);
  const medicineId = medicine.body.data.id;

  await t.test('the catalogue is searchable by name', async () => {
    const found = await client.get('/api/medicines?search=adrenaline', { token: hospitalToken });
    assert.equal(found.status, 200);
    assert.ok(found.body.data.some((item) => item.id === medicineId));
  });

  /* --- 6. The supplier stocks it, then corrects the count -------------- */
  const stock = await client.post(
    '/api/inventory',
    {
      itemType: 'MEDICINE',
      medicineId,
      batchNumber: 'ADR-2026-01',
      quantity: 30,
      price: 240,
      expiryDate: new Date(Date.now() + 300 * 86400000).toISOString().slice(0, 10),
      storageRequirement: 'COLD_CHAIN_2_8C',
    },
    { token: supplierToken }
  );

  assert.equal(stock.status, 201);
  const inventoryId = stock.body.data.id;

  const restock = await client.patch(`/api/inventory/${inventoryId}`, { quantity: 45 }, { token: supplierToken });
  assert.equal(restock.status, 200);
  assert.equal(restock.body.data.quantity, 45);
  assert.equal(restock.body.data.availableQuantity, 45);
  assert.equal(restock.body.data.stockFreshness, 'FRESH');

  /* --- 7-8. The hospital searches -------------------------------------- */
  // The token predates verification, but requireAuth re-reads the profile and
  // organisation on every request, so it now passes.
  hospitalToken = (
    await client.post('/api/auth/login', {
      email: 'flow-hospital@example.com',
      password: 'HospitalPass123',
    })
  ).body.data.token;

  const search = await client.get(
    `/api/search/suppliers?medicineId=${medicineId}&quantity=20&priority=CRITICAL&maximumEtaMinutes=30`,
    { token: hospitalToken }
  );

  assert.equal(search.status, 200);
  const results = search.body.data.results;
  assert.equal(results.length, 1, 'the one verified supplier holding stock should be found');

  const best = results[0];
  assert.equal(best.supplierId, supplierOrgId);
  assert.equal(best.supplierName, 'MedPlus Indiranagar');
  assert.equal(best.verified, true);
  assert.equal(best.stock, 45);
  assert.ok(best.distanceKm > 0 && best.distanceKm < 3, `expected ~1 km, got ${best.distanceKm}`);
  assert.ok(best.estimatedMinutes > 0 && best.estimatedMinutes <= 30);
  assert.equal(best.stockFreshness, 'FRESH');
  assert.ok(best.reliabilityScore >= 0 && best.reliabilityScore <= 100);
  assert.ok(best.recommendationScore >= 0 && best.recommendationScore <= 100);
  assert.equal(best.recommended, true);
  assert.equal(best.meetsDeadline, true);

  /* --- 9. The hospital reserves the stock ------------------------------ */
  const reservation = await client.post(
    '/api/reservations',
    { allocation: best.allocation.map((line) => ({ inventoryId: line.inventoryId, quantity: line.quantity })) },
    { token: hospitalToken }
  );

  assert.equal(reservation.status, 201);
  const reservationGroupId = reservation.body.data.groupId;

  const afterReserve = await db.findById(TABLES.INVENTORY, inventoryId);
  assert.equal(Number(afterReserve.quantity), 45);
  assert.equal(Number(afterReserve.reserved_quantity), 20);

  await t.test('the reserved units disappear from what others can be offered', async () => {
    const secondSearch = await client.get(
      `/api/search/suppliers?medicineId=${medicineId}&quantity=30`,
      { token: hospitalToken }
    );
    // Only 25 of the 45 are still free, so a 30-unit request finds nobody.
    assert.equal(secondSearch.body.data.results.length, 0);
  });

  /* --- 10. The hospital turns the hold into an emergency order --------- */
  const order = await client.post(
    '/api/orders',
    {
      reservationGroupId,
      priority: 'CRITICAL',
      deliveryAddress: 'Emergency Ward, Cauvery Emergency Care, Indiranagar',
      requiredByMinutes: 30,
      notes: 'Cardiac arrest protocol - courier to report to the ER desk.',
    },
    { token: hospitalToken }
  );

  assert.equal(order.status, 201);
  const orderId = order.body.data.id;
  assert.equal(order.body.data.status, ORDER_STATUS.PENDING);
  assert.equal(order.body.data.priority, 'CRITICAL');
  assert.equal(order.body.data.totalAmount, 4800); // 20 x 240
  assert.equal(order.body.data.items[0].name, 'Adrenor 1mg/ml');

  await t.test('the supplier is notified about the new order', async () => {
    const inbox = await client.get('/api/notifications', { token: supplierToken });
    assert.equal(inbox.status, 200);
    assert.ok(inbox.body.data.some((notification) => notification.type === 'ORDER_CREATED'));
  });

  /* --- 11. The supplier accepts and prepares --------------------------- */
  for (const status of [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING]) {
    const step = await client.patch(`/api/orders/${orderId}/status`, { status }, { token: supplierToken });
    assert.equal(step.status, 200, `moving to ${status} failed: ${JSON.stringify(step.body)}`);
  }

  /* --- 12. A courier is assigned and the goods are dispatched ---------- */
  const courierProfile = await createUser({ role: ROLES.DELIVERY, email: 'flow-courier@medibridge.dev' });
  const courierToken = await loginAs(client, courierProfile);

  const delivery = await client.post(
    '/api/deliveries',
    {
      orderId,
      deliveryPartnerId: courierProfile.id,
      vehicleType: 'Two-wheeler',
      vehicleNumber: 'KA-01-AB-1234',
      contactPhone: '+919800000009',
    },
    { token: supplierToken }
  );

  assert.equal(delivery.status, 201);
  const deliveryId = delivery.body.data.id;
  assert.equal(delivery.body.data.status, DELIVERY_STATUS.ASSIGNED);

  const pickedUp = await client.patch(
    `/api/deliveries/${deliveryId}/status`,
    { status: DELIVERY_STATUS.PICKED_UP },
    { token: courierToken }
  );
  assert.equal(pickedUp.status, 200);

  await t.test('picking up dispatches the order and takes the stock off the shelf', async () => {
    const afterDispatch = await db.findById(TABLES.INVENTORY, inventoryId);
    assert.equal(Number(afterDispatch.quantity), 25, '20 of the 45 units have physically left');
    assert.equal(Number(afterDispatch.reserved_quantity), 0);

    const current = await client.get(`/api/orders/${orderId}`, { token: hospitalToken });
    assert.equal(current.body.data.status, ORDER_STATUS.DISPATCHED);
  });

  /* --- The courier reports its position -------------------------------- */
  const location = await client.patch(
    `/api/deliveries/${deliveryId}/location`,
    { latitude: 12.975, longitude: 77.598 },
    { token: courierToken }
  );

  assert.equal(location.status, 200);
  assert.ok(Number(location.body.data.distanceRemainingKm) >= 0);
  assert.ok(location.body.data.estimatedArrival);

  await t.test('only the assigned courier may report the position', async () => {
    const impostor = await client.patch(
      `/api/deliveries/${deliveryId}/location`,
      { latitude: 0, longitude: 0 },
      { token: hospitalToken }
    );
    assert.equal(impostor.status, 403);
  });

  /* --- 13. In transit, then delivered ---------------------------------- */
  const inTransit = await client.patch(
    `/api/deliveries/${deliveryId}/status`,
    { status: DELIVERY_STATUS.IN_TRANSIT },
    { token: courierToken }
  );
  assert.equal(inTransit.status, 200);

  const delivered = await client.patch(
    `/api/deliveries/${deliveryId}/status`,
    { status: DELIVERY_STATUS.DELIVERED },
    { token: courierToken }
  );
  assert.equal(delivered.status, 200);

  /* --- 14. The hospital sees a completed order ------------------------- */
  const finalOrder = await client.get(`/api/orders/${orderId}`, { token: hospitalToken });

  assert.equal(finalOrder.status, 200);
  assert.equal(finalOrder.body.data.status, ORDER_STATUS.DELIVERED);
  assert.equal(finalOrder.body.data.delivery.status, DELIVERY_STATUS.DELIVERED);
  assert.ok(
    finalOrder.body.data.statusHistory.some((entry) => entry.status === ORDER_STATUS.DELIVERED),
    'the timeline records the completion'
  );

  await t.test('the hospital is notified that the order arrived', async () => {
    const inbox = await client.get('/api/notifications', { token: hospitalToken });
    const types = inbox.body.data.map((notification) => notification.type);
    assert.ok(types.includes('ORDER_DELIVERED'));
    assert.ok(types.includes('VERIFICATION_APPROVED'));
  });

  await t.test('the whole flow is on the audit trail', async () => {
    const logs = await client.get('/api/admin/audit-logs?limit=200', { token: adminToken });
    const actions = logs.body.data.map((entry) => entry.action);

    for (const expected of [
      'USER_REGISTERED',
      'ORGANIZATION_CREATED',
      'ORGANIZATION_APPROVED',
      'INVENTORY_CREATED',
      'INVENTORY_UPDATED',
      'RESERVATION_CREATED',
      'ORDER_CREATED',
      'ORDER_STATUS_CHANGED',
      'DELIVERY_CREATED',
    ]) {
      assert.ok(actions.includes(expected), `expected ${expected} on the audit trail`);
    }

    // Section 21: credentials must never reach the audit metadata.
    const serialised = JSON.stringify(logs.body.data);
    assert.ok(!serialised.includes('HospitalPass123'));
    assert.ok(!serialised.includes('password_hash'));
  });
});
