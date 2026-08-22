'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/inventory.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, requireVerifiedOrganization } = require('../middleware/auth');
const { ROLES, ITEM_TYPES, EQUIPMENT_CONDITION } = require('../config/constants');

const router = express.Router();

router.use(requireAuth);

/**
 * Holding stock is a trading activity, so writes need a verified organisation.
 * Hospitals are included: a hospital with a surplus can supply another
 * hospital, which is the whole point of the network.
 */
const canHoldStock = [
  requireRole(ROLES.SUPPLIER, ROLES.HOSPITAL, ROLES.ADMIN),
  requireVerifiedOrganization,
];

const createRules = [
  body('itemType').isIn(Object.values(ITEM_TYPES))
    .withMessage(`itemType must be one of: ${Object.values(ITEM_TYPES).join(', ')}.`),
  body('medicineId').optional({ nullable: true }).isString().trim().notEmpty(),
  body('equipmentId').optional({ nullable: true }).isString().trim().notEmpty(),
  body('quantity').isInt({ min: 0 }).withMessage('Quantity must be zero or more.'),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Price cannot be negative.'),
  body('batchNumber').optional({ nullable: true }).isString().trim(),
  body('unit').optional({ nullable: true }).isString().trim(),
  body('expiryDate').optional({ nullable: true }).isISO8601().withMessage('Expiry date must be an ISO date.'),
  body('storageRequirement').optional({ nullable: true }).isString().trim(),
  body('condition').optional({ nullable: true }).isIn(Object.values(EQUIPMENT_CONDITION)),
  body('lowStockThreshold').optional({ nullable: true }).isInt({ min: 0 }),
];

const updateRules = [
  param('id').isString().trim().notEmpty(),
  body('quantity').optional().isInt({ min: 0 }).withMessage('Quantity must be zero or more.'),
  body('price').optional({ nullable: true }).isFloat({ min: 0 }).withMessage('Price cannot be negative.'),
  body('batchNumber').optional({ nullable: true }).isString().trim(),
  body('unit').optional({ nullable: true }).isString().trim(),
  body('expiryDate').optional({ nullable: true }).isISO8601(),
  body('storageRequirement').optional({ nullable: true }).isString().trim(),
  body('condition').optional({ nullable: true }).isIn(Object.values(EQUIPMENT_CONDITION)),
  body('lowStockThreshold').optional({ nullable: true }).isInt({ min: 0 }),
];

router.get(
  '/',
  [
    query('organizationId').optional().isString().trim().notEmpty(),
    query('itemType').optional().isIn(Object.values(ITEM_TYPES)),
    query('limit').optional().isInt({ min: 1, max: 500 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.list
);

router.get(
  '/expiring-soon',
  [query('withinDays').optional().isInt({ min: 1, max: 365 })],
  validate,
  controller.expiringSoon
);

router.get('/:id', [param('id').isString().trim().notEmpty()], validate, controller.getById);

router.post('/', canHoldStock, createRules, validate, controller.create);
router.patch('/:id', canHoldStock, updateRules, validate, controller.update);
router.delete(
  '/:id',
  canHoldStock,
  [param('id').isString().trim().notEmpty()],
  validate,
  controller.remove
);

module.exports = router;
