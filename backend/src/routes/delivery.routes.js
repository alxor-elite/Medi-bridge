'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/delivery.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES, DELIVERY_STATUS } = require('../config/constants');

const router = express.Router();

// Couriers have no organisation of their own, so this router checks
// authentication only - who may touch which delivery is decided per record in
// the service.
router.use(requireAuth);

router.post(
  '/',
  requireRole(ROLES.SUPPLIER, ROLES.ADMIN),
  [
    body('orderId').isString().trim().notEmpty().withMessage('orderId is required.'),
    body('deliveryPartnerId').optional({ nullable: true }).isString().trim().notEmpty(),
    body('estimatedArrival').optional({ nullable: true }).isISO8601(),
    body('vehicleType').optional({ nullable: true }).isString().trim(),
    body('vehicleNumber').optional({ nullable: true }).isString().trim(),
    body('contactPhone').optional({ nullable: true }).isString().trim(),
    body('currentLatitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
    body('currentLongitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
    body('notes').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  controller.create
);

router.get(
  '/',
  [
    query('status').optional().isIn(Object.values(DELIVERY_STATUS)),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.list
);

router.get('/by-order/:orderId', [param('orderId').isString().trim().notEmpty()], validate, controller.getByOrderId);
router.get('/:id', [param('id').isString().trim().notEmpty()], validate, controller.getById);

router.patch(
  '/:id/status',
  [
    param('id').isString().trim().notEmpty(),
    body('status').isIn(Object.values(DELIVERY_STATUS))
      .withMessage(`Status must be one of: ${Object.values(DELIVERY_STATUS).join(', ')}.`),
    body('note').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  controller.updateStatus
);

router.patch(
  '/:id/location',
  [
    param('id').isString().trim().notEmpty(),
    body('latitude').isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.'),
    body('longitude').isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.'),
  ],
  validate,
  controller.updateLocation
);

module.exports = router;
