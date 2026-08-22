'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer, createActor, createUser, TEST_PASSWORD } = require('./helpers');
const { ROLES } = require('../src/config/constants');

let client;

test.before(async () => {
  client = await startTestServer();
});

test.after(async () => {
  await client.close();
});

test('health endpoint answers without a token', async () => {
  const response = await client.get('/api/health');
  assert.equal(response.status, 200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.service, 'MediBridge API');
});

test('registering a hospital creates a PENDING organisation and returns a token', async () => {
  const response = await client.post('/api/auth/register', {
    email: 'newhospital@example.com',
    password: 'SuperSecret123',
    fullName: 'Dr Meera Nair',
    role: ROLES.HOSPITAL,
    organization: {
      name: 'Test City Hospital',
      type: 'HOSPITAL',
      registrationNumber: 'REG-NEW-1',
      latitude: 12.97,
      longitude: 77.59,
    },
  });

  assert.equal(response.status, 201);
  assert.ok(response.body.data.token, 'a token should be issued');
  assert.equal(response.body.data.organization.verificationStatus, 'PENDING');
  // The password hash must never appear in a response.
  assert.equal(response.body.data.profile.password_hash, undefined);
});

test('registration rejects a weak password and a bad email', async () => {
  const response = await client.post('/api/auth/register', {
    email: 'not-an-email',
    password: 'short',
    fullName: 'Test',
    role: ROLES.HOSPITAL,
  });

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.ok(response.body.error.details.length >= 2);
});

test('an email cannot be registered twice', async () => {
  const payload = {
    email: 'duplicate@example.com',
    password: 'SuperSecret123',
    fullName: 'First Signup',
    role: ROLES.DELIVERY,
  };

  assert.equal((await client.post('/api/auth/register', payload)).status, 201);

  const second = await client.post('/api/auth/register', payload);
  assert.equal(second.status, 409);
  assert.equal(second.body.error.code, 'EMAIL_IN_USE');
});

test('nobody can register themselves as an ADMIN', async () => {
  const response = await client.post('/api/auth/register', {
    email: 'wannabe-admin@example.com',
    password: 'SuperSecret123',
    fullName: 'Wannabe Admin',
    role: ROLES.ADMIN,
  });

  // ADMIN is not in the public role list, so validation refuses it first.
  assert.equal(response.status, 400);
});

test('a HOSPITAL account must have an organisation', async () => {
  const response = await client.post('/api/auth/register', {
    email: 'orphan-hospital@example.com',
    password: 'SuperSecret123',
    fullName: 'Orphan Hospital',
    role: ROLES.HOSPITAL,
  });

  assert.equal(response.status, 400);
  assert.match(response.body.error.message, /organisation/i);
});

test('login succeeds with the right password and fails with the wrong one', async () => {
  const profile = await createUser({ role: ROLES.DELIVERY });

  const good = await client.post('/api/auth/login', { email: profile.email, password: TEST_PASSWORD });
  assert.equal(good.status, 200);
  assert.ok(good.body.data.token);

  const bad = await client.post('/api/auth/login', { email: profile.email, password: 'WrongPassword1' });
  assert.equal(bad.status, 401);
  assert.equal(bad.body.error.code, 'INVALID_CREDENTIALS');
});

test('login does not reveal whether an email is registered', async () => {
  const profile = await createUser({ role: ROLES.DELIVERY });

  const wrongPassword = await client.post('/api/auth/login', {
    email: profile.email,
    password: 'WrongPassword1',
  });
  const unknownEmail = await client.post('/api/auth/login', {
    email: 'nobody-here@example.com',
    password: 'WrongPassword1',
  });

  assert.equal(wrongPassword.status, unknownEmail.status);
  assert.equal(wrongPassword.body.error.message, unknownEmail.body.error.message);
});

test('protected routes reject missing, malformed and forged tokens', async () => {
  assert.equal((await client.get('/api/auth/me')).status, 401);
  assert.equal((await client.get('/api/auth/me', { token: 'garbage' })).status, 401);

  const forged =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiJmYWtlIiwicm9sZSI6IkFETUlOIn0.not-a-real-signature';
  assert.equal((await client.get('/api/auth/me', { token: forged })).status, 401);
});

test('GET /api/auth/me returns the caller and their organisation', async () => {
  const hospital = await createActor({ role: ROLES.HOSPITAL, client });

  const response = await client.get('/api/auth/me', { token: hospital.token });
  assert.equal(response.status, 200);
  assert.equal(response.body.data.profile.email, hospital.profile.email);
  assert.equal(response.body.data.organization.id, hospital.organization.id);
  assert.equal(response.body.data.profile.password_hash, undefined);
});

test('a hospital cannot reach the admin verification queue', async () => {
  const hospital = await createActor({ role: ROLES.HOSPITAL, client });

  const response = await client.get('/api/admin/verifications', { token: hospital.token });
  assert.equal(response.status, 403);
  assert.equal(response.body.error.code, 'FORBIDDEN');
});

test('changing a password requires the current one and then works', async () => {
  const actor = await createActor({ role: ROLES.HOSPITAL, client });

  const wrong = await client.post(
    '/api/auth/change-password',
    { currentPassword: 'NotMyPassword1', newPassword: 'BrandNewPass1' },
    { token: actor.token }
  );
  assert.equal(wrong.status, 400);

  const right = await client.post(
    '/api/auth/change-password',
    { currentPassword: TEST_PASSWORD, newPassword: 'BrandNewPass1' },
    { token: actor.token }
  );
  assert.equal(right.status, 200);

  const relogin = await client.post('/api/auth/login', {
    email: actor.profile.email,
    password: 'BrandNewPass1',
  });
  assert.equal(relogin.status, 200);
});

test('a malformed JSON body is a 400, not a 500 with a stack trace', async () => {
  // Truncated payload - what a shell that mangles quoting actually sends.
  const broken = await fetch(`${client.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: '{"email":"a@b.com","password":',
  });
  const body = await broken.json();

  assert.equal(broken.status, 400);
  assert.equal(body.success, false);
  assert.equal(body.error.code, 'VALIDATION_ERROR');
  assert.equal(body.error.debug, undefined, 'no stack trace should be returned');
});

test('an oversized body is rejected with 413, not 500', async () => {
  const huge = await fetch(`${client.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'a@b.com', password: 'x'.repeat(2 * 1024 * 1024) }),
  });

  assert.equal(huge.status, 413);
  assert.equal((await huge.json()).error.code, 'VALIDATION_ERROR');
});
