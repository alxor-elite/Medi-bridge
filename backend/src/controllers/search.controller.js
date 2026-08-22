'use strict';

const searchService = require('../services/search.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');
const { PRIORITY } = require('../config/constants');

/** HTTP layer for /api/search. */

function readRequest(source) {
  const optionalNumber = (value) => (value === undefined || value === '' ? undefined : Number(value));

  return {
    medicineId: source.medicineId,
    equipmentId: source.equipmentId,
    medicineName: source.medicineName || source.medicine,
    itemType: source.itemType,
    quantity: optionalNumber(source.quantity) ?? 1,
    priority: source.priority || PRIORITY.NORMAL,
    maximumEtaMinutes: optionalNumber(source.maximumEtaMinutes),
    maxDistanceKm: optionalNumber(source.maxDistanceKm),
    latitude: optionalNumber(source.latitude),
    longitude: optionalNumber(source.longitude),
    limit: optionalNumber(source.limit),
  };
}

/**
 * GET /api/search/suppliers
 * The main discovery endpoint: who can supply this, how fast, at what cost.
 */
const suppliers = asyncHandler(async (req, res) => {
  const request = readRequest(req.query);
  const result = await searchService.findSuppliers(request, req.user);

  if (req.query.notifySuppliers === 'true') {
    result.meta.suppliersNotified = await searchService.broadcastEmergency(
      result,
      req.user,
      req.organization
    );
  }

  return sendSuccess(res, result);
});

/**
 * POST /api/search/emergency
 * Same search, given as a JSON body. Convenient for a longer request and for
 * the AI parser's structured output.
 */
const emergency = asyncHandler(async (req, res) => {
  const request = readRequest(req.body);
  const result = await searchService.findSuppliers(request, req.user);

  if (req.body.notifySuppliers === true) {
    result.meta.suppliersNotified = await searchService.broadcastEmergency(
      result,
      req.user,
      req.organization
    );
  }

  return sendSuccess(res, result);
});

module.exports = { suppliers, emergency };
