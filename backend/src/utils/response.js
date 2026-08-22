'use strict';

/**
 * Every successful response has the same shape:
 *   { "success": true, "data": ... }
 * Optional `meta` carries pagination and other envelope-level information.
 */
function sendSuccess(res, data, statusCode = 200, meta) {
  const body = { success: true, data };
  if (meta) body.meta = meta;
  return res.status(statusCode).json(body);
}

function sendCreated(res, data, meta) {
  return sendSuccess(res, data, 201, meta);
}

module.exports = { sendSuccess, sendCreated };
