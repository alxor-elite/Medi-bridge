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
 * Pipeline tracing, development only. Production logs stay quiet and test
 * output stays readable.
 */
function trace(...parts) {
  if (env.isProduction || env.isTest) return;
  console.info('[AI]', ...parts);
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
 * Resolves to `{ ok: true, payload, reply }`, or `{ ok: false, reason }` where
 * every reason except CLIENT_ERROR is a genuine outage and therefore a
 * fallback trigger. A 4xx means the request itself was wrong; re-asking a
 * different model would only hide the bug, so it is passed straight back.
 */
async function tryPrimaryAi(message) {
  const baseUrl = env.ai.serviceUrl;
  if (!baseUrl) {
    return { ok: false, reason: 'NOT_CONFIGURED', detail: 'AI_SERVICE_URL is not set.' };
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
    return {
      ok: false,
      reason: timedOut ? 'TIMEOUT' : 'UNREACHABLE',
      detail: timedOut ? `no answer within ${env.ai.primaryTimeoutMs}ms` : error && error.message,
    };
  }

  // 408 and 429 are the service saying it cannot serve this request now, which
  // is an availability problem rather than a malformed request.
  if (response.status >= 500 || response.status === 408 || response.status === 429) {
    return { ok: false, reason: 'SERVER_ERROR', status: response.status };
  }

  let payload = null;
  try {
    payload = body ? JSON.parse(body) : null;
  } catch {
    // An HTML error page or a truncated stream: unusable either way.
    if (!response.ok) {
      return { ok: false, reason: 'SERVER_ERROR', status: response.status };
    }
    return { ok: false, reason: 'INVALID_RESPONSE', detail: 'the service did not return JSON' };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: 'CLIENT_ERROR',
      status: response.status,
      message: readReply(payload) || 'The assistant could not answer that.',
    };
  }

  // The service reporting its own failure - typically an inference exception
  // raised inside the model call and caught by FastAPI.
  if (payload && payload.success === false) {
    return { ok: false, reason: 'INFERENCE_ERROR', detail: payload.error || payload.message };
  }

  const reply = readReply(payload);
  if (!reply) return { ok: false, reason: 'EMPTY_RESPONSE' };

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
    trace('Database context lookup failed:', error && error.message);
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
    return { ok: false, reason: 'NOT_CONFIGURED', detail: 'GEMINI_API_KEY is not set.' };
  }

  const model = encodeURIComponent(env.ai.geminiModel);
  const url = `${env.ai.geminiApiBaseUrl}/v1beta/models/${model}:generateContent`;

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
        generationConfig: {
          // Low temperature: this is a rephrasing job, not a creative one.
          temperature: 0.2,
          maxOutputTokens: 2048,
        },
      }),
      signal: AbortSignal.timeout(env.ai.fallbackTimeoutMs),
    });
    body = await response.text();
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    return {
      ok: false,
      reason: timedOut ? 'TIMEOUT' : 'UNREACHABLE',
      detail: error && error.message,
    };
  }

  if (!response.ok) {
    return {
      ok: false,
      reason: 'HTTP_ERROR',
      status: response.status,
      detail: typeof body === 'string' ? body.slice(0, 300) : undefined,
    };
  }

  let payload;
  try {
    payload = JSON.parse(body);
  } catch {
    return { ok: false, reason: 'INVALID_RESPONSE' };
  }

  // A safety block comes back as 200 with no candidate text.
  const reply = readGeminiText(payload);
  if (!reply) {
    const blocked = payload && payload.promptFeedback && payload.promptFeedback.blockReason;
    return { ok: false, reason: blocked ? 'BLOCKED' : 'EMPTY_RESPONSE' };
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
  trace('Primary LLM');

  const primary = await tryPrimaryAi(message);

  if (primary.ok) {
    return {
      status: 200,
      body: { ...primary.payload, success: true, response: primary.reply, provider: 'local' },
    };
  }

  // A rejected request is not an outage. Hand the primary's own answer back
  // rather than asking a second model the same bad question.
  if (primary.reason === 'CLIENT_ERROR') {
    return {
      status: primary.status,
      body: { success: false, message: primary.message, provider: 'local' },
    };
  }

  trace('Primary failed', `(${primary.reason}${primary.detail ? `: ${primary.detail}` : ''})`);

  // Gemini has no tool access, so give it whatever the database can confirm.
  const context = await tryDatabaseContext(message, actor);
  trace('Using Gemini fallback', context.available ? 'with database context' : 'without database context');

  const fallback = await tryGeminiFallback(message, context);

  if (fallback.ok) {
    trace('Fallback successful');
    return {
      status: 200,
      body: { success: true, response: fallback.reply, provider: 'gemini_fallback' },
    };
  }

  trace('Fallback failed', `(${fallback.reason})`);

  // End of the line. No third attempt, and never back to the primary.
  return { status: 503, body: { success: false, message: UNAVAILABLE_MESSAGE } };
}

module.exports = {
  chat,
  tryPrimaryAi,
  tryDatabaseContext,
  tryGeminiFallback,
  buildFallbackPrompt,
  UNAVAILABLE_MESSAGE,
  NO_CONTEXT,
};
