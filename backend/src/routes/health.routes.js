'use strict';

const express = require('express');
const db = require('../db');
const { env } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

/**
 * GET /api/health
 * Unauthenticated liveness probe used by deployments and by the frontend to
 * confirm it is pointed at a reachable API.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const database = await db.healthCheck().catch((error) => ({ reachable: false, message: error.message }));

    res.status(200).json({
      status: 'ok',
      service: 'MediBridge API',
      environment: env.nodeEnv,
      uptimeSeconds: Math.round(process.uptime()),
      database,
    });
  })
);

module.exports = router;
