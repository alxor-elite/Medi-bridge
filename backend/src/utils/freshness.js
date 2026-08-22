'use strict';

const { env } = require('../config/env');
const { STOCK_FRESHNESS } = require('../config/constants');

/**
 * How much a stock figure can be trusted, from how long ago it was touched.
 *
 * A hospital dispatching for a critical medicine needs to know the difference
 * between "counted two minutes ago" and "last touched yesterday". Thresholds
 * come from the environment (FRESHNESS_FRESH_MINUTES / FRESHNESS_RECENT_MINUTES)
 * so they can be tuned without a code change.
 *
 *   < 30 minutes      -> FRESH
 *   30 min - 6 hours  -> RECENT
 *   > 6 hours         -> STALE
 */
function minutesSince(timestamp, now = Date.now()) {
  if (!timestamp) return null;
  const then = new Date(timestamp).getTime();
  if (Number.isNaN(then)) return null;
  return Math.max(0, (now - then) / 60000);
}

function classifyFreshness(timestamp, now = Date.now()) {
  const minutes = minutesSince(timestamp, now);

  // No timestamp at all is the least trustworthy case there is.
  if (minutes === null) return STOCK_FRESHNESS.STALE;
  if (minutes < env.freshness.freshMinutes) return STOCK_FRESHNESS.FRESH;
  if (minutes < env.freshness.recentMinutes) return STOCK_FRESHNESS.RECENT;
  return STOCK_FRESHNESS.STALE;
}

/** The freshness block every inventory-shaped response carries. */
function describeFreshness(timestamp, now = Date.now()) {
  const minutes = minutesSince(timestamp, now);
  return {
    lastUpdated: timestamp || null,
    stockFreshness: classifyFreshness(timestamp, now),
    minutesSinceUpdate: minutes === null ? null : Math.round(minutes),
  };
}

/** Ranking input: 1 for just-counted stock, decaying to 0 once it is stale. */
function freshnessScore(timestamp, now = Date.now()) {
  const minutes = minutesSince(timestamp, now);
  if (minutes === null) return 0;
  const staleAt = env.freshness.recentMinutes;
  if (minutes >= staleAt) return 0;
  return Math.max(0, 1 - minutes / staleAt);
}

module.exports = { classifyFreshness, describeFreshness, freshnessScore, minutesSince };
