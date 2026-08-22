'use strict';

const express = require('express');
const cors = require('cors');

const { env } = require('./config/env');
const routes = require('./routes');
const { notFoundHandler, errorHandler } = require('./middleware/errorHandler');

/**
 * Builds the Express application.
 *
 * Exported without calling `listen()` so tests can drive it in-process and
 * `server.js` stays a thin entry point.
 */
function createApp() {
  const app = express();

  // Behind a load balancer (Render/Railway/Fly) this makes req.ip honest.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(
    cors({
      origin(origin, callback) {
        // Same-origin, curl and server-to-server calls send no Origin header.
        if (!origin) return callback(null, true);
        if (env.clientUrls.includes(origin)) return callback(null, true);
        return callback(new Error(`Origin ${origin} is not allowed by the MediBridge CORS policy.`));
      },
      credentials: true,
    })
  );

  app.use(express.json({ limit: '1mb' }));
  app.use(express.urlencoded({ extended: true }));

  app.use('/api', routes);

  app.use(notFoundHandler);
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
