/**
 * Supplier-availability engine for hospital search. Given a medicine, it walks
 * the verified supplier organizations and produces stable, realistic listings:
 * stock, distance, ETA, reliability, freshness, price and a blended stock
 * confidence — then flags the single best match as "Recommended".
 *
 * Everything is deterministic (seeded) so the demo looks identical on reload.
 */

import { distanceKm, stableRand, stableInt } from '../lib/geo'
import {
  ORGANIZATIONS,
  ORG_MAP,
  HOME_HOSPITAL_ID,
} from './organizations'
import { MEDICINE_MAP } from './medicines'

// Supplier-type orgs that participate in fulfilment (exclude hospitals).
const SUPPLIER_TYPES = ['pharmacy', 'medical_store', 'supplier']

// Indicative unit price (INR) per medicine; suppliers vary slightly around it.
const BASE_PRICE = {
  'med-adrenaline-1mg': 82,
  'med-atropine-600': 34,
  'med-amiodarone-150': 96,
  'med-noradrenaline-4mg': 128,
  'med-tranexamic-500': 46,
  'med-heparin-5000': 76,
  'med-ceftriaxone-1g': 58,
  'med-insulin-100': 210,
  'med-salbutamol-inhaler': 165,
  'med-normal-saline-500': 42,
  'med-ringer-lactate-500': 45,
  'med-oxygen-cylinder': 1450,
  'med-ventilator': 0,
  'med-defibrillator': 0,
  'med-blood-o-neg': 0,
  'med-n95': 480,
}

// A few suppliers won't carry certain specialised items — keeps results honest.
const NOT_STOCKED = {
  'med-ventilator': ['org-carewell-store', 'org-guardian-pharma', 'org-medplus'],
  'med-defibrillator': ['org-guardian-pharma', 'org-carewell-store'],
  'med-blood-o-neg': [
    'org-medplus',
    'org-apollo-central',
    'org-carewell-store',
    'org-guardian-pharma',
    'org-medico-hub',
    'org-nova-supplies',
  ],
}

function confidenceFor({ reliability, freshnessMins, stock, requested }) {
  const freshnessScore = Math.max(0, 1 - freshnessMins / 240) // 0..1
  const stockScore = Math.min(1, stock / Math.max(1, requested))
  const raw =
    reliability * 0.6 + freshnessScore * 100 * 0.25 + stockScore * 100 * 0.15
  return Math.round(Math.max(60, Math.min(99, raw)))
}

/**
 * Build supplier listings for a medicine.
 * @returns {{ medicine, requested, count, suppliers }}
 */
export function getSuppliersForMedicine(medicineId, requested = 20) {
  const medicine = MEDICINE_MAP[medicineId]
  const home = ORG_MAP[HOME_HOSPITAL_ID]
  const excluded = NOT_STOCKED[medicineId] || []

  const suppliers = ORGANIZATIONS.filter(
    (o) =>
      SUPPLIER_TYPES.includes(o.type) &&
      o.verification === 'verified' &&
      !excluded.includes(o.id),
  ).map((org) => {
    const seed = `${org.id}:${medicineId}`
    const dist = distanceKm(home, org)
    const eta = Math.max(6, Math.round(dist * 3.2 + stableInt(seed + ':t', 2, 7)))
    const freshnessMins = stableInt(seed + ':f', 1, 90)
    const stock = stableInt(seed + ':s', 6, 140)
    const basePrice = BASE_PRICE[medicineId] ?? 0
    const price = basePrice
      ? Math.round(basePrice * (0.92 + stableRand(seed + ':p') * 0.18))
      : null
    const confidence = confidenceFor({
      reliability: org.reliability ?? 80,
      freshnessMins,
      stock,
      requested,
    })

    // Composite ranking: confidence, proximity, and stock sufficiency.
    const proximity = Math.max(0, 100 - dist * 6)
    const sufficiency = stock >= requested ? 100 : (stock / requested) * 100
    const score = confidence * 0.45 + proximity * 0.35 + sufficiency * 0.2

    return {
      supplierId: org.id,
      name: org.name,
      type: org.type,
      verified: org.verification === 'verified',
      reliability: org.reliability,
      distanceKm: Math.round(dist * 10) / 10,
      etaMinutes: eta,
      freshnessMins,
      stock,
      price,
      confidence,
      canFulfil: stock >= requested,
      lat: org.lat,
      lng: org.lng,
      area: org.area,
      _score: score,
    }
  })

  suppliers.sort((a, b) => b._score - a._score)
  if (suppliers.length) suppliers[0].recommended = true

  return {
    medicine,
    requested,
    count: suppliers.length,
    suppliers,
  }
}
