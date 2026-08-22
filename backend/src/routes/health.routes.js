'use strict';

const express = require('express');
const db = require('../db');
const { env } = require('../config/env');
const asyncHandler = require('../utils/asyncHandler');

const router = express.Router();

/** A hung database must not hang the probe - report it as unreachable instead. */
const DB_CHECK_TIMEOUT_MS = 5000;

function checkDatabase() {
  return Promise.race([
    db.healthCheck(),
    new Promise((resolve) =>
      setTimeout(
        () => resolve({ reachable: false, message: `No answer within ${DB_CHECK_TIMEOUT_MS}ms.` }),
        DB_CHECK_TIMEOUT_MS
      ).unref()
    ),
  ]).catch((error) => ({ reachable: false, message: error.message }));
}

/**
 * GET /api/health
 * Unauthenticated liveness probe used by deployments and by the frontend to
 * confirm it is pointed at a reachable API. Always answers 200 while the
 * process is alive; `database.reachable` carries the dependency status.
 */
router.get(
  '/',
  asyncHandler(async (req, res) => {
    const database = await checkDatabase();

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
