'use strict';

/**
 * Wraps an async route handler so a rejected promise reaches Express'
 * error handler instead of hanging the request.
 */
function asyncHandler(handler) {
  return function wrapped(req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
