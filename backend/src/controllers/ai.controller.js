'use strict';

const aiService = require('../services/ai.service');
const searchService = require('../services/search.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess } = require('../utils/response');

/** HTTP layer for /api/ai. */

/**
 * POST /api/ai/parse-request
 * Free text in, a structured search request out. No database facts are
 * asserted here beyond resolving the medicine against the real catalogue.
 */
const parseRequest = asyncHandler(async (req, res) => {
  return sendSuccess(res, await aiService.parseEmergencyRequest(req.body.text));
});

/**
 * POST /api/ai/emergency-search
 * Parse the sentence, then run the ordinary supplier search with the result.
 * Every supplier, price and stock figure in the response comes from the
 * database through search.service - the parser only decided what to look for.
 */
const emergencySearch = asyncHandler(async (req, res) => {
  const parsed = await aiService.parseEmergencyRequest(req.body.text);

  if (!parsed.medicineId) {
    throw ApiError.badRequest(
      'Could not match that request to a medicine in the catalogue. Try naming the medicine directly.',
      undefined,
      { parsed }
    );
  }

  const search = await searchService.findSuppliers(
    {
      medicineId: parsed.medicineId,
      quantity: parsed.quantity ?? 1,
      priority: parsed.priority,
      maximumEtaMinutes: parsed.maximumEtaMinutes,
      limit: req.body.limit,
    },
    req.user
  );

  if (req.body.notifySuppliers === true) {
    search.meta.suppliersNotified = await searchService.broadcastEmergency(search, req.user, req.organization);
  }

  return sendSuccess(res, { parsed, ...search });
});

/**
 * GET /api/ai/shortage-forecast
 * Days of cover left per medicine, from actual delivered volume.
 */
const shortageForecast = asyncHandler(async (req, res) => {
  const organizationId = req.query.organizationId || req.user.organization_id;

  if (req.user.role !== 'ADMIN' && organizationId !== req.user.organization_id) {
    throw ApiError.forbidden('You can only forecast your own organisation.');
  }

  const forecast = await aiService.predictShortages(organizationId, {
    windowDays: Number(req.query.windowDays) || 30,
    horizonDays: Number(req.query.horizonDays) || 7,
  });

  return sendSuccess(res, forecast);
});

module.exports = { parseRequest, emergencySearch, shortageForecast };
