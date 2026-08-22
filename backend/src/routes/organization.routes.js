'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/organization.controller');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');
const { ORGANIZATION_TYPES, VERIFICATION_STATUS } = require('../config/constants');

const router = express.Router();

// Everything about an organisation requires a signed-in user - the directory
// of verified suppliers is not public data.
router.use(requireAuth);

const createRules = [
  body('name').isString().trim().notEmpty().withMessage('Organisation name is required.'),
  body('type').isIn(Object.values(ORGANIZATION_TYPES))
    .withMessage(`Type must be one of: ${Object.values(ORGANIZATION_TYPES).join(', ')}.`),
  body('registrationNumber').isString().trim().notEmpty().withMessage('Registration number is required.'),
  body('licenseNumber').optional({ nullable: true }).isString().trim(),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('email').optional({ nullable: true }).isEmail().withMessage('Organisation email must be valid.'),
  body('address').optional({ nullable: true }).isString().trim(),
  body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
];

const updateRules = [
  param('id').isString().trim().notEmpty(),
  body('name').optional().isString().trim().notEmpty(),
  body('licenseNumber').optional({ nullable: true }).isString().trim(),
  body('phone').optional({ nullable: true }).isString().trim(),
  body('email').optional({ nullable: true }).isEmail(),
  body('address').optional({ nullable: true }).isString().trim(),
  body('latitude').optional({ nullable: true }).isFloat({ min: -90, max: 90 }),
  body('longitude').optional({ nullable: true }).isFloat({ min: -180, max: 180 }),
];

const documentRules = [
  param('id').isString().trim().notEmpty(),
  body('documentType').isString().trim().notEmpty().withMessage('Document type is required.'),
  body('fileUrl').isURL().withMessage('A link to the uploaded document is required.'),
  body('documentNumber').optional({ nullable: true }).isString().trim(),
  body('issuedBy').optional({ nullable: true }).isString().trim(),
  body('expiresOn').optional({ nullable: true }).isISO8601().withMessage('Expiry must be an ISO date.'),
  body('notes').optional({ nullable: true }).isString().trim(),
];

router.post('/', createRules, validate, controller.create);

router.get(
  '/',
  [
    query('type').optional().isIn(Object.values(ORGANIZATION_TYPES)),
    query('verificationStatus').optional().isIn(Object.values(VERIFICATION_STATUS)),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.list
);

router.get('/:id', [param('id').isString().trim().notEmpty()], validate, controller.getById);
router.patch('/:id', updateRules, validate, controller.update);

router.post('/:id/documents', documentRules, validate, controller.addDocument);
router.get('/:id/documents', [param('id').isString().trim().notEmpty()], validate, controller.listDocuments);

module.exports = router;
