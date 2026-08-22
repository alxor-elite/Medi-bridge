'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/reservation.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole, requireVerifiedOrganization } = require('../middleware/auth');
const { ROLES, RESERVATION_STATUS } = require('../config/constants');

const router = express.Router();

router.use(requireAuth, requireVerifiedOrganization);

const createRules = [
  // Either one batch...
  body('inventoryId').optional().isString().trim().notEmpty(),
  body('quantity').optional().isInt({ min: 1 }).withMessage('Quantity must be at least 1.'),
  // ...or the allocation a search result handed back.
  body('allocation').optional().isArray({ min: 1 }),
  body('allocation.*.inventoryId').optional().isString().trim().notEmpty(),
  body('allocation.*.quantity').optional().isInt({ min: 1 }),
  body('notes').optional({ nullable: true }).isString().trim(),
];

// Reserving is a buyer's action; suppliers and admins can still read and
// release holds against their own stock.
router.post(
  '/',
  requireRole(ROLES.HOSPITAL, ROLES.ADMIN),
  createRules,
  validate,
  controller.create
);

router.get(
  '/',
  [
    query('status').optional().isIn(Object.values(RESERVATION_STATUS)),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.list
);

router.delete('/group/:groupId', [param('groupId').isString().trim().notEmpty()], validate, controller.releaseGroup);
router.delete('/:id', [param('id').isString().trim().notEmpty()], validate, controller.release);

module.exports = router;
