'use strict';

const notificationService = require('../services/notification.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess } = require('../utils/response');

/** HTTP layer for /api/notifications. */

const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const { items, unreadCount } = await notificationService.listForUser(req.user, {
    unreadOnly: req.query.unreadOnly === 'true',
    limit,
    offset,
  });

  return sendSuccess(res, items, 200, { limit, offset, count: items.length, unreadCount });
});

const markRead = asyncHandler(async (req, res) => {
  return sendSuccess(res, await notificationService.markRead(req.params.id, req.user));
});

const markAllRead = asyncHandler(async (req, res) => {
  return sendSuccess(res, await notificationService.markAllRead(req.user));
});

module.exports = { list, markRead, markAllRead };
