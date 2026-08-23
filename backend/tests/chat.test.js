'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { startTestServer, createActor, createMedicine, createInventory } = require('./helpers');
const { env } = require('../src/config/env');
const chatService = require('../src/services/chat.service');
const { ROLES } = require('../src/config/constants');

/**
 * The assistant.
 *
 * Gemini is stubbed with a real HTTP server rather than a mocked module, so
 * these tests exercise the actual fetch call, request body, timeout and status
 * handling in chat.service.js. `env.ai` is read at call time, so a test can
 * point the pipeline at the stub - or at a dead port - without reloading
 * config.
 */

let client;
let hospital;
let supplier;
let adrenaline;
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
      calls.push({ url: req.url, headers: req.headers, body: parsed });
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

/** The happy path, shaped like a real generateContent response. */
const healthyGemini = (req, res) => {
  json(res, 200, {
    candidates: [{ content: { parts: [{ text: 'Yes, adrenaline is available.' }] } }],
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

  // 160 available units across two batches, so the context builder has
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

  gemini = await stubServer(healthyGemini);
});

test.after(async () => {
  await Promise.all([client.close(), gemini.close()]);
});

test.beforeEach(() => {
  gemini.restore();
  gemini.reset();
  env.ai.geminiApiBaseUrl = gemini.url;
  env.ai.geminiApiKey = 'test-key-never-leaves-the-server';
  env.ai.geminiModel = 'gemini-2.5-flash';
  env.ai.timeoutMs = 2000;
});

const ask = (text, token = hospital.token) => client.post('/api/ai/chat', { message: text }, { token });

/* ------------------------------------------------------------------ *
 * The happy path
 * ------------------------------------------------------------------ */

test('a question is answered by Gemini in the existing response shape', async () => {
  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 200);
  assert.equal(response.body.success, true);
  assert.equal(response.body.response, 'Yes, adrenaline is available.');
  assert.equal(response.body.provider, 'gemini');

  assert.equal(gemini.calls.length, 1, 'exactly one outbound call per request');
});

test('the question and live database figures both reach the model', async () => {
  await ask('Do we have adrenaline?');

  const prompt = gemini.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /USER QUESTION:\nDo we have adrenaline\?/);
  assert.match(prompt, /Medicine: Adrenor 1mg\/ml/);
  assert.match(prompt, /Generic: Adrenaline \(Epinephrine\)/);
  assert.match(prompt, /Category: Emergency/);
  assert.match(prompt, /Available: 160 units/, '100 + (70 - 10 reserved) = 160, from the inventory table');
  assert.match(prompt, new RegExp(supplier.organization.name));

  const system = gemini.calls[0].body.system_instruction.parts[0].text;
  assert.match(system, /Never invent or estimate inventory figures/);
});

test('the caller’s own stock is marked as theirs', async () => {
  await ask('Do we have adrenaline?', supplier.token);

  const prompt = gemini.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /own organisation/);
});

/* ------------------------------------------------------------------ *
 * No database context
 * ------------------------------------------------------------------ */

test('a question with no matching rows is told live inventory is unavailable', async () => {
  await ask('Where is order MB-DEMO-0001?');

  const prompt = gemini.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Live inventory is unavailable/);
  // Nothing resembling a stock figure may be handed over.
  assert.doesNotMatch(prompt, /Available: \d/);
});

test('the model is told to stay useful on general questions', async () => {
  // Rule 2 must not turn "how do reservations work?" into "I cannot verify
  // live inventory".
  await ask('How do reservations work?');

  const system = gemini.calls[0].body.system_instruction.parts[0].text;
  assert.match(system, /If the question is a general one/);
  assert.match(system, /not a reason to be\n?\s*unhelpful/);
});

test('a medicine nobody stocks reports zero rather than silence', async () => {
  const orphan = await createMedicine({ name: 'Zeroxin 5mg', generic_name: 'Zeroxin' });
  assert.ok(orphan.id);

  await ask('Do we have Zeroxin?');

  const prompt = gemini.calls[0].body.contents[0].parts[0].text;
  assert.match(prompt, /Medicine: Zeroxin 5mg/);
  assert.match(prompt, /Available: 0 units/);
});

/* ------------------------------------------------------------------ *
 * Failure
 * ------------------------------------------------------------------ */

test('a Gemini outage returns one clean 503', async () => {
  gemini.use((req, res) => json(res, 500, { error: { message: 'backend error' } }));

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 503);
  assert.deepEqual(response.body, {
    success: false,
    message: 'MediBridge AI is temporarily unavailable. Please try again shortly.',
  });
  assert.equal(gemini.calls.length, 1, 'one attempt, no retry loop');
});

test('an unreachable API returns the same clean 503', async () => {
  // Port 1 is reserved and refuses connections immediately.
  env.ai.geminiApiBaseUrl = 'http://127.0.0.1:1';

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 503);
  assert.equal(response.body.success, false);
});

test('a timeout returns the same clean 503', async () => {
  env.ai.timeoutMs = 150;
  gemini.use((req, res) => {
    setTimeout(() => json(res, 200, { candidates: [] }), 1200);
  });

  const response = await ask('Do we have adrenaline?');
  assert.equal(response.status, 503);
});

test('a missing GEMINI_API_KEY fails closed rather than calling unauthenticated', async () => {
  env.ai.geminiApiKey = '';

  const response = await ask('Do we have adrenaline?');

  assert.equal(response.status, 503);
  assert.equal(gemini.calls.length, 0, 'no key means no call, not a call without one');
});

test('a response with no candidate text is a failure, not an empty answer', async () => {
  gemini.use((req, res) => json(res, 200, { promptFeedback: { blockReason: 'SAFETY' } }));

  const response = await ask('Do we have adrenaline?');
  assert.equal(response.status, 503);
  assert.equal(response.body.message, 'MediBridge AI is temporarily unavailable. Please try again shortly.');
});

test('an API error is reported by reason, but never to the caller', async () => {
  gemini.use((req, res) =>
    json(res, 400, { error: { code: 400, status: 'INVALID_ARGUMENT', message: 'API key not valid.' } })
  );

  const response = await ask('Do we have adrenaline?');
  assert.equal(response.status, 503);

  const direct = await chatService.askGemini('hello', null);
  assert.equal(direct.ok, false);
  assert.match(direct.reason, /API key not valid/);
  assert.match(direct.reason, /INVALID_ARGUMENT/);
  assert.doesNotMatch(JSON.stringify(response.body), /API key/);
});

/* ------------------------------------------------------------------ *
 * Configuration
 * ------------------------------------------------------------------ */

test('Gemini 2.5 is told not to spend its output budget thinking', async () => {
  // 2.5 bills thinking tokens against maxOutputTokens; a model that thinks
  // through the whole budget returns no text and drops the request.
  await ask('Do we have adrenaline?');

  const config = gemini.calls[0].body.generationConfig;
  assert.deepEqual(config.thinkingConfig, { thinkingBudget: 0 });
  assert.equal(config.maxOutputTokens, 1024);
});

test('a model that is not 2.5 is not sent a field it would reject', async () => {
  env.ai.geminiModel = 'gemini-2.0-flash';

  await ask('Do we have adrenaline?');
  assert.equal(gemini.calls[0].body.generationConfig.thinkingConfig, undefined);
});

test('the model defaults to gemini-2.5-flash and the key comes from the environment', async () => {
  // These tests mutate the shared env object, so read the shipped defaults
  // from a clean load of the config and put the cache back afterwards.
  const modulePath = require.resolve('../src/config/env');
  const cached = require.cache[modulePath];
  delete require.cache[modulePath];

  try {
    const fresh = require('../src/config/env').env;
    assert.equal(fresh.ai.geminiModel, 'gemini-2.5-flash');
    assert.equal(fresh.ai.geminiApiKey, (process.env.GEMINI_API_KEY || '').trim());
    // The self-hosted primary is gone from the configuration entirely.
    assert.equal(fresh.ai.serviceUrl, undefined);
    assert.equal(fresh.ai.primaryTimeoutMs, undefined);
  } finally {
    require.cache[modulePath] = cached;
  }
});

/* ------------------------------------------------------------------ *
 * Guard rails
 * ------------------------------------------------------------------ */

test('the key is sent as a header and never echoed to the client', async () => {
  const response = await ask('Do we have adrenaline?');

  assert.equal(gemini.calls[0].headers['x-goog-api-key'], 'test-key-never-leaves-the-server');
  assert.doesNotMatch(gemini.calls[0].url, /test-key-never-leaves-the-server/);
  assert.doesNotMatch(JSON.stringify(response.body), /test-key-never-leaves-the-server/);
});

test('the assistant requires a session, like every other AI route', async () => {
  const response = await client.post('/api/ai/chat', { message: 'Do we have adrenaline?' });
  assert.equal(response.status, 401);
  assert.equal(gemini.calls.length, 0);
});

test('an empty message is rejected by validation before the model is called', async () => {
  const response = await ask('   ');

  assert.equal(response.status, 400);
  assert.equal(response.body.error.code, 'VALIDATION_ERROR');
  assert.equal(gemini.calls.length, 0);
});

test('diagnostics reports the provider and never echoes the key', async () => {
  const admin = await createActor({ role: ROLES.ADMIN, client });
  const response = await client.get('/api/ai/diagnostics', { token: admin.token });

  assert.equal(response.status, 200);
  const data = response.body.data;

  assert.equal(data.provider, 'gemini');
  assert.equal(data.configured, true);
  assert.equal(data.model, 'gemini-2.5-flash');
  assert.equal(data.reachable, true);
  assert.equal(data.assistantAnswers, true);

  assert.doesNotMatch(JSON.stringify(response.body), /test-key-never-leaves-the-server/);
});

test('diagnostics is admin only', async () => {
  const response = await client.get('/api/ai/diagnostics', { token: hospital.token });
  assert.equal(response.status, 403);
});
