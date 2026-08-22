'use strict';

const express = require('express');
const { param, query } = require('express-validator');

const controller = require('../controllers/notification.controller');
const validate = require('../middleware/validate');
const { requireAuth } = require('../middleware/auth');

const router = express.Router();

// Notifications are personal: every route here is scoped to req.user, so a
// verified organisation is not required (a pending one still needs to be told
// it was approved).
router.use(requireAuth);

router.get(
  '/',
  [
    query('unreadOnly').optional().isBoolean(),
    query('limit').optional().isInt({ min: 1, max: 200 }),
    query('offset').optional().isInt({ min: 0 }),
  ],
  validate,
  controller.list
);

router.patch('/read-all', controller.markAllRead);
router.patch('/:id/read', [param('id').isString().trim().notEmpty()], validate, controller.markRead);

module.exports = router;
