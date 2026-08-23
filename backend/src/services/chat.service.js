'use strict';

const db = require('../db');
const { env } = require('../config/env');
const { parseEmergencyRequest } = require('./ai.service');
const { TABLES, ITEM_TYPES, VERIFICATION_STATUS } = require('../config/constants');

/**
 * The assistant's /chat pipeline.
 *
 * MediBridge's own AI - the self-hosted LLM behind the FastAPI service - is
 * and remains the primary. It is the only one with live tool access to the
 * database. This module exists so that a dead tunnel, a crashed model or an
 * inference exception does not leave a hospital staring at an error box during
 * an emergency.
 *
 *   tryPrimaryAi(message)
 *     -> success: return it, untouched
 *     -> failure: tryDatabaseContext(message)
 *                 tryGeminiFallback(message, context)
 *                 -> failure: one clean "temporarily unavailable"
 *
 * Three rules govern the design:
 *
 *  1. The path is strictly linear - primary, then fallback, then error. There
 *     is no retry and no route back into the primary, so a failing primary can
 *     never produce a loop: exactly one outbound call per provider per request.
 *  2. Slowness is not failure. The primary gets a full timeout budget to
 *     answer (AI_PRIMARY_TIMEOUT_MS, 30s by default) and only a real fault -
 *     unreachable, 5xx, timeout, inference error, empty or unparseable body -
 *     hands over to the fallback.
 *  3. The fallback never invents inventory. Gemini has no tool access, so it
 *     is handed a structured block of real database rows to speak from, and is
 *     instructed to say it cannot verify live inventory when that block is
 *     missing. See buildFallbackPrompt().
 */

/** The single message the frontend shows when neither provider can answer. */
const UNAVAILABLE_MESSAGE = 'MediBridge AI is temporarily unavailable. Please try again shortly.';

/** Sentinel used when no database facts could be gathered for the question. */
const NO_CONTEXT =
  'Live inventory is unavailable. No database figures could be read for this question.';

/**
 * Pipeline logging.
 *
 * These lines are operational, not debug. When the assistant fails on a
 * deployed instance they are the only record of which provider dropped the
 * request and why, so they are printed in production too - a silent pipeline
 * is exactly what makes a 503 impossible to diagnose from a hosting log.
 * Only the test run is quiet, to keep its output readable.
 *
 * Never pass a key, a token or a full prompt through here.
 */
function log(line) {
  if (env.isTest) return;
  console.log(`[AI] ${line}`);
}

/* -------------------------------------------------------------------------
 * 1. Primary: the existing MediBridge AI (FastAPI -> self-hosted LLM)
 * ---------------------------------------------------------------------- */

/** Pull the reply text out of whatever shape the FastAPI service returned. */
function readReply(payload) {
  if (typeof payload === 'string') return payload.trim() || null;
  if (!payload || typeof payload !== 'object') return null;

  for (const key of ['response', 'reply', 'answer', 'message']) {
    const value = payload[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Call the primary service exactly once.
 *
 * Resolves to `{ ok: true, payload, reply }` or `{ ok: false, reason }`, where
 * `reason` is a short human sentence written for the production log rather
 * than an enum - "HTTP 404" and "timeout after 30000ms" are the difference
 * between a five-minute fix and an afternoon.
 *
 * Every failure hands over to the fallback. A dead Colab session, a rotated
 * ngrok hostname and a crashed model all look different on the wire (404 from
 * ngrok's offline page, a hung socket, a 500) and none of them is a reason to
 * leave a hospital without an answer.
 */
async function tryPrimaryAi(message) {
  const baseUrl = env.ai.serviceUrl;
  if (!baseUrl) {
    return { ok: false, reason: 'AI_SERVICE_URL is not set' };
  }

  let response;
  let body;

  try {
    response = await fetch(`${baseUrl}/chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // ngrok's free tier serves an HTML interstitial without this header.
        'ngrok-skip-browser-warning': 'true',
      },
      body: JSON.stringify({ message }),
      signal: AbortSignal.timeout(env.ai.primaryTimeoutMs),
    });
    body = await response.text();
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (timedOut) return { ok: false, reason: `timeout after ${env.ai.primaryTimeoutMs}ms` };
    return { ok: false, reason: `unreachable (${(error && error.message) || 'connection failed'})` };
  }

  if (!response.ok) {
    // Includes ngrok's own 404 "endpoint offline" page, which is what a
    // stopped Colab notebook actually looks like from here.
    return { ok: false, reason: `HTTP ${response.status}` };
  }

  let payload = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    // An HTML error page or a truncated stream: unusable either way.
    return { ok: false, reason: 'the service did not return JSON' };
  }

  // The service reporting its own failure - typically an inference exception
  // raised inside the model call and caught by FastAPI.
  if (payload && payload.success === false) {
    const detail = payload.error || payload.message || 'no detail given';
    return { ok: false, reason: `inference error (${detail})` };
  }

  const reply = readReply(payload);
  if (!reply) return { ok: false, reason: 'empty response' };

  return { ok: true, payload, reply };
}

/* -------------------------------------------------------------------------
 * 2. Database context for the fallback
 * ---------------------------------------------------------------------- */

const availableUnits = (row) => Math.max(0, Number(row.quantity) - Number(row.reserved_quantity));

/**
 * Read the real database rows behind the question, so the fallback has facts
 * to speak from instead of a blank memory.
 *
 * The medicine is resolved through the existing rule-based parser, which can
 * only return a row that exists in the catalogue - it cannot conjure a
 * product. Stock is then aggregated per organisation from the inventory table
 * and restricted to verified organisations, which is exactly what a verified
 * caller can already read through GET /api/inventory.
 *
 * Never throws: a failure here must degrade the answer, not the request.
 */
async function tryDatabaseContext(message, actor = null) {
  try {
    const parsed = await parseEmergencyRequest(message);
    if (!parsed.medicineId) {
      return { available: false, reason: 'NO_MEDICINE_MATCH' };
    }

    const medicine = await db.findById(TABLES.MEDICINES, parsed.medicineId);
    if (!medicine) return { available: false, reason: 'NO_MEDICINE_MATCH' };

    const rows = await db.findMany(TABLES.INVENTORY, {
      where: { item_type: ITEM_TYPES.MEDICINE, medicine_id: parsed.medicineId },
    });

    // Several batches held by one organisation are one number to a caller.
    const byOrganization = new Map();
    for (const row of rows) {
      const units = availableUnits(row);
      if (units <= 0) continue;
      const entry = byOrganization.get(row.organization_id) || {
        organizationId: row.organization_id,
        units: 0,
        unit: row.unit || 'unit',
      };
      entry.units += units;
      byOrganization.set(row.organization_id, entry);
    }

    const holders = [];
    const ranked = [...byOrganization.values()].sort((a, b) => b.units - a.units).slice(0, 10);
    for (const entry of ranked) {
      const organization = await db.findById(TABLES.ORGANIZATIONS, entry.organizationId);
      if (!organization || organization.verification_status !== VERIFICATION_STATUS.VERIFIED) continue;
      holders.push({
        organizationId: entry.organizationId,
        organizationName: organization.name,
        units: entry.units,
        unit: entry.unit,
        isCaller: Boolean(actor && actor.organization_id === entry.organizationId),
      });
    }

    const totalUnits = holders.reduce((sum, holder) => sum + holder.units, 0);

    return {
      available: true,
      medicineName: medicine.name,
      totalUnits,
      holders,
      summary: renderContext({ medicine, holders, totalUnits, quantity: parsed.quantity }),
    };
  } catch (error) {
    log(`Database context unavailable: ${(error && error.message) || 'lookup failed'}`);
    return { available: false, reason: 'LOOKUP_FAILED' };
  }
}

/**
 * The context block handed to the fallback: plain labelled lines, because the
 * model has to be able to copy figures out of it verbatim without
 * reinterpreting a nested structure.
 */
function renderContext({ medicine, holders, totalUnits, quantity }) {
  const lines = [
    `Medicine: ${medicine.name}`,
    `Generic: ${medicine.generic_name || 'not recorded'}`,
    `Category: ${medicine.category || 'not recorded'}`,
  ];

  if (medicine.strength || medicine.form) {
    lines.push(`Form: ${[medicine.form, medicine.strength].filter(Boolean).join(' ')}`);
  }

  if (holders.length === 0) {
    lines.push('Available: 0 units');
    lines.push('Held by: no verified organisation currently has available stock.');
  } else {
    const unit = holders[0].unit === 'unit' ? 'units' : holders[0].unit;
    lines.push(`Available: ${totalUnits} ${unit}`);
    lines.push(`Held by: ${holders.length} verified organisation${holders.length === 1 ? '' : 's'}`);
    for (const holder of holders) {
      const whose = holder.isCaller ? ' (the caller’s own organisation)' : '';
      lines.push(`  - ${holder.organizationName}${whose}: ${holder.units} ${unit}`);
    }
  }

  if (quantity !== null && quantity !== undefined) {
    lines.push(`Quantity asked for: ${quantity}`);
  }

  lines.push(`Read from the MediBridge database at ${new Date().toISOString()}.`);
  return lines.join('\n');
}

/* -------------------------------------------------------------------------
 * 3. Fallback: Google Gemini
 * ---------------------------------------------------------------------- */

/**
 * The fallback's whole job is to phrase facts it was given. Everything it is
 * forbidden from doing is stated as an explicit rule rather than implied,
 * because a hosted model with no tool access will otherwise fill a gap with a
 * plausible number - and a plausible inventory number is the one failure mode
 * this system cannot tolerate.
 */
const FALLBACK_SYSTEM_INSTRUCTION = [
  'You are the MediBridge assistant. MediBridge is an emergency medical supply',
  'network used by hospitals, pharmacies and suppliers to find and move stock.',
  'You are answering because the primary MediBridge AI is temporarily',
  'unavailable, so you have no live access to the system yourself.',
  '',
  'Rules you must follow exactly:',
  '1. Never invent or estimate inventory figures, stock levels, prices,',
  '   supplier names, order codes, delivery times or dates. The only figures',
  '   you may state are ones that appear verbatim in the DATABASE CONTEXT',
  '   block of the user turn.',
  '2. If the DATABASE CONTEXT block says live inventory is unavailable, say',
  '   plainly that you cannot verify live inventory right now, and point the',
  '   user at the Inventory or Search page. Never illustrate with an example',
  '   number, and never guess.',
  '3. Do not give clinical, dosing or treatment advice. MediBridge is a',
  '   logistics system, not a clinical one.',
  '4. Answer in two to four short sentences of plain English. No markdown',
  '   headings, and no bullet lists unless you are listing organisations that',
  '   appear in the context block.',
].join('\n');

function buildFallbackPrompt(message, context) {
  return [
    'USER QUESTION:',
    message,
    '',
    'DATABASE CONTEXT:',
    context && context.available ? context.summary : NO_CONTEXT,
  ].join('\n');
}

/**
 * Turn a Gemini error body into one line for the log.
 *
 * The API puts the actionable part in `error.message` - "API key not valid",
 * "quota exceeded", "model not found" are all things an operator can fix in a
 * minute, and all things a bare status code hides.
 */
function describeGeminiError(status, body) {
  try {
    const parsed = JSON.parse(body);
    if (parsed && parsed.error) {
      return `HTTP ${status} ${parsed.error.status || ''} - ${parsed.error.message}`.replace(/\s+/g, ' ').trim();
    }
  } catch {
    /* not JSON - fall through to the raw body */
  }
  return `HTTP ${status} - ${typeof body === 'string' ? body.slice(0, 200) : 'no body'}`;
}

/** Concatenate the text parts of the first candidate. */
function readGeminiText(payload) {
  const parts = payload && payload.candidates && payload.candidates[0]
    && payload.candidates[0].content && payload.candidates[0].content.parts;
  if (!Array.isArray(parts)) return null;

  const text = parts
    .map((part) => (part && typeof part.text === 'string' ? part.text : ''))
    .join('')
    .trim();
  return text || null;
}

/**
 * Call Gemini exactly once. Resolves to `{ ok: true, reply }` or
 * `{ ok: false, reason }` - there is nothing after this step but the clean
 * error, so a failure here is terminal by design.
 */
async function tryGeminiFallback(message, context) {
  if (!env.ai.geminiApiKey) {
    return { ok: false, reason: 'GEMINI_API_KEY is not set' };
  }

  const model = encodeURIComponent(env.ai.geminiModel);
  const url = `${env.ai.geminiApiBaseUrl}/v1beta/models/${model}:generateContent`;

  const generationConfig = {
    // Low temperature: this is a rephrasing job, not a creative one.
    temperature: 0.2,
    maxOutputTokens: 1024,
  };

  /*
   * Gemini 2.5 thinks before it answers, and those thinking tokens are billed
   * against maxOutputTokens. A model that spends the whole budget deliberating
   * returns a candidate with no text at all and finishReason MAX_TOKENS, which
   * this pipeline can only read as an empty response - so the request dies at
   * the fallback and the caller gets a 503 even though the API call succeeded.
   *
   * Reading four labelled lines back to someone needs no deliberation, so the
   * budget is spent on the answer instead. Sent only to 2.5, because earlier
   * models reject the unknown field outright.
   */
  if (/2\.5/.test(env.ai.geminiModel)) {
    generationConfig.thinkingConfig = { thinkingBudget: 0 };
  }

  let response;
  let body;

  try {
    response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Sent as a header rather than a query string so the key cannot leak
        // into an access log or a proxy's URL trace.
        'x-goog-api-key': env.ai.geminiApiKey,
      },
      body: JSON.stringify({
        system_instruction: { parts: [{ text: FALLBACK_SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildFallbackPrompt(message, context) }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(env.ai.fallbackTimeoutMs),
    });
    body = await response.text();
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (timedOut) return { ok: false, reason: `timeout after ${env.ai.fallbackTimeoutMs}ms` };
    return { ok: false, reason: `unreachable (${(error && error.message) || 'connection failed'})` };
  }

  if (!response.ok) {
    return { ok: false, reason: describeGeminiError(response.status, body) };
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'the API did not return JSON' };
  }

  // A safety block, or a budget spent on thinking, comes back as 200 with no
  // candidate text. Name which one it was.
  const reply = readGeminiText(payload);
  if (!reply) {
    const blocked = payload && payload.promptFeedback && payload.promptFeedback.blockReason;
    if (blocked) return { ok: false, reason: `blocked by safety filter (${blocked})` };

    const candidate = payload && payload.candidates && payload.candidates[0];
    const finish = candidate && candidate.finishReason;
    return { ok: false, reason: finish ? `no text returned (finishReason ${finish})` : 'no text returned' };
  }

  return { ok: true, reply };
}

/* -------------------------------------------------------------------------
 * The pipeline
 * ---------------------------------------------------------------------- */

/**
 * One user message in, one answer out.
 *
 * Returns `{ status, body }` rather than writing to the response, so the
 * controller stays a two-liner and this stays testable in isolation.
 *
 * The body keeps the FastAPI service's contract exactly - `success` and
 * `response` at the top level - so the frontend cannot tell which provider
 * answered. `provider` is metadata for logs and support, not for display.
 */
async function chat(message, actor = null) {
  log('Primary LLM');

  const primary = await tryPrimaryAi(message);

  if (primary.ok) {
    return {
      status: 200,
      body: { ...primary.payload, success: true, response: primary.reply, provider: 'local' },
    };
  }

  // Every primary failure hands over - a stopped Colab session, a rotated
  // ngrok hostname, a 4xx, a hung socket. None of them is a reason to answer
  // a hospital with an error when a second provider is standing by.
  log(`Primary failed: ${primary.reason}`);

  // Gemini has no tool access, so give it whatever the database can confirm.
  // This never throws: a failed lookup produces a context-free prompt that
  // tells the model to say it cannot verify live inventory.
  const context = await tryDatabaseContext(message, actor);

  log(`Gemini fallback starting (model ${env.ai.geminiModel}, ${context.available ? 'with' : 'without'} database context)`);

  const fallback = await tryGeminiFallback(message, context);

  if (fallback.ok) {
    log('Gemini fallback successful');
    return {
      status: 200,
      body: { success: true, response: fallback.reply, provider: 'gemini_fallback' },
    };
  }

  log(`Gemini fallback failed: ${fallback.reason}`);

  // End of the line. No third attempt, and never back to the primary.
  return { status: 503, body: { success: false, message: UNAVAILABLE_MESSAGE } };
}

/**
 * Ask both providers whether they are actually working, right now, from this
 * process.
 *
 * The pipeline logs say why a request failed, but only once a user has asked
 * something. This answers the same question on demand, which is what you want
 * when a deploy is live and the assistant is down: it separates "the key is
 * missing" from "the key is wrong" from "the model name is wrong" without
 * anyone having to reproduce the failure.
 *
 * Admin only, and it reports whether a key is present - never the key itself,
 * nor any part of it.
 */
async function diagnose() {
  const [primary, fallback] = await Promise.all([
    env.ai.serviceUrl ? tryPrimaryAi('ping') : Promise.resolve({ ok: false, reason: 'AI_SERVICE_URL is not set' }),
    env.ai.geminiApiKey
      ? tryGeminiFallback('Reply with the single word OK.', null)
      : Promise.resolve({ ok: false, reason: 'GEMINI_API_KEY is not set' }),
  ]);

  return {
    primary: {
      configured: Boolean(env.ai.serviceUrl),
      timeoutMs: env.ai.primaryTimeoutMs,
      reachable: primary.ok === true,
      reason: primary.ok ? undefined : primary.reason,
    },
    fallback: {
      provider: 'gemini',
      configured: Boolean(env.ai.geminiApiKey),
      model: env.ai.geminiModel,
      timeoutMs: env.ai.fallbackTimeoutMs,
      reachable: fallback.ok === true,
      reason: fallback.ok ? undefined : fallback.reason,
    },
    // What a user asking a question would get right now.
    assistantAnswers: primary.ok === true || fallback.ok === true,
  };
}

module.exports = {
  chat,
  diagnose,
  tryPrimaryAi,
  tryDatabaseContext,
  tryGeminiFallback,
  buildFallbackPrompt,
  UNAVAILABLE_MESSAGE,
  NO_CONTEXT,
};
