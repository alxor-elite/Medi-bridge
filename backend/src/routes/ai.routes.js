'use strict';

const express = require('express');
const { body, query } = require('express-validator');

const controller = require('../controllers/ai.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireVerifiedOrganization } = require('../middleware/auth');

const router = express.Router();

router.use(requireAuth, requireVerifiedOrganization);

router.post(
  '/parse-request',
  [body('text').isString().trim().isLength({ min: 3, max: 2000 })
    .withMessage('Provide the request text, between 3 and 2000 characters.')],
  validate,
  controller.parseRequest
);

router.post(
  '/emergency-search',
  [
    body('text').isString().trim().isLength({ min: 3, max: 2000 }),
    body('limit').optional().isInt({ min: 1, max: 100 }),
    body('notifySuppliers').optional().isBoolean(),
  ],
  validate,
  controller.emergencySearch
);

router.get(
  '/shortage-forecast',
  [
    query('organizationId').optional().isString().trim().notEmpty(),
    query('windowDays').optional().isInt({ min: 1, max: 365 }),
    query('horizonDays').optional().isInt({ min: 1, max: 90 }),
  ],
  validate,
  controller.shortageForecast
);

module.exports = router;
