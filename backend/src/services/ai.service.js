'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const { medicines } = require('./catalog.service');
const { TABLES, PRIORITY, ORDER_STATUS, ITEM_TYPES } = require('../config/constants');

/**
 * The "AI" layer: turning a sentence typed under pressure into a structured
 * search, and projecting stock forward from past usage.
 *
 * Two rules govern everything here:
 *
 *  1. It never invents facts. The parser's job is to extract intent - a
 *     quantity, a deadline, an urgency - and to resolve the medicine against
 *     the real catalogue. Suppliers, stock levels, prices and availability
 *     always come from the database via search.service.
 *  2. It is deterministic and dependency-free. A rule-based extractor is
 *     predictable, needs no API key, cannot hallucinate a medicine that does
 *     not exist, and is fast enough to sit in front of an emergency search.
 *     If a language model is added later, it should feed this same structure
 *     and still resolve the medicine against the catalogue.
 */

const STOPWORDS = new Set([
  'we', 'need', 'needs', 'needed', 'want', 'require', 'required', 'urgently', 'urgent',
  'please', 'send', 'get', 'give', 'the', 'a', 'an', 'of', 'for', 'to', 'in', 'at',
  'and', 'or', 'with', 'within', 'next', 'now', 'immediately', 'asap', 'stat',
  'emergency', 'critical', 'minutes', 'minute', 'mins', 'min', 'hours', 'hour', 'hrs',
  'hr', 'units', 'unit', 'boxes', 'box', 'vials', 'vial', 'strips', 'strip', 'packs',
  'pack', 'ampoules', 'ampoule', 'injections', 'injection', 'tablets', 'tablet',
  'capsules', 'capsule', 'bottles', 'bottle', 'doses', 'dose', 'is', 'are', 'have',
  'has', 'our', 'my', 'us', 'it', 'this', 'that', 'as', 'soon', 'possible', 'quickly',
  'hospital', 'patient', 'ward', 'icu', 'running', 'low', 'out', 'stock', 'supply',
]);

/** Words that mean "this cannot wait". */
const CRITICAL_MARKERS = [
  'critical', 'emergency', 'life threatening', 'life-threatening', 'code blue',
  'cardiac arrest', 'immediately', 'asap', 'stat', 'right now', 'dying', 'resuscitation',
];
const URGENT_MARKERS = ['urgent', 'urgently', 'as soon as possible', 'quickly', 'priority', 'rush'];

/**
 * Pull a deadline out of the sentence.
 * Handles "within 30 minutes", "in 2 hours", "half an hour", "within the hour".
 */
function extractDeadlineMinutes(text) {
  const numeric = text.match(/(?:within|in|under|inside|before|by)\s+(?:the\s+next\s+)?(\d+)\s*(minutes?|mins?|m\b|hours?|hrs?|h\b)/i);
  if (numeric) {
    const value = Number(numeric[1]);
    const isHours = /^h/i.test(numeric[2]);
    return { minutes: isHours ? value * 60 : value, matched: numeric[0] };
  }

  if (/half\s+an\s+hour|30\s*mins?\b/i.test(text)) return { minutes: 30, matched: 'half an hour' };
  if (/within\s+the\s+hour|in\s+an\s+hour/i.test(text)) return { minutes: 60, matched: 'the hour' };

  return { minutes: null, matched: null };
}

function extractPriority(text, deadlineMinutes) {
  const lower = text.toLowerCase();

  if (CRITICAL_MARKERS.some((marker) => lower.includes(marker))) return PRIORITY.CRITICAL;

  // A tight deadline is itself a statement of urgency.
  if (deadlineMinutes !== null && deadlineMinutes <= 30) return PRIORITY.CRITICAL;
  if (URGENT_MARKERS.some((marker) => lower.includes(marker))) return PRIORITY.URGENT;
  if (deadlineMinutes !== null && deadlineMinutes <= 120) return PRIORITY.URGENT;

  return PRIORITY.NORMAL;
}

/**
 * The requested count. The deadline phrase is removed first so "20 vials
 * within 30 minutes" does not read as a request for 30 of something, and
 * numbers glued to a unit ("1mg", "0.9%") are ignored as strengths.
 */
function extractQuantity(text, deadlineMatch) {
  let working = deadlineMatch ? text.replace(deadlineMatch, ' ') : text;

  // Drop dosage strengths: 500mg, 1mg/ml, 0.9%, 5ml.
  working = working.replace(/\d+(?:\.\d+)?\s*(?:mg|mcg|ml|g|iu|%)\b(?:\s*\/\s*\w+)?/gi, ' ');

  const match = working.match(/\b(\d{1,5})\b/);
  return match ? Number(match[1]) : null;
}

function meaningfulTokens(text) {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 3 && !STOPWORDS.has(token) && !/^\d+$/.test(token));
}

/**
 * Resolve the medicine against the catalogue.
 *
 * This is the guard rail: whatever the sentence says, the result is a real row
 * from `medicines` or nothing at all. The parser cannot conjure a product.
 */
async function resolveMedicine(text) {
  const tokens = meaningfulTokens(text);
  if (tokens.length === 0) return { match: null, candidates: [], tokens };

  // One bounded catalogue query per token rather than loading the catalogue.
  const found = new Map();
  for (const token of tokens.slice(0, 8)) {
    const rows = await medicines.list({ search: token, limit: 5 });
    for (const row of rows) found.set(row.id, row);
  }

  if (found.size === 0) return { match: null, candidates: [], tokens };

  const scored = [...found.values()]
    .map((medicine) => {
      const haystack = `${medicine.name} ${medicine.generic_name || ''} ${medicine.category || ''}`.toLowerCase();
      const hits = tokens.filter((token) => haystack.includes(token));
      return {
        medicine,
        score: hits.length,
        // Prefer the more specific match when two score equally.
        tieBreak: -medicine.name.length,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.tieBreak - a.tieBreak);

  return {
    match: scored[0]?.medicine ?? null,
    candidates: scored.slice(0, 5).map((entry) => ({
      id: entry.medicine.id,
      name: entry.medicine.name,
      genericName: entry.medicine.generic_name,
      matchedTokens: entry.score,
    })),
    tokens,
  };
}

/**
 * Parse a free-text emergency request into the structure the search endpoint
 * takes.
 *
 * "We urgently need 20 adrenaline injections within 30 minutes."
 *   -> { medicine: 'Adrenor 1mg/ml', quantity: 20, priority: 'CRITICAL', maximumEtaMinutes: 30 }
 */
async function parseEmergencyRequest(text) {
  if (typeof text !== 'string' || text.trim().length === 0) {
    throw ApiError.badRequest('Provide the request text to parse.');
  }

  const input = text.trim();
  const deadline = extractDeadlineMinutes(input);
  const quantity = extractQuantity(input, deadline.matched);
  const priority = extractPriority(input, deadline.minutes);
  const { match, candidates, tokens } = await resolveMedicine(input);

  // Confidence describes the parse, not the medicine advice. The frontend
  // should make the user confirm anything below HIGH before ordering.
  let confidence = 'LOW';
  if (match && quantity !== null) confidence = 'HIGH';
  else if (match) confidence = 'MEDIUM';

  const unresolved = [];
  if (!match) unresolved.push('medicine');
  if (quantity === null) unresolved.push('quantity');

  return {
    input,
    medicine: match ? match.name : null,
    medicineId: match ? match.id : null,
    genericName: match ? match.generic_name : null,
    quantity,
    priority,
    maximumEtaMinutes: deadline.minutes,
    confidence,
    unresolved,
    alternatives: candidates,
    // Shown so a user can see why it read the sentence the way it did.
    interpretedFrom: { tokens, deadlinePhrase: deadline.matched },
  };
}

/* -------------------------------------------------------------------------
 * Shortage prediction (build brief section 28)
 * ---------------------------------------------------------------------- */

/**
 * Days of cover left, from how fast stock has actually moved.
 *
 * Usage is measured from delivered orders, not guessed: total units shipped
 * for a medicine over the window, divided by the window length. It is a plain
 * moving average, which is honest about being a rough projection rather than
 * pretending to be a trained model.
 */
async function predictShortages(organizationId, { windowDays = 30, horizonDays = 7 } = {}) {
  if (!organizationId) throw ApiError.badRequest('An organizationId is required.');

  const since = new Date(Date.now() - windowDays * 86400000).toISOString();

  const [stock, orders] = await Promise.all([
    db.findMany(TABLES.INVENTORY, {
      where: { organization_id: organizationId, item_type: ITEM_TYPES.MEDICINE },
    }),
    db.findMany(TABLES.ORDERS, {
      where: { supplier_id: organizationId, status: ORDER_STATUS.DELIVERED },
      gte: { created_at: since },
    }),
  ]);

  if (stock.length === 0) return { organizationId, windowDays, items: [] };

  // Units shipped per medicine over the window.
  const shipped = new Map();
  for (const order of orders) {
    const items = await db.findMany(TABLES.ORDER_ITEMS, { where: { order_id: order.id } });
    for (const item of items) {
      if (!item.medicine_id) continue;
      shipped.set(item.medicine_id, (shipped.get(item.medicine_id) || 0) + Number(item.quantity));
    }
  }

  // Several batches of the same medicine are one pool for forecasting.
  const pools = new Map();
  for (const row of stock) {
    const available = Math.max(0, Number(row.quantity) - Number(row.reserved_quantity));
    const pool = pools.get(row.medicine_id) || { medicineId: row.medicine_id, available: 0, batches: 0 };
    pool.available += available;
    pool.batches += 1;
    pools.set(row.medicine_id, pool);
  }

  const items = [];
  for (const pool of pools.values()) {
    const totalShipped = shipped.get(pool.medicineId) || 0;
    const averageDailyUsage = Math.round((totalShipped / windowDays) * 100) / 100;

    // No movement means no basis for a projection - say so rather than
    // reporting "infinite days of cover" as if it were a finding.
    const daysRemaining = averageDailyUsage > 0 ? Math.floor(pool.available / averageDailyUsage) : null;

    const medicine = await db.findById(TABLES.MEDICINES, pool.medicineId);

    items.push({
      medicineId: pool.medicineId,
      medicineName: medicine?.name || 'Unknown medicine',
      availableQuantity: pool.available,
      batches: pool.batches,
      unitsShippedInWindow: totalShipped,
      averageDailyUsage,
      predictedDaysRemaining: daysRemaining,
      risk: classifyRisk(daysRemaining, horizonDays),
      basis: `Moving average over the last ${windowDays} days of delivered orders.`,
    });
  }

  const ranked = items.sort((a, b) => {
    if (a.predictedDaysRemaining === null) return 1;
    if (b.predictedDaysRemaining === null) return -1;
    return a.predictedDaysRemaining - b.predictedDaysRemaining;
  });

  return {
    organizationId,
    windowDays,
    horizonDays,
    generatedAt: new Date().toISOString(),
    method: 'Moving average of delivered order volume. A rough logistics projection, not a clinical forecast.',
    items: ranked,
  };
}

function classifyRisk(daysRemaining, horizonDays) {
  if (daysRemaining === null) return 'NO_RECENT_USAGE';
  if (daysRemaining <= 2) return 'CRITICAL';
  if (daysRemaining <= horizonDays) return 'AT_RISK';
  return 'HEALTHY';
}

module.exports = { parseEmergencyRequest, predictShortages, extractDeadlineMinutes, extractQuantity };
