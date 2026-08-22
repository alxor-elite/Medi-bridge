/** Geospatial helpers for distance + a deterministic pseudo-random seed. */

const R_KM = 6371

function toRad(deg) {
  return (deg * Math.PI) / 180
}

/** Haversine great-circle distance in km. */
export function distanceKm(a, b) {
  const dLat = toRad(b.lat - a.lat)
  const dLng = toRad(b.lng - a.lng)
  const lat1 = toRad(a.lat)
  const lat2 = toRad(b.lat)
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2
  return 2 * R_KM * Math.asin(Math.sqrt(h))
}

/**
 * Deterministic [0,1) value from a string seed — keeps mock search results
 * stable across renders without pulling in Math.random.
 */
export function stableRand(seed) {
  let h = 2166136261
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const x = Math.sin(h) * 10000
  return x - Math.floor(x)
}

/** Deterministic integer in [min, max] from a seed. */
export function stableInt(seed, min, max) {
  return Math.floor(stableRand(seed) * (max - min + 1)) + min
}
