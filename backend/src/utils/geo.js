'use strict';

const { env } = require('../config/env');

const EARTH_RADIUS_KM = 6371;

const toRadians = (degrees) => (degrees * Math.PI) / 180;

function isValidCoordinate(latitude, longitude) {
  return (
    typeof latitude === 'number' &&
    typeof longitude === 'number' &&
    Number.isFinite(latitude) &&
    Number.isFinite(longitude) &&
    latitude >= -90 &&
    latitude <= 90 &&
    longitude >= -180 &&
    longitude <= 180
  );
}

/**
 * Straight-line ("as the crow flies") distance between two points, in km.
 *
 * This is deliberately simple for the hackathon build. When a routing
 * provider is added, replace only this module's `distanceKm` and
 * `estimateEtaMinutes` with road distance / provider ETA - nothing that
 * calls them needs to change.
 *
 * Returns null when either coordinate is missing, so callers can decide
 * how to rank an organisation with no location on file.
 */
function distanceKm(fromLat, fromLng, toLat, toLng) {
  const from = { lat: Number(fromLat), lng: Number(fromLng) };
  const to = { lat: Number(toLat), lng: Number(toLng) };

  if (!isValidCoordinate(from.lat, from.lng) || !isValidCoordinate(to.lat, to.lng)) {
    return null;
  }

  const dLat = toRadians(to.lat - from.lat);
  const dLng = toRadians(to.lng - from.lng);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRadians(from.lat)) * Math.cos(toRadians(to.lat)) * Math.sin(dLng / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return round(EARTH_RADIUS_KM * c, 2);
}

/**
 * Rough delivery ETA derived from straight-line distance.
 * `dispatchOverheadMinutes` accounts for picking and handover time.
 */
function estimateEtaMinutes(km, options = {}) {
  if (km === null || km === undefined || !Number.isFinite(Number(km))) return null;

  const speed = options.averageSpeedKmh || env.averageSpeedKmh;
  const overhead = options.overheadMinutes ?? env.dispatchOverheadMinutes;

  if (!speed || speed <= 0) return null;

  const travelMinutes = (Number(km) / speed) * 60;
  return Math.max(1, Math.round(travelMinutes + overhead));
}

function round(value, decimals = 2) {
  const factor = 10 ** decimals;
  return Math.round(value * factor) / factor;
}

module.exports = { distanceKm, estimateEtaMinutes, isValidCoordinate, EARTH_RADIUS_KM };
