'use strict';

const express = require('express');
const { body, query } = require('express-validator');

const controller = require('../controllers/search.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireVerifiedOrganization } = require('../middleware/auth');
const { PRIORITY, ITEM_TYPES } = require('../config/constants');

const router = express.Router();

// Searching reveals who holds what stock, so it is limited to signed-in users
// from verified organisations.
router.use(requireAuth, requireVerifiedOrganization);

const sharedRules = (source) => [
  source('medicineId').optional().isString().trim().notEmpty(),
  source('equipmentId').optional().isString().trim().notEmpty(),
  source('medicineName').optional().isString().trim().notEmpty(),
  source('itemType').optional().isIn(Object.values(ITEM_TYPES)),
  source('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1.'),
  source('priority').optional().isIn(Object.values(PRIORITY)),
  source('maximumEtaMinutes').optional().isInt({ min: 1 }),
  source('maxDistanceKm').optional().isFloat({ min: 0 }),
  source('latitude').optional().isFloat({ min: -90, max: 90 }),
  source('longitude').optional().isFloat({ min: -180, max: 180 }),
  source('limit').optional().isInt({ min: 1, max: 100 }),
];

router.get('/suppliers', sharedRules(query), validate, controller.suppliers);
router.post('/emergency', sharedRules(body), validate, controller.emergency);

module.exports = router;
