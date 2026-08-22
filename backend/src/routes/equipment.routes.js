'use strict';

const express = require('express');
const { body, param, query } = require('express-validator');

const controller = require('../controllers/catalog.controller').equipment;
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

/** Fresh chains per route - see the note in medicine.routes.js. */
function writeRules({ partial }) {
  const name = partial
    ? body('name').optional().isString().trim().notEmpty()
    : body('name').isString().trim().notEmpty().withMessage('Equipment name is required.');

  return [
    name,
    body('category').optional({ nullable: true }).isString().trim(),
    body('manufacturer').optional({ nullable: true }).isString().trim(),
    body('model').optional({ nullable: true }).isString().trim(),
    body('description').optional({ nullable: true }).isString().trim(),
  ];
}

router.get('/', listRules, validate, controller.list);
router.get('/:id', [param('id').isString().trim().notEmpty()], validate, controller.getById);

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
