'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const { startTestServer } = require('./helpers');
const { isOriginAllowed, canonicaliseOrigin } = require('../src/config/cors');

/**
 * The browser preflights every cross-origin login, so a mishandled OPTIONS
 * request breaks authentication just as thoroughly as a broken password check.
 * helpers.js pins CLIENT_URL to http://localhost:5173 for these tests.
 */

const ALLOWED = 'http://localhost:5173';
const BLOCKED = 'https://not-the-frontend.example.com';

let client;

test.before(async () => {
  client = await startTestServer();
});

test.after(async () => {
  await client.close();
});

/** Raw fetch: the shared helper does not surface response headers. */
function preflight(path, origin, method = 'POST') {
  return fetch(`${client.baseUrl}${path}`, {
    method: 'OPTIONS',
    headers: {
      Origin: origin,
      'Access-Control-Request-Method': method,
      'Access-Control-Request-Headers': 'content-type,authorization',
    },
  });
}

test('preflight for the auth endpoints succeeds with the right CORS headers', async () => {
  for (const path of ['/api/auth/login', '/api/auth/register', '/api/auth/me']) {
    const response = await preflight(path, ALLOWED);

    assert.equal(response.status, 204, `${path} preflight must not 404`);
    assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED);
    assert.equal(response.headers.get('access-control-allow-credentials'), 'true');

    const methods = response.headers.get('access-control-allow-methods') || '';
    for (const method of ['GET', 'POST', 'PATCH', 'DELETE', 'OPTIONS']) {
      assert.ok(methods.includes(method), `${path} must advertise ${method}, got "${methods}"`);
    }

    const headers = (response.headers.get('access-control-allow-headers') || '').toLowerCase();
    assert.ok(headers.includes('content-type'), `${path} must allow Content-Type`);
    assert.ok(headers.includes('authorization'), `${path} must allow Authorization`);
  }
});

test('the allowed origin is echoed back, never a wildcard', async () => {
  const response = await preflight('/api/auth/login', ALLOWED);
  assert.notEqual(response.headers.get('access-control-allow-origin'), '*');
});

test('an unknown origin is refused without CORS headers and without a 500', async () => {
  const response = await preflight('/api/auth/login', BLOCKED);

  assert.equal(response.headers.get('access-control-allow-origin'), null);
  assert.ok(response.status < 500, `policy decisions must not surface as ${response.status}`);
});

test('an actual cross-origin POST carries the allow-origin header', async () => {
  const response = await fetch(`${client.baseUrl}/api/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Origin: ALLOWED },
    body: JSON.stringify({ email: 'nobody@example.com', password: 'wrong-password' }),
  });

  // The credentials are deliberately wrong - what matters is that the browser
  // is allowed to read the 401 rather than seeing an opaque CORS failure.
  assert.equal(response.status, 401);
  assert.equal(response.headers.get('access-control-allow-origin'), ALLOWED);
});

test('preflight on an unknown path is still answered, never routed to 404', async () => {
  const response = await preflight('/api/not-a-real-route', ALLOWED);
  assert.equal(response.status, 204);
});

test('origin matching ignores a trailing slash and letter case', () => {
  assert.equal(canonicaliseOrigin('https://Example.COM/'), 'https://example.com');
  assert.ok(isOriginAllowed(ALLOWED));
  assert.ok(isOriginAllowed(`${ALLOWED}/`));
  assert.ok(isOriginAllowed(ALLOWED.toUpperCase().replace('HTTP://', 'http://')));
  assert.ok(!isOriginAllowed(BLOCKED));
  assert.ok(!isOriginAllowed(''));
});
