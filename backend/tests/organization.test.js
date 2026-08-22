'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createActor, createUser, loginAs } = require('./helpers');
const { ROLES, VERIFICATION_STATUS } = require('../src/config/constants');

let client;
let adminToken;
let hospital;
let supplier;

test.before(async () => {
  client = await startTestServer();

  const admin = await createUser({ role: ROLES.ADMIN });
  adminToken = await loginAs(client, admin);

  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  supplier = await createActor({ role: ROLES.SUPPLIER, client });
});

test.after(async () => {
  await client.close();
});

test('an organisation\'s private details are hidden from other organisations', async () => {
  const asOwner = await client.get(`/api/organizations/${supplier.organization.id}`, {
    token: supplier.token,
  });
  assert.equal(asOwner.status, 200);
  assert.ok(asOwner.body.data.registrationNumber, 'the owner sees its own registration number');
  assert.ok(asOwner.body.data.licenseNumber);

  const asStranger = await client.get(`/api/organizations/${supplier.organization.id}`, {
    token: hospital.token,
  });
  assert.equal(asStranger.status, 200);
  assert.equal(asStranger.body.data.registrationNumber, undefined);
  assert.equal(asStranger.body.data.licenseNumber, undefined);
  assert.ok(asStranger.body.data.name, 'the public projection still names the organisation');
});

test('an admin sees the private details of any organisation', async () => {
  const response = await client.get(`/api/organizations/${supplier.organization.id}`, { token: adminToken });
  assert.equal(response.status, 200);
  assert.ok(response.body.data.registrationNumber);
});

test('an organisation cannot edit another organisation', async () => {
  const response = await client.patch(
    `/api/organizations/${supplier.organization.id}`,
    { name: 'Hijacked Pharmacy' },
    { token: hospital.token }
  );

  assert.equal(response.status, 403);
});

test('an organisation cannot verify itself through the update endpoint', async () => {
  const pending = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { verification_status: VERIFICATION_STATUS.PENDING },
  });

  await client.patch(
    `/api/organizations/${pending.organization.id}`,
    { verificationStatus: 'VERIFIED', verification_status: 'VERIFIED' },
    { token: pending.token }
  );

  const after = await client.get(`/api/organizations/${pending.organization.id}`, { token: adminToken });
  assert.equal(after.body.data.verificationStatus, 'PENDING', 'verification is not self-service');
});

test('verification documents are private to the organisation and admins', async () => {
  const upload = await client.post(
    `/api/organizations/${supplier.organization.id}/documents`,
    {
      documentType: 'DRUG_LICENSE',
      fileUrl: 'https://example.com/demo/licence.pdf',
      documentNumber: 'LIC-123',
    },
    { token: supplier.token }
  );
  assert.equal(upload.status, 201);

  assert.equal(
    (await client.get(`/api/organizations/${supplier.organization.id}/documents`, { token: supplier.token })).status,
    200
  );
  assert.equal(
    (await client.get(`/api/organizations/${supplier.organization.id}/documents`, { token: adminToken })).status,
    200
  );

  const stranger = await client.get(`/api/organizations/${supplier.organization.id}/documents`, {
    token: hospital.token,
  });
  assert.equal(stranger.status, 403);
});

test('a document upload needs a real link', async () => {
  const response = await client.post(
    `/api/organizations/${supplier.organization.id}/documents`,
    { documentType: 'DRUG_LICENSE', fileUrl: 'not-a-url' },
    { token: supplier.token }
  );

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
});

test('the admin can approve, then suspend, and the organisation is notified each time', async () => {
  const pending = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { verification_status: VERIFICATION_STATUS.PENDING },
  });

  const approved = await client.patch(
    `/api/admin/verifications/${pending.organization.id}`,
    { status: 'VERIFIED', notes: 'Licence checked.' },
    { token: adminToken }
  );
  assert.equal(approved.status, 200);
  assert.equal(approved.body.data.verificationStatus, 'VERIFIED');
  assert.equal(approved.body.data.verificationNotes, 'Licence checked.');
  assert.ok(approved.body.data.verifiedAt);

  const suspended = await client.patch(
    `/api/admin/verifications/${pending.organization.id}`,
    { status: 'SUSPENDED', notes: 'Licence lapsed pending renewal.' },
    { token: adminToken }
  );
  assert.equal(suspended.status, 200);

  const inbox = await client.get('/api/notifications', { token: pending.token });
  const types = inbox.body.data.map((notification) => notification.type);
  assert.ok(types.includes('VERIFICATION_APPROVED'));
  assert.ok(types.includes('VERIFICATION_SUSPENDED'));
});

test('a suspended organisation loses access to trading endpoints', async () => {
  const suspended = await createActor({
    role: ROLES.SUPPLIER,
    client,
    organization: { verification_status: VERIFICATION_STATUS.SUSPENDED },
  });

  const response = await client.get('/api/search/suppliers?medicineName=anything&quantity=1', {
    token: suspended.token,
  });

  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'ORGANIZATION_NOT_VERIFIED');
  assert.match(response.body.error.message, /SUSPENDED/);
});

test('setting the same verification status twice is rejected as a conflict', async () => {
  const response = await client.patch(
    `/api/admin/verifications/${supplier.organization.id}`,
    { status: 'VERIFIED' },
    { token: adminToken }
  );

  assert.equal(response.status, 409);
});

test('a verification decision on a missing organisation returns 404', async () => {
  const response = await client.patch(
    '/api/admin/verifications/00000000-0000-0000-0000-000000000000',
    { status: 'VERIFIED' },
    { token: adminToken }
  );

  assert.equal(response.status, 404);
});

test('only an admin can create an admin account', async () => {
  const bySupplier = await client.post(
    '/api/admin/users',
    { email: 'sneaky@example.com', password: 'Password123', fullName: 'Sneaky', role: 'ADMIN' },
    { token: supplier.token }
  );
  assert.equal(bySupplier.status, 403);

  const byAdmin = await client.post(
    '/api/admin/users',
    { email: 'second-admin@example.com', password: 'Password123', fullName: 'Second Admin', role: 'ADMIN' },
    { token: adminToken }
  );
  assert.equal(byAdmin.status, 201);
  assert.equal(byAdmin.body.data.profile.role, 'ADMIN');
});

test('notifications belong to one user only', async () => {
  const inbox = await client.get('/api/notifications', { token: supplier.token });
  const notification = inbox.body.data[0];

  if (notification) {
    const stealer = await client.patch(`/api/notifications/${notification.id}/read`, {}, { token: hospital.token });
    assert.equal(stealer.status, 403);

    const owner = await client.patch(`/api/notifications/${notification.id}/read`, {}, { token: supplier.token });
    assert.equal(owner.status, 200);
    assert.ok(owner.body.data.read_at);
  }
});
