'use strict';

const deliveryService = require('../services/delivery.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');

/** HTTP layer for /api/deliveries. */

const create = asyncHandler(async (req, res) => {
  return sendCreated(res, await deliveryService.create(req.body, req.user));
});

const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const deliveries = await deliveryService.list({ status: req.query.status, limit, offset }, req.user);
  return sendSuccess(res, deliveries, 200, { limit, offset, count: deliveries.length });
});

const getById = asyncHandler(async (req, res) => {
  return sendSuccess(res, await deliveryService.getById(req.params.id, req.user));
});

const getByOrderId = asyncHandler(async (req, res) => {
  return sendSuccess(res, await deliveryService.getByOrderId(req.params.orderId, req.user));
});

const updateStatus = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.updateStatus(req.params.id, req.body.status, req.user, {
    note: req.body.note,
  });
  return sendSuccess(res, delivery);
});

const updateLocation = asyncHandler(async (req, res) => {
  const delivery = await deliveryService.updateLocation(
    req.params.id,
    { latitude: Number(req.body.latitude), longitude: Number(req.body.longitude) },
    req.user
  );
  return sendSuccess(res, delivery);
});

module.exports = { create, list, getById, getByOrderId, updateStatus, updateLocation };
