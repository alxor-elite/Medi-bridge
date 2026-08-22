'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/order.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, requireVerifiedOrganization } = require('../middleware/auth');
const { ROLES, ORDER_STATUS, PRIORITY } = require('../config/constants');

const router = express.Router();

router.use(requireAuth, requireVerifiedOrganization);

const createRules = [
  // Spend an existing hold...
  body('reservationGroupId').optional().isString().trim().notEmpty(),
  body('reservationIds').optional().isArray({ min: 1 }),
  body('reservationIds.*').optional().isString().trim().notEmpty(),
  // ...or hand over the lines and let the service reserve them.
  body('items').optional().isArray({ min: 1 }),
  body('items.*.inventoryId').optional().isString().trim().notEmpty(),
  body('items.*.quantity').optional().isInt({ min: 1 }),

  body('priority').optional().isIn(Object.values(PRIORITY))
    .withMessage(`Priority must be one of: ${Object.values(PRIORITY).join(', ')}.`),
  body('deliveryAddress').optional({ nullable: true }).isString().trim(),
  body('deliveryLatitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body('deliveryLongitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
  body('requiredByMinutes').optional({ nullable: true }).isInt({ min: 1 }),
  body('currency').optional({ nullable: true }).isString().trim().isLength({ min: 3, max: 3 }),
  body('notes').optional({ nullable: true }).isString().trim(),
];

// Placing an order is the buying side's action.
router.post('/', requireRole(ROLES.HOSPITAL, ROLES.ADMIN), createRules, validate, controller.create);

router.get(
  '/',
  [
    query('status').optional().isIn(Object.values(ORDER_STATUS)),
    query('priority').optional().isIn(Object.values(PRIORITY)),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.list
);

router.get('/:id', [param('id').isString().trim().notEmpty()], validate, controller.getById);

/**
 * Which role may request which status is decided in the order service, from
 * ORDER_STATUS_ACTORS - the route only checks the value is a real status.
 */
router.patch(
  '/:id/status',
  [
    param('id').isString().trim().notEmpty(),
    body('status').isIn(Object.values(ORDER_STATUS))
      .withMessage(`Status must be one of: ${Object.values(ORDER_STATUS).join(', ')}.`),
    body('reason').optional({ nullable: true }).isString().trim(),
    body('note').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  controller.updateStatus
);

module.exports = router;
