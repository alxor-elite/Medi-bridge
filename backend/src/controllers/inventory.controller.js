'use strict';

const inventoryService = require('../services/inventory.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');

/** HTTP layer for /api/inventory. */

const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 100;
  const offset = Number(req.query.offset) || 0;

  const items = await inventoryService.list(
    {
      organizationId: req.query.organizationId,
      itemType: req.query.itemType,
      medicineId: req.query.medicineId,
      equipmentId: req.query.equipmentId,
      includeExpired: req.query.includeExpired === 'true',
      inStockOnly: req.query.inStockOnly === 'true',
      limit,
      offset,
    },
    req.user
  );

  return sendSuccess(res, items, 200, { limit, offset, count: items.length });
});

const getById = asyncHandler(async (req, res) => {
  return sendSuccess(res, await inventoryService.getById(req.params.id, req.user));
});

const create = asyncHandler(async (req, res) => {
  return sendCreated(res, await inventoryService.create(req.body, req.user));
});

const update = asyncHandler(async (req, res) => {
  return sendSuccess(res, await inventoryService.update(req.params.id, req.body, req.user));
});

const remove = asyncHandler(async (req, res) => {
  return sendSuccess(res, await inventoryService.remove(req.params.id, req.user));
});

const expiringSoon = asyncHandler(async (req, res) => {
  const withinDays = Number(req.query.withinDays) || 30;
  const organizationId = req.query.organizationId || req.user.organization_id;
  const items = await inventoryService.expiringSoon(organizationId, withinDays, req.user);
  return sendSuccess(res, items, 200, { withinDays, count: items.length });
});

module.exports = { list, getById, create, update, remove, expiringSoon };
