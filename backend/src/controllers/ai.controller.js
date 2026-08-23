'use strict';

const aiService = require('../services/ai.service');
const chatService = require('../services/chat.service');
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

/**
 * POST /api/ai/chat
 * The assistant endpoint the frontend talks to. Answers come from the primary
 * MediBridge AI, or - only when that actually fails - from the Gemini
 * fallback. Which one answered is decided here and nowhere else.
 *
 * This is the one endpoint that does not use sendSuccess(). The assistant's
 * contract predates the { success, data } envelope and the frontend reads
 * `response` from the top level, so the shape is preserved deliberately:
 *
 *   { "success": true, "response": "...", "provider": "local" }
 */
const chat = asyncHandler(async (req, res) => {
  const { status, body } = await chatService.chat(req.body.message, req.user);
  return res.status(status).json(body);
});

/**
 * GET /api/ai/diagnostics
 * Whether each provider is answering from this process, and the exact reason
 * when one is not. Admin only; reports that a key is configured, never the
 * key. Calling it makes one real request to each provider.
 */
const diagnostics = asyncHandler(async (req, res) => {
  return sendSuccess(res, await chatService.diagnose());
});

module.exports = { parseRequest, emergencySearch, shortageForecast, chat, diagnostics };
