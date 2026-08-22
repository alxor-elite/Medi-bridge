'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const notifications = require('./notification.service');
const { medicines, equipment } = require('./catalog.service');
const { distanceKm, estimateEtaMinutes } = require('../utils/geo');
const { classifyFreshness, freshnessScore } = require('../utils/freshness');
const { rankCandidates, flagRecommended } = require('../utils/ranking');
const {
  TABLES,
  ITEM_TYPES,
  VERIFICATION_STATUS,
  PRIORITY,
  NOTIFICATION_TYPES,
} = require('../config/constants');

/**
 * Emergency supply search - the core of MediBridge.
 *
 * Given "20 units of adrenaline, needed within 30 minutes", find the verified
 * organisations that can actually supply it, work out how far away and how
 * soon, and rank them.
 *
 * Every number here comes from the database. Nothing is estimated into
 * existence: if no verified organisation holds the stock, the answer is an
 * empty result set, not a plausible-looking one.
 */

/**
 * Batches are allocated soonest-expiry-first (FEFO), which is what a real
 * dispensary does - it uses stock before it expires rather than hoarding it.
 * Returns null when the organisation cannot cover the request at all.
 */
function allocateBatches(batches, requestedQuantity) {
  const usable = [...batches].sort((a, b) => {
    const left = a.expiry_date || '9999-12-31';
    const right = b.expiry_date || '9999-12-31';
    return left.localeCompare(right);
  });

  const allocation = [];
  let remaining = requestedQuantity;

  for (const batch of usable) {
    if (remaining <= 0) break;
    const available = Math.max(0, Number(batch.quantity) - Number(batch.reserved_quantity));
    if (available <= 0) continue;

    const take = Math.min(available, remaining);
    remaining -= take;
    allocation.push({
      inventoryId: batch.id,
      quantity: take,
      unitPrice: batch.price === null || batch.price === undefined ? null : Number(batch.price),
      expiryDate: batch.expiry_date,
      storageRequirement: batch.storage_requirement,
      lastUpdated: batch.updated_at,
    });
  }

  return remaining > 0 ? null : allocation;
}

/** Weighted average unit price across the allocated batches. */
function blendedUnitPrice(allocation) {
  const priced = allocation.filter((line) => Number.isFinite(line.unitPrice));
  if (priced.length === 0) return null;

  const units = priced.reduce((sum, line) => sum + line.quantity, 0);
  if (units === 0) return null;

  const total = priced.reduce((sum, line) => sum + line.unitPrice * line.quantity, 0);
  return Math.round((total / units) * 100) / 100;
}

/** Resolve the catalogue entry being searched for, by id or by name. */
async function resolveItem({ itemType, medicineId, equipmentId, medicineName }) {
  if (itemType === ITEM_TYPES.EQUIPMENT || equipmentId) {
    if (!equipmentId) throw ApiError.badRequest('equipmentId is required when searching for equipment.');
    const item = await equipment.getByIdOrFail(equipmentId);
    return { itemType: ITEM_TYPES.EQUIPMENT, item, column: 'equipment_id' };
  }

  if (medicineId) {
    const item = await medicines.getByIdOrFail(medicineId);
    return { itemType: ITEM_TYPES.MEDICINE, item, column: 'medicine_id' };
  }

  if (medicineName) {
    // Name lookup exists so the AI parser and a plain search box can both feed
    // this service without knowing catalogue ids.
    const matches = await medicines.list({ search: medicineName, limit: 1 });
    if (matches.length === 0) {
      throw ApiError.notFound(`No medicine in the catalogue matches "${medicineName}".`);
    }
    return { itemType: ITEM_TYPES.MEDICINE, item: matches[0], column: 'medicine_id' };
  }

  throw ApiError.badRequest('Provide medicineId, equipmentId or medicineName to search for.');
}

/**
 * @param request medicineId | equipmentId | medicineName, quantity, priority,
 *   maximumEtaMinutes, maxDistanceKm, latitude/longitude override, limit.
 * @param requester The signed-in profile issuing the search.
 */
async function findSuppliers(request, requester) {
  const quantity = Number(request.quantity) || 1;
  const { itemType, item, column } = await resolveItem(request);

  const requesterOrg = requester.organization_id
    ? await db.findById(TABLES.ORGANIZATIONS, requester.organization_id)
    : null;

  // An explicit coordinate wins, so an ambulance can search from where it
  // actually is rather than from its hospital's registered address.
  const origin = {
    latitude: request.latitude ?? requesterOrg?.latitude ?? null,
    longitude: request.longitude ?? requesterOrg?.longitude ?? null,
  };

  const today = new Date().toISOString().slice(0, 10);
  const inventoryRows = await db.findMany(TABLES.INVENTORY, {
    where: { [column]: item.id, item_type: itemType },
  });

  // Group the live batches by the organisation holding them.
  const byOrganization = new Map();
  for (const row of inventoryRows) {
    if (row.expiry_date && row.expiry_date < today) continue;
    if (Number(row.quantity) - Number(row.reserved_quantity) <= 0) continue;
    // Searching is for finding stock *elsewhere*; your own shelf is not a find.
    if (requester.organization_id && row.organization_id === requester.organization_id) continue;

    if (!byOrganization.has(row.organization_id)) byOrganization.set(row.organization_id, []);
    byOrganization.get(row.organization_id).push(row);
  }

  if (byOrganization.size === 0) {
    return emptyResult(item, itemType, quantity, origin, request);
  }

  const organizations = await db.findMany(TABLES.ORGANIZATIONS, {
    in: { id: [...byOrganization.keys()] },
  });

  const now = Date.now();
  const candidates = [];

  for (const organization of organizations) {
    // Unverified, rejected and suspended organisations never appear. This is
    // the whole promise of the network and is enforced here, not in the UI.
    if (organization.verification_status !== VERIFICATION_STATUS.VERIFIED) continue;

    const batches = byOrganization.get(organization.id) || [];
    const totalAvailable = batches.reduce(
      (sum, batch) => sum + Math.max(0, Number(batch.quantity) - Number(batch.reserved_quantity)),
      0
    );

    const allocation = allocateBatches(batches, quantity);
    if (!allocation) continue; // Cannot cover the requested quantity.

    const km = distanceKm(origin.latitude, origin.longitude, organization.latitude, organization.longitude);
    if (request.maxDistanceKm && km !== null && km > request.maxDistanceKm) continue;

    // The allocation is only as trustworthy as its least recently counted batch.
    const oldestUpdate = allocation.reduce(
      (oldest, line) => (!oldest || line.lastUpdated < oldest ? line.lastUpdated : oldest),
      null
    );

    const unitPrice = blendedUnitPrice(allocation);

    candidates.push({
      supplierId: organization.id,
      supplierName: organization.name,
      supplierType: organization.type,
      verified: true,
      address: organization.address,
      phone: organization.phone,
      latitude: organization.latitude,
      longitude: organization.longitude,

      stock: totalAvailable,
      availableQuantity: totalAvailable,
      requestedQuantity: quantity,

      distanceKm: km,
      estimatedMinutes: estimateEtaMinutes(km),

      lastUpdated: oldestUpdate,
      stockFreshness: classifyFreshness(oldestUpdate, now),
      freshnessScore: freshnessScore(oldestUpdate, now),

      reliabilityScore: Number(organization.reliability_score ?? 75),

      unitPrice,
      estimatedTotalPrice: unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100,

      // Exactly what to reserve, in the order it should be picked.
      allocation,
    });
  }

  const ranked = flagRecommended(rankCandidates(candidates, quantity), {
    maximumEtaMinutes: request.maximumEtaMinutes ?? null,
  });

  const limit = request.limit || 20;
  const results = ranked.slice(0, limit).map(({ freshnessScore: _score, ...rest }) => rest);

  return {
    query: describeQuery(item, itemType, quantity, origin, request),
    results,
    meta: {
      candidatesConsidered: candidates.length,
      returned: results.length,
      originResolved: origin.latitude !== null && origin.longitude !== null,
      // Say so plainly when distance is unavailable, rather than ranking on
      // silently missing data.
      distanceAvailable: candidates.some((candidate) => candidate.distanceKm !== null),
    },
  };
}

function describeQuery(item, itemType, quantity, origin, request) {
  return {
    itemType,
    itemId: item.id,
    itemName: item.name,
    quantity,
    priority: request.priority || PRIORITY.NORMAL,
    maximumEtaMinutes: request.maximumEtaMinutes ?? null,
    maxDistanceKm: request.maxDistanceKm ?? null,
    origin,
  };
}

function emptyResult(item, itemType, quantity, origin, request) {
  return {
    query: describeQuery(item, itemType, quantity, origin, request),
    results: [],
    meta: { candidatesConsidered: 0, returned: 0, originResolved: origin.latitude !== null, distanceAvailable: false },
  };
}

/**
 * Push an emergency request to the organisations that can fill it, so a
 * CRITICAL search does not depend on someone watching a dashboard.
 * Opt-in: the hospital asks for it with `notifySuppliers=true`.
 */
async function broadcastEmergency(searchResult, requester, requesterOrganization) {
  const targets = searchResult.results.filter((result) => result.recommended).slice(0, 5);

  await Promise.all(
    targets.map((target) =>
      notifications.createForOrganization(target.supplierId, {
        type: NOTIFICATION_TYPES.EMERGENCY_REQUEST,
        title: `${searchResult.query.priority} request: ${searchResult.query.itemName}`,
        message: `${requesterOrganization?.name || 'A verified hospital'} is looking for ${searchResult.query.quantity} unit(s) of ${searchResult.query.itemName}.`,
        metadata: {
          itemId: searchResult.query.itemId,
          itemName: searchResult.query.itemName,
          quantity: searchResult.query.quantity,
          priority: searchResult.query.priority,
          requestedBy: requesterOrganization?.id || null,
          requestedByProfile: requester.id,
        },
      })
    )
  );

  return targets.length;
}

module.exports = { findSuppliers, broadcastEmergency, allocateBatches, blendedUnitPrice };
