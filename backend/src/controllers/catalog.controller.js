'use strict';

const { medicines, equipment } = require('../services/catalog.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');

/** HTTP layer for /api/medicines and /api/equipment. */

function createCatalogController(service) {
  return {
    list: asyncHandler(async (req, res) => {
      const limit = Number(req.query.limit) || 50;
      const offset = Number(req.query.offset) || 0;

      const items = await service.list({
        search: req.query.search,
        category: req.query.category,
        manufacturer: req.query.manufacturer,
        limit,
        offset,
      });

      return sendSuccess(res, items, 200, { limit, offset, count: items.length });
    }),

    getById: asyncHandler(async (req, res) => {
      return sendSuccess(res, await service.getByIdOrFail(req.params.id));
    }),

    create: asyncHandler(async (req, res) => {
      return sendCreated(res, await service.create(req.body, req.user));
    }),

    update: asyncHandler(async (req, res) => {
      return sendSuccess(res, await service.update(req.params.id, req.body, req.user));
    }),
  };
}

module.exports = {
  medicines: createCatalogController(medicines),
  equipment: createCatalogController(equipment),
};
