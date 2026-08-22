'use strict';

const orderService = require('../services/order.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');

/** HTTP layer for /api/orders. */

const create = asyncHandler(async (req, res) => {
  return sendCreated(res, await orderService.create(req.body, req.user));
});

const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const orders = await orderService.list(
    {
      status: req.query.status,
      priority: req.query.priority,
      organizationId: req.query.organizationId,
      supplierId: req.query.supplierId,
      limit,
      offset,
    },
    req.user
  );

  return sendSuccess(res, orders, 200, { limit, offset, count: orders.length });
});

const getById = asyncHandler(async (req, res) => {
  return sendSuccess(res, await orderService.getById(req.params.id, req.user));
});

const updateStatus = asyncHandler(async (req, res) => {
  const order = await orderService.updateStatus(req.params.id, req.body.status, req.user, {
    reason: req.body.reason,
    note: req.body.note,
  });
  return sendSuccess(res, order);
});

module.exports = { create, list, getById, updateStatus };
