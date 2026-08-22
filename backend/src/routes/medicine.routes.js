'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/catalog.controller').medicines;
const validate = require('../middleware/validate');
const { requireAuth, requireRole, requireVerifiedOrganization } = require('../middleware/auth');
const { ROLES } = require('../config/constants');

const router = express.Router();

router.use(requireAuth);

const listRules = [
  query('search').optional().isString().trim(),
  query('category').optional().isString().trim(),
  query('manufacturer').optional().isString().trim(),
  query('limit').optional().isInt({ min: 1, max: 200 }),
  query('offset').optional().isInt({ min: 0 }),
];

/**
 * Built fresh per route: validator chains are mutable, so sharing one array
 * between the create and update routes would let PATCH's `.optional()` leak
 * back into POST and make the name optional there too.
 */
function writeRules({ partial }) {
  const name = partial
    ? body('name').optional().isString().trim().notEmpty()
    : body('name').isString().trim().notEmpty().withMessage('Medicine name is required.');

  return [
    name,
    body('genericName').optional({ nullable: true }).isString().trim(),
    body('manufacturer').optional({ nullable: true }).isString().trim(),
    body('category').optional({ nullable: true }).isString().trim(),
    body('description').optional({ nullable: true }).isString().trim(),
    body('strength').optional({ nullable: true }).isString().trim(),
    body('form').optional({ nullable: true }).isString().trim(),
    body('requiresPrescription').optional({ nullable: true }).isBoolean(),
  ];
}

// Anyone signed in may read the catalogue - a hospital has to be able to find
// a medicine before it can order one.
router.get('/', listRules, validate, controller.list);
router.get('/:id', [param('id').isString().trim().notEmpty()], validate, controller.getById);

// Adding to the shared catalogue is limited to verified trading organisations
// and admins, so unverified accounts cannot pollute it.
const canWrite = [requireRole(ROLES.SUPPLIER, ROLES.HOSPITAL, ROLES.ADMIN), requireVerifiedOrganization];

router.post('/', canWrite, writeRules({ partial: false }), validate, controller.create);
router.patch(
  '/:id',
  canWrite,
  [param('id').isString().trim().notEmpty(), ...writeRules({ partial: true })],
  validate,
  controller.update
);

module.exports = router;
