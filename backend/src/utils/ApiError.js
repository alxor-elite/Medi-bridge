'use strict';

const { ERROR_CODES } = require('../config/constants');

/**
 * An error the API knows how to present to a client.
 * Anything else that reaches the error handler is treated as a bug and
 * reported as a generic 500 without leaking internals.
 */
class ApiError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    this.isApiError = true;
    Error.captureStackTrace(this, ApiError);
  }

  static badRequest(message, code = ERROR_CODES.VALIDATION_ERROR, details) {
    return new ApiError(400, code, message, details);
  }

  static unauthorized(message = 'Authentication is required.', code = ERROR_CODES.UNAUTHENTICATED) {
    return new ApiError(401, code, message);
  }

  static forbidden(message = 'You are not allowed to perform this action.', code = ERROR_CODES.FORBIDDEN) {
    return new ApiError(403, code, message);
  }

  static notFound(message = 'Resource not found.', code = ERROR_CODES.NOT_FOUND) {
    return new ApiError(404, code, message);
  }

  static conflict(message, code = ERROR_CODES.CONFLICT, details) {
    return new ApiError(409, code, message, details);
  }

  static internal(message = 'Something went wrong.', code = ERROR_CODES.INTERNAL_ERROR) {
    return new ApiError(500, code, message);
  }
}

module.exports = ApiError;
