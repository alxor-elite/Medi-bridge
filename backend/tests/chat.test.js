'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { startTestServer, createActor, createMedicine, createInventory } = require('./helpers');
const { env } = require('../src/config/env');
const { ROLES } = require('../src/config/constants');

/**
 * The assistant's failover path.
 *
 * Both providers are stubbed with real HTTP servers rather than mocked
 * modules, so the tests exercise the actual fetch calls, timeouts and status
 * handling in chat.service.js. `env.ai` is read at call time, so each test can
 * point the pipeline at a stub - or at a dead port - without reloading config.
 */

let client;
let hospital;
let supplier;
let adrenaline;

let primary;
let gemini;

/** A stub HTTP server whose handler and call count a test can drive. */
async function stubServer(defaultHandler) {
  const calls = [];
  let handler = defaultHandler;

  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
    });
    req.on('end', () => {
      let parsed = null;
      try {
        parsed = body ? JSON.parse(body) : null;
      } catch {
        parsed = body;
      }
      calls.push({ url: req.url, body: parsed });
      handler(req, res, parsed);
    });
  });

  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));

  return {
    url: `http://127.0.0.1:${server.address().port}`,
    calls,
    reset: () => {
      calls.length = 0;
    },
    /** Swap in a handler for one test. */
    use: (next) => {
      handler = next;
    },
    restore: () => {
      handler = defaultHandler;
    },
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

const json = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify(payload));
};

/** The happy-path primary: the FastAPI contract, answering from the local LLM. */
const healthyPrimary = (req, res) => {
  json(res, 200, { success: true, response: 'Local LLM: yes, adrenaline is in stock.' });
};

/** The happy-path fallback, shaped like a real generateContent response. */
const healthyGemini = (req, res) => {
  json(res, 200, {
    candidates: [{ content: { parts: [{ text: 'Fallback answer from Gemini.' }] } }],
  });
};

test.before(async () => {
  client = await startTestServer();
  hospital = await createActor({ role: ROLES.HOSPITAL, client });
  supplier = await createActor({ role: ROLES.SUPPLIER, client });

  adrenaline = await createMedicine({
    name: 'Adrenor 1mg/ml',
    generic_name: 'Adrenaline (Epinephrine)',
    category: 'Emergency',
  });

  // 160 available units, split across two batches, so the context builder has
  // something to aggregate.
  await createInventory({
    organizationId: supplier.organization.id,
    medicineId: adrenaline.id,
    quantity: 100,
    price: 240,
  });
  await createInventory({
    organizationId: supplier.organization.id,
    medicineId: adrenaline.id,
    quantity: 70,
    reserved_quantity: 10,
    price: 240,
  });

  primary = await stubServer(healthyPrimary);
  gemini = await stubServer(healthyGemini);

  env.ai.serviceUrl = primary.url;
  env.ai.geminiApiBaseUrl = gemini.url;
  env.ai.geminiApiKey = 'test-key-never-leaves-the-server';
  env.ai.primaryTimeoutMs = 2000;
  env.ai.fallbackTimeoutMs = 2000;
});

test.after(async () => {
  await Promise.all([client.close(), primary.close(), gemini.close()]);
});

test.beforeEach(() => {
  primary.restore();
  gemini.restore();
  primary.reset();
  gemini.reset();
  env.ai.serviceUrl = primary.url;
  env.ai.geminiApiBaseUrl = gemini.url;
  env.ai.geminiApiKey = 'test-key-never-leaves-the-server';
});

const ask = (text, token = hospital.token) => client.post('/api/ai/chat', { message: text }, { token });

/* ------------------------------------------------------------------ *
 * TEST 1 - the primary is up
 * ------------------------------------------------------------------ */

test('a healthy primary answers, and the fallback is never called', async () => {
  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.response, 'Local LLM: yes, adrenaline is in stock.');
  assert.equal(response.body.provider, 'local');

  assert.equal(primary.calls.length, 1, 'the primary is called exactly once');
  assert.equal(primary.calls[0].url, '/chat');
  assert.deepEqual(primary.calls[0].body, { message: 'Do we have adrenaline?' });
  assert.equal(gemini.calls.length, 0, 'a working primary must never reach the fallback');
});

test('a slow but successful primary is waited for, not overtaken by the fallback', async () => {
  primary.use((req, res) => {
    setTimeout(() => json(res, 200, { success: true, response: 'Slow local answer.' }), 400);
  });

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.body.provider, 'local');
  assert.equal(response.body.response, 'Slow local answer.');
  assert.equal(gemini.calls.length, 0, 'slowness alone is not a failure');
});

/* ------------------------------------------------------------------ *
 * TEST 2 - the primary is down, so Gemini answers from database context
 * ------------------------------------------------------------------ */

test('a 5xx from the primary hands over to Gemini with real database figures', async () => {
  primary.use((req, res) => json(res, 503, { detail: 'model not loaded' }));

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.response, 'Fallback answer from Gemini.');
  assert.equal(response.body.provider, 'gemini_fallback');

  assert.equal(primary.calls.length, 1, 'the primary is tried once and not retried');
  assert.equal(gemini.calls.length, 1, 'the fallback is called once');

  // The context handed to Gemini must be real rows, read from the database.
  const prompt = gemini.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Medicine: Adrenor 1mg\/ml/);
  assert.match(prompt, /Generic: Adrenaline \(Epinephrine\)/);
  assert.match(prompt, /Category: Emergency/);
  assert.match(prompt, /Available: 160 units/, '100 + (70 - 10 reserved) = 160, from the inventory table');
  assert.match(prompt, new RegExp(supplier.organization.name));

  // And the instruction that stops it inventing anything must be present.
  const system = gemini.calls[0].body.system_instruction.parts[0].text;
  assert.match(system, /Never invent or estimate inventory figures/);
});

test('an unreachable primary hands over to Gemini', async () => {
  // Port 1 is reserved and refuses connections immediately.
  env.ai.serviceUrl = 'http://127.0.0.1:1';

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 200);
  assert.equal(response.body.provider, 'gemini_fallback');
  assert.equal(gemini.calls.length, 1);
});

test('a primary that times out hands over to Gemini', async () => {
  env.ai.primaryTimeoutMs = 150;
  primary.use((req, res) => {
    setTimeout(() => json(res, 200, { success: true, response: 'too late' }), 1200);
  });

  try {
    const response = await ask('Do we have adrenaline?');
    assert.equal(response.body.provider, 'gemini_fallback');
    assert.equal(gemini.calls.length, 1);
  } finally {
    env.ai.primaryTimeoutMs = 2000;
  }
});

test('an inference exception reported by the primary hands over to Gemini', async () => {
  primary.use((req, res) => json(res, 200, { success: false, error: 'CUDA out of memory' }));

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.body.provider, 'gemini_fallback');
  assert.equal(gemini.calls.length, 1);
});

test('an empty or unparseable answer from the primary hands over to Gemini', async () => {
  primary.use((req, res) => json(res, 200, { success: true, response: '   ' }));
  const empty = await ask('Do we have adrenaline?');
  assert.equal(empty.body.provider, 'gemini_fallback');

  primary.use((req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/html' });
    res.end('<html>ngrok interstitial</html>');
  });
  const garbage = await ask('Do we have adrenaline?');
  assert.equal(garbage.body.provider, 'gemini_fallback');

  assert.equal(gemini.calls.length, 2);
});

test('the fallback is told it cannot verify inventory when no rows back the question', async () => {
  primary.use((req, res) => json(res, 500, { detail: 'down' }));

  const response = await ask('Where is order MB-DEMO-0001?');

  assert.equal(response.body.provider, 'gemini_fallback');
  const prompt = gemini.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Live inventory is unavailable/);
  // Nothing resembling a stock figure may be handed over.
  assert.doesNotMatch(prompt, /Available: \d/);
});

/* ------------------------------------------------------------------ *
 * TEST 3 - both providers are down
 * ------------------------------------------------------------------ */

test('both providers down returns one clean unavailable message', async () => {
  primary.use((req, res) => json(res, 502, { detail: 'bad gateway' }));
  gemini.use((req, res) => json(res, 500, { error: { message: 'backend error' } }));

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    success: false,
    message: 'MediBridge AI is temporarily unavailable. Please try again shortly.',
  });

  // Primary -> fallback -> error. Never primary -> fallback -> primary.
  assert.equal(primary.calls.length, 1);
  assert.equal(gemini.calls.length, 1);
});

test('a missing GEMINI_API_KEY fails closed rather than answering unguarded', async () => {
  primary.use((req, res) => json(res, 500, { detail: 'down' }));
  env.ai.geminiApiKey = '';

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
  assert.equal(gemini.calls.length, 0, 'no key means no call, not a call without one');
});

test('a fallback that returns no candidate text is a failure, not an empty answer', async () => {
  primary.use((req, res) => json(res, 500, { detail: 'down' }));
  gemini.use((req, res) => json(res, 200, { promptFeedback: { blockReason: 'SAFETY' } }));

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 503);
  assert.equal(response.body.message, 'MediBridge AI is temporarily unavailable. Please try again shortly.');
});

/* ------------------------------------------------------------------ *
 * Guard rails
 * ------------------------------------------------------------------ */

test('a 4xx from the primary is passed back, not papered over by the fallback', async () => {
  primary.use((req, res) => json(res, 400, { success: false, message: 'Message too long.' }));

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 400);
  assert.equal(response.body.success, false);
  assert.equal(response.body.message, 'Message too long.');
  assert.equal(gemini.calls.length, 0, 'a bad request is not an outage');
});

test('the assistant requires a session, like every other AI route', async () => {
  const response = await client.post('/api/ai/chat', { message: 'Do we have adrenaline?' });
  assert.equal(response.status, 401);
  assert.equal(primary.calls.length, 0);
});

test('an empty message is rejected by validation before any provider is called', async () => {
  const response = await ask('   ');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(primary.calls.length, 0);
  assert.equal(gemini.calls.length, 0);
});

test('the Gemini key is sent as a header and never echoed to the client', async () => {
  primary.use((req, res) => json(res, 500, { detail: 'down' }));

  let sawKeyHeader = false;
  let sawKeyInUrl = false;
  gemini.use((req, res) => {
    sawKeyHeader = req.headers['x-goog-api-key'] === 'test-key-never-leaves-the-server';
    sawKeyInUrl = req.url.includes('test-key-never-leaves-the-server');
    healthyGemini(req, res);
  });

  const response = await ask('Do we have adrenaline?');

  assert.equal(sawKeyHeader, true);
  assert.equal(sawKeyInUrl, false);
  assert.doesNotMatch(JSON.stringify(response.body), /test-key-never-leaves-the-server/);
});
