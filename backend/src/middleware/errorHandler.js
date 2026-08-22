'use strict';

const { env } = require('../config/env');
const { ERROR_CODES } = require('../config/constants');
const ApiError = require('../utils/ApiError');

/**
 * Centralised error handling. Every failure - thrown, rejected or unmatched
 * route - leaves the API in the same shape:
 *
 *   { "success": false, "error": { "code": "...", "message": "..." } }
 */

function notFoundHandler(req, res, next) {
  next(new ApiError(404, ERROR_CODES.NOT_FOUND, `No route matches ${req.method} ${req.originalUrl}.`));
}

/**
 * Body-parser rejects malformed or oversized request bodies before any route
 * runs. Those are the client's mistake, so they must come back as 4xx with a
 * useful code - not as a 500 with a stack trace.
 */
function translateBodyParserError(error) {
  if (!error || error.isApiError) return null;

  if (error.type === 'entity.parse.failed' || (error instanceof SyntaxError && 'body' in error)) {
    return new ApiError(
      400,
      ERROR_CODES.VALIDATION_ERROR,
      'The request body is not valid JSON. Check for unescaped quotes or a truncated payload.'
    );
  }

  if (error.type === 'entity.too.large') {
    return new ApiError(413, ERROR_CODES.VALIDATION_ERROR, 'The request body is too large.');
  }

  return null;
}

// eslint-disable-next-line no-unused-vars -- Express identifies error handlers by arity.
function errorHandler(error, req, res, next) {
  // eslint-disable-next-line no-param-reassign
  error = translateBodyParserError(error) || error;

  const isKnown = error && error.isApiError === true;

  if (!isKnown && !env.isTest) {
    // Unexpected failures are bugs: log them server-side with the stack, but
    // never send the stack to the client.
    console.error('[error]', req.method, req.originalUrl, error);
  }

  const statusCode = isKnown ? error.statusCode : 500;
  const body = {
    success: false,
    error: {
      code: isKnown ? error.code : ERROR_CODES.INTERNAL_ERROR,
      message: isKnown ? error.message : 'Something went wrong. Please try again.',
    },
  };

  if (isKnown && error.details !== undefined) {
    body.error.details = error.details;
  }

  // Stack traces are a development aid only - section 23 forbids them in
  // production responses.
  if (!isKnown && !env.isProduction && error instanceof Error) {
    body.error.debug = { message: error.message, stack: error.stack?.split('\n').slice(0, 5) };
  }

  return res.status(statusCode).json(body);
}

module.exports = { notFoundHandler, errorHandler };
