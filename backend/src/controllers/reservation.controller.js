'use strict';

const reservationService = require('../services/reservation.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');

/** HTTP layer for /api/reservations. */

const create = asyncHandler(async (req, res) => {
  return sendCreated(res, await reservationService.create(req.body, req.user));
});

const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const reservations = await reservationService.list(
    { status: req.query.status, organizationId: req.query.organizationId, limit, offset },
    req.user
  );

  return sendSuccess(res, reservations, 200, { limit, offset, count: reservations.length });
});

const release = asyncHandler(async (req, res) => {
  return sendSuccess(res, await reservationService.release(req.params.id, req.user));
});

const releaseGroup = asyncHandler(async (req, res) => {
  const released = await reservationService.releaseGroup(req.params.groupId, req.user);
  return sendSuccess(res, released, 200, { count: released.length });
});

module.exports = { create, list, release, releaseGroup };
