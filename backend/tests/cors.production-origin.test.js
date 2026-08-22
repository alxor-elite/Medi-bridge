'use strict';

/**
 * Regression test for the exact production pairing:
 *
 *   frontend  https://medi-bridge-nine.vercel.app   (Vercel)
 *   API       https://medi-bridge-kpb1.onrender.com (Render, CLIENT_URL)
 *
 * Chrome preflights the login POST because it carries a JSON content type, so
 * OPTIONS /api/auth/login must answer 2xx with the right headers or the login
 * never leaves the browser. This pins that behaviour against the real origin
 * rather than a localhost stand-in.
 *
 * Must be set before helpers.js is required: config/env.js reads the
 * environment once, at load time.
 */
process.env.CLIENT_URL = 'https://medi-bridge-nine.vercel.app';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer } = require('./helpers');

const VERCEL_ORIGIN = 'https://medi-bridge-nine.vercel.app';
const AUTH_PATHS = ['/api/auth/login', '/api/auth/register', '/api/auth/me'];

let client;

test.before(async () => {
  client = await startTestServer();
});

test.after(async () => {
  await client.close();
});

/** Exactly what Chrome sends before a cross-origin JSON POST. */
function preflight(path, origin = VERCEL_ORIGIN, method = 'POST') {
  return fetch(`${client.baseUrl}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });
}

test('OPTIONS /api/auth/login from the Vercel origin returns a successful preflight', async () => {
  const response = await preflight('/api/auth/login');

  assert.ok(
    response.status === 204 || response.status === 200,
    `preflight must succeed, got ${response.status}`
  );
  assert.notEqual(response.status, 404, 'preflight must never fall through to the 404 handler');

  assert.equal(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
  assert.equal(response.headers.get('access-control-allow-credentials'), 'true');

  const methods = response.headers.get('access-control-allow-methods') || '';
  assert.ok(methods.includes('POST'), `Allow-Methods must include POST, got "${methods}"`);
  assert.ok(methods.includes('OPTIONS'), `Allow-Methods must include OPTIONS, got "${methods}"`);

  const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase();
  assert.ok(headers.includes('content-type'), `Allow-Headers must include Content-Type, got "${headers}"`);
  assert.ok(headers.includes('authorization'), `Allow-Headers must include Authorization, got "${headers}"`);
});

test('register and me are preflighted from the Vercel origin too', async () => {
  for (const path of AUTH_PATHS) {
    const response = await preflight(path, VERCEL_ORIGIN, path.endsWith('/me') ? 'GET' : 'POST');
    assert.ok(response.status < 300, `${path} preflight returned ${response.status}`);
    assert.equal(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
  }
});

test('the CLIENT_URL value tolerates the trailing-slash form dashboards store', async () => {
  const response = await preflight('/api/auth/login', `${VERCEL_ORIGIN}/`);
  assert.equal(response.headers.get('access-control-allow-origin'), `${VERCEL_ORIGIN}/`);
});

test('a failed login from the Vercel origin is readable by the browser', async () => {
  const response = await fetch(`${client.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: VERCEL_ORIGIN },
    body: JSON.stringify({ email: 'nobody@medibridge.dev', password: 'wrong-password' }),
  });

  // Without the header the browser reports an opaque CORS failure instead of
  // the real reason, which is what "Unable to reach the API" looked like.
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('access-control-allow-origin'), VERCEL_ORIGIN);
});

test('an origin that is not the deployed frontend gets no CORS headers', async () => {
  const response = await preflight('/api/auth/login', 'https://attacker.example.com');
  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.ok(response.status < 500, `policy decisions must not surface as ${response.status}`);
});
