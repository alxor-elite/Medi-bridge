'use strict';

const express = require('express');
const { body } = require('express-validator');

const controller = require('../controllers/auth.controller');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { ROLES, ORGANIZATION_TYPES } = require('../config/constants');

const router = express.Router();

/**
 * Public registration accepts HOSPITAL, SUPPLIER and DELIVERY.
 * ADMIN is intentionally missing - see POST /api/admin/users.
 */
const PUBLIC_ROLES = [ROLES.HOSPITAL, ROLES.SUPPLIER, ROLES.DELIVERY];

const registerRules = [
  body('email').isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password')
    .isString()
    .isLength({ min: 8 })
    .withMessage('Password must be at least 8 characters long.'),
  body('fullName').isString().trim().notEmpty().withMessage('Full name is required.'),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('role').isIn(PUBLIC_ROLES).withMessage(`Role must be one of: ${PUBLIC_ROLES.join(', ')}.`),

  // Either join an existing organisation...
  body('organizationId').optional({ nullable: true }).isString().trim().notEmpty(),

  // ...or register a new one, which starts PENDING verification.
  body('organization').optional({ nullable: true }).isObject(),
  body('organization.name').if(body('organization').exists()).isString().trim().notEmpty()
    .withMessage('Organisation name is required.'),
  body('organization.type').if(body('organization').exists()).isIn(Object.values(ORGANIZATION_TYPES))
    .withMessage(`Organisation type must be one of: ${Object.values(ORGANIZATION_TYPES).join(', ')}.`),
  body('organization.registrationNumber').if(body('organization').exists()).isString().trim().notEmpty()
    .withMessage('Registration number is required.'),
  body('organization.latitude').if(body('organization').exists()).optional({ nullable: true })
    .isFloat({ min: -90, max: 90 }).withMessage('Latitude must be between -90 and 90.'),
  body('organization.longitude').if(body('organization').exists()).optional({ nullable: true })
    .isFloat({ min: -180, max: 180 }).withMessage('Longitude must be between -180 and 180.'),
];

const loginRules = [
  body('email').isEmail().withMessage('A valid email address is required.').normalizeEmail(),
  body('password').isString().notEmpty().withMessage('Password is required.'),
];

const changePasswordRules = [
  body('currentPassword').isString().notEmpty().withMessage('Your current password is required.'),
  body('newPassword').isString().isLength({ min: 8 })
    .withMessage('New password must be at least 8 characters long.'),
];

router.post('/register', registerRules, validate, controller.register);
router.post('/login', loginRules, validate, controller.login);

router.get('/me', requireAuth, controller.me);
router.patch(
  '/me',
  requireAuth,
  [
    body('fullName').optional().isString().trim().notEmpty(),
    body('phone').optional({ nullable: true }).isString().trim(),
  ],
  validate,
  controller.updateMe
);
router.post('/change-password', requireAuth, changePasswordRules, validate, controller.changePassword);

module.exports = router;
