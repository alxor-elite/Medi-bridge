'use strict';

const { env } = require('../config/env');

/**
 * Supplier ranking.
 *
 * This is a LOGISTICS recommendation - how quickly a verified organisation can
 * plausibly get stock to the requester, and how much we trust the numbers it
 * published. It is not a clinical or medical judgement, and nothing here has
 * been medically validated.
 *
 * Five weighted components, all configurable through the environment:
 *
 *   ETA          40%   how soon it can arrive
 *   distance     25%   how close it is
 *   stock        20%   how comfortably it covers the request
 *   reliability  10%   its delivery track record
 *   price         5%   unit price against the other candidates
 *
 * Every component is normalised to 0..1 where 1 is best, so the final score is
 * directly comparable between candidates in the same search. Scores from
 * different searches are not comparable - normalisation is relative to the
 * candidate set.
 */

/** 1 for the smallest value in the set, 0 for the largest. */
function invertedMinMax(value, min, max) {
  if (value === null || value === undefined || !Number.isFinite(value)) return 0;
  if (!Number.isFinite(min) || !Number.isFinite(max) || max === min) return 1;
  return 1 - (value - min) / (max - min);
}

function finiteValues(candidates, key) {
  return candidates.map((candidate) => candidate[key]).filter((value) => Number.isFinite(value));
}

/**
 * How comfortably the candidate covers the request. Exactly enough stock
 * scores 0.5; twice the requested quantity or more scores 1, because a buffer
 * means a part-picked batch or a miscount will not sink the order.
 */
function coverageScore(available, requested) {
  if (!requested || requested <= 0) return 1;
  return Math.min(1, available / (requested * 2));
}

const round = (value, decimals = 4) => {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
};

/**
 * @param candidates Each needs: estimatedMinutes, distanceKm, availableQuantity,
 *   reliabilityScore (0-100), unitPrice (nullable), freshnessScore (0-1).
 * @param requestedQuantity Units the hospital asked for.
 * @param weights Optional override of the configured weights.
 */
function rankCandidates(candidates, requestedQuantity, weights = env.ranking) {
  if (candidates.length === 0) return [];

  const etas = finiteValues(candidates, 'estimatedMinutes');
  const distances = finiteValues(candidates, 'distanceKm');
  const prices = finiteValues(candidates, 'unitPrice');

  const bounds = {
    etaMin: Math.min(...etas),
    etaMax: Math.max(...etas),
    distanceMin: Math.min(...distances),
    distanceMax: Math.max(...distances),
    priceMin: Math.min(...prices),
    priceMax: Math.max(...prices),
  };

  const scored = candidates.map((candidate) => {
    const eta = invertedMinMax(candidate.estimatedMinutes, bounds.etaMin, bounds.etaMax);
    const distance = invertedMinMax(candidate.distanceKm, bounds.distanceMin, bounds.distanceMax);

    // Stock is discounted by how recently the figure was updated: 50 units
    // counted an hour ago is a weaker promise than 50 counted a minute ago.
    const coverage = coverageScore(candidate.availableQuantity, requestedQuantity);
    const stock = coverage * (0.5 + 0.5 * (candidate.freshnessScore ?? 0));

    const reliability = Math.min(1, Math.max(0, (candidate.reliabilityScore ?? 50) / 100));

    // A candidate that published no price is neither rewarded nor punished.
    const price = Number.isFinite(candidate.unitPrice)
      ? invertedMinMax(candidate.unitPrice, bounds.priceMin, bounds.priceMax)
      : 0.5;

    const total =
      eta * weights.eta +
      distance * weights.distance +
      stock * weights.stock +
      reliability * weights.reliability +
      price * weights.price;

    return {
      ...candidate,
      recommendationScore: Math.round(total * 100),
      scoreBreakdown: {
        eta: round(eta),
        distance: round(distance),
        stock: round(stock),
        reliability: round(reliability),
        price: round(price),
        weights,
      },
    };
  });

  return scored.sort((a, b) => b.recommendationScore - a.recommendationScore);
}

/**
 * Flags the candidates worth acting on: the best-scoring option, plus anything
 * within a few points of it, as long as it clears the deadline the hospital
 * gave. Ties are common when several pharmacies sit on the same street.
 */
function flagRecommended(rankedCandidates, { maximumEtaMinutes = null, tolerance = 5 } = {}) {
  const eligible = rankedCandidates.filter(
    (candidate) =>
      maximumEtaMinutes === null ||
      (Number.isFinite(candidate.estimatedMinutes) && candidate.estimatedMinutes <= maximumEtaMinutes)
  );

  const best = eligible[0]?.recommendationScore ?? null;

  return rankedCandidates.map((candidate) => ({
    ...candidate,
    meetsDeadline:
      maximumEtaMinutes === null
        ? null
        : Number.isFinite(candidate.estimatedMinutes) && candidate.estimatedMinutes <= maximumEtaMinutes,
    recommended:
      best !== null &&
      eligible.includes(candidate) &&
      candidate.recommendationScore >= best - tolerance,
  }));
}

module.exports = { rankCandidates, flagRecommended, coverageScore, invertedMinMax };
