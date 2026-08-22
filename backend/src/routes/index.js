'use strict';

const express = require('express');

/**
 * The public API surface. Every path the frontend consumes is mounted here,
 * so this file doubles as the routing table documented in API.md.
 */
const router = express.Router();

router.use('/health', require('./health.routes'));
router.use('/auth', require('./auth.routes'));
router.use('/organizations', require('./organization.routes'));
router.use('/medicines', require('./medicine.routes'));
router.use('/equipment', require('./equipment.routes'));
router.use('/inventory', require('./inventory.routes'));
router.use('/search', require('./search.routes'));
router.use('/reservations', require('./reservation.routes'));
router.use('/orders', require('./order.routes'));
router.use('/deliveries', require('./delivery.routes'));
router.use('/notifications', require('./notification.routes'));
router.use('/ai', require('./ai.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
