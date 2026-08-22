'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/admin.controller');
const validate = require('../middleware/validate');
const { requireAuth, requireRole } = require('../middleware/auth');
const { ROLES, VERIFICATION_STATUS, ORGANIZATION_TYPES } = require('../config/constants');

const router = express.Router();

// One gate for the whole admin surface, so no route here can be reached
// without the ADMIN role.
router.use(requireAuth, requireRole(ROLES.ADMIN));

router.get(
  '/verifications',
  [
    query('status').optional().isIn([...Object.values(VERIFICATION_STATUS), 'ALL']),
    query('type').optional().isIn(Object.values(ORGANIZATION_TYPES)),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.listVerifications
);

router.get(
  '/verifications/:id',
  [param('id').isString().trim().notEmpty()],
  validate,
  controller.getVerification
);

router.patch(
  '/verifications/:id',
  [
    param('id').isString().trim().notEmpty(),
    body('status').isIn(Object.values(VERIFICATION_STATUS))
      .withMessage(`Status must be one of: ${Object.values(VERIFICATION_STATUS).join(', ')}.`),
    body('notes').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  controller.decideVerification
);

router.post(
  '/users',
  [
    body('email').isEmail().normalizeEmail(),
    body('password').isString().isLength({ min: 8 }),
    body('fullName').isString().trim().notEmpty(),
    body('phone').optional({ nullable: true }).isString().trim(),
    body('role').isIn(Object.values(ROLES)),
    body('organizationId').optional({ nullable: true }).isString().trim().notEmpty(),
  ],
  validate,
  controller.createUser
);

router.get(
  '/audit-logs',
  [
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.listAuditLogs
);

module.exports = router;
