'use strict';

const { validationResult } = require('express-validator');
const ApiError = require('../utils/ApiError');
const { ERROR_CODES } = require('../config/constants');

/**
 * Runs after a route's express-validator chain and turns any collected
 * problems into a single VALIDATION_ERROR response, so the frontend can show
 * field level messages without parsing prose.
 */
function validate(req, res, next) {
  const result = validationResult(req);
  if (result.isEmpty()) return next();

  const details = result.array().map((issue) => ({
    field: issue.path ?? issue.param,
    message: issue.msg,
  }));

  return next(
    new ApiError(400, ERROR_CODES.VALIDATION_ERROR, 'The request did not pass validation.', details)
  );
}

module.exports = validate;
