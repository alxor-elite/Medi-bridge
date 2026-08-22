'use strict';

const authService = require('../services/auth.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');

/**
 * HTTP layer for /api/auth. Controllers translate between the request and the
 * service; all rules live in auth.service.js.
 */

const register = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body);
  return sendCreated(res, result);
});

const login = asyncHandler(async (req, res) => {
  const result = await authService.login(req.body);
  return sendSuccess(res, result);
});

const me = asyncHandler(async (req, res) => {
  return sendSuccess(res, await authService.getCurrentUser(req.user));
});

const updateMe = asyncHandler(async (req, res) => {
  const profile = await authService.updateProfile(req.user, req.body);
  return sendSuccess(res, { profile });
});

const changePassword = asyncHandler(async (req, res) => {
  return sendSuccess(res, await authService.changePassword(req.user, req.body));
});

module.exports = { register, login, me, updateMe, changePassword };
