'use strict';

const db = require('../db');
const { env } = require('../config/env');
const { parseEmergencyRequest } = require('./ai.service');
const { TABLES, ITEM_TYPES, VERIFICATION_STATUS } = require('../config/constants');

/**
 * The assistant behind POST /api/ai/chat.
 *
 * Gemini is the assistant. The self-hosted Qwen model behind the FastAPI
 * tunnel is no longer in this path at all: a notebook that has to be running
 * on someone's machine for a hospital to get an answer is not something to
 * put in front of an emergency, and every production failure so far has been
 * that tunnel rather than the model.
 *
 *   chat(message)
 *     tryDatabaseContext(message)  - the live rows behind the question
 *     askGemini(message, context)  - phrase them
 *     -> failure: one clean "temporarily unavailable"
 *
 * Two rules govern the design:
 *
 *  1. Exactly one outbound call per request. There is no retry and no second
 *     provider, so the path is always context -> Gemini -> answer or error,
 *     and it cannot loop.
 *  2. Gemini never invents inventory. It has no tool access of its own, so it
 *     is handed a structured block of real database rows to speak from, and
 *     is told to say it cannot verify live inventory rather than produce a
 *     number when that block is missing. See SYSTEM_INSTRUCTION.
 *
 * The response shape predates all of this and is unchanged - `success` and
 * `response` at the top level - so the Assistant page needs no knowledge of
 * which model answered.
 *
 * Restoring the self-hosted primary: the full two-provider pipeline, with its
 * failure classification and tests, is in commit 84410ef.
 */

/** The single message the frontend shows when the assistant cannot answer. */
const UNAVAILABLE_MESSAGE = 'MediBridge AI is temporarily unavailable. Please try again shortly.';

/** Sentinel used when no database facts could be gathered for the question. */
const NO_CONTEXT =
  'Live inventory is unavailable. No database figures could be read for this question.';

/**
 * Pipeline logging.
 *
 * These lines are operational, not debug. When the assistant fails on a
 * deployed instance they are the only record of why, so they are printed in
 * production too - a silent pipeline is what makes a 503 impossible to
 * diagnose from a hosting log. Only the test run is quiet.
 *
 * Never pass a key, a token or a full prompt through here.
 */
function log(line) {
  if (env.isTest) return;
  console.log(`[AI] ${line}`);
}

/* -------------------------------------------------------------------------
 * 1. Live database context
 * ---------------------------------------------------------------------- */

const availableUnits = (row) => Math.max(0, Number(row.quantity) - Number(row.reserved_quantity));

/**
 * Read the real database rows behind the question.
 *
 * This is the only live data the assistant has, so it is also the only thing
 * standing between a user and a confidently invented stock figure.
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
 * The context block handed to the model: plain labelled lines, because it has
 * to be able to copy figures out of it verbatim without reinterpreting a
 * nested structure.
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
 * 2. Gemini
 * ---------------------------------------------------------------------- */

/**
 * Everything the model is forbidden from doing is stated as an explicit rule
 * rather than implied, because a model with no tool access will otherwise
 * fill a gap with a plausible number - and a plausible inventory number is
 * the one failure mode this system cannot tolerate.
 *
 * Rule 3 exists because rules 1 and 2 are easy to over-apply: an assistant
 * that answers "I cannot verify live inventory" to "how do reservations
 * work?" is following the letter of its instructions and is useless.
 */
const SYSTEM_INSTRUCTION = [
  'You are the MediBridge assistant. MediBridge is an emergency medical supply',
  'network used by hospitals, pharmacies and suppliers to find and move stock.',
  'You are answering inside the MediBridge web app, for a signed-in member of a',
  'verified organisation.',
  '',
  'Rules you must follow exactly:',
  '1. Never invent or estimate inventory figures, stock levels, prices,',
  '   supplier names, order codes, delivery times or expiry dates. The only',
  '   such figures you may state are ones that appear verbatim in the DATABASE',
  '   CONTEXT block of the user turn.',
  '2. That block is the only live data you have. If it says live inventory is',
  '   unavailable and the question is about stock, availability, suppliers,',
  '   orders or deliveries, say plainly that you cannot verify live inventory',
  '   right now and point the user at the Inventory or Search page. Never',
  '   illustrate with an example number, and never guess.',
  '3. If the question is a general one - what MediBridge does, how ordering,',
  '   reservations or verification work, how to phrase a search - answer it',
  '   directly and helpfully. Rule 2 is about live figures, not a reason to be',
  '   unhelpful.',
  '4. Do not give clinical, dosing or treatment advice. MediBridge is a',
  '   logistics system, not a clinical one. Send clinical questions to a',
  '   qualified clinician.',
  '5. Answer in two to four short sentences of plain English. No markdown',
  '   headings, and no bullet lists unless you are listing organisations that',
  '   appear in the context block.',
].join('\n');

function buildPrompt(message, context) {
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
 * `{ ok: false, reason }`, where `reason` is a short sentence written for
 * whoever is reading the deploy log at the time.
 *
 * The key is read from the environment here and sent as a header. It is never
 * placed in the URL, never logged, and never returned to the caller.
 */
async function askGemini(message, context) {
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
   * reads here as an empty response - so the request dies and the caller gets
   * a 503 even though the API call succeeded.
   *
   * Reading four labelled lines back to someone needs no deliberation, so the
   * budget goes to the answer instead. Sent only to 2.5, because earlier
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
        system_instruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
        contents: [{ role: 'user', parts: [{ text: buildPrompt(message, context) }] }],
        generationConfig,
      }),
      signal: AbortSignal.timeout(env.ai.timeoutMs),
    });
    body = await response.text();
  } catch (error) {
    const timedOut = error && (error.name === 'TimeoutError' || error.name === 'AbortError');
    if (timedOut) return { ok: false, reason: `timeout after ${env.ai.timeoutMs}ms` };
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
 */
async function chat(message, actor = null) {
  // Never throws: a failed lookup produces a context-free prompt that tells
  // the model to say it cannot verify live inventory.
  const context = await tryDatabaseContext(message, actor);

  log(`Gemini ${env.ai.geminiModel} (${context.available ? 'with' : 'without'} database context)`);

  const result = await askGemini(message, context);

  if (result.ok) {
    log('Gemini answered');
    return {
      status: 200,
      body: { success: true, response: result.reply, provider: 'gemini' },
    };
  }

  log(`Gemini failed: ${result.reason}`);

  // End of the line. One attempt, no retry, no second provider.
  return { status: 503, body: { success: false, message: UNAVAILABLE_MESSAGE } };
}

/**
 * Ask the provider whether it is actually working, right now, from this
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
  const result = env.ai.geminiApiKey
    ? await askGemini('Reply with the single word OK.', null)
    : { ok: false, reason: 'GEMINI_API_KEY is not set' };

  return {
    provider: 'gemini',
    configured: Boolean(env.ai.geminiApiKey),
    model: env.ai.geminiModel,
    timeoutMs: env.ai.timeoutMs,
    reachable: result.ok === true,
    reason: result.ok ? undefined : result.reason,
    // What a user asking a question would get right now.
    assistantAnswers: result.ok === true,
  };
}

module.exports = {
  chat,
  diagnose,
  tryDatabaseContext,
  askGemini,
  buildPrompt,
  UNAVAILABLE_MESSAGE,
  NO_CONTEXT,
};
