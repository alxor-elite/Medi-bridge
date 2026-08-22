'use strict';

const { validateEnv, env } = require('./src/config/env');
const { createApp } = require('./src/app');
const db = require('./src/db');
const { startReservationSweeper } = require('./src/services/reservation.service');

/**
 * MediBridge API entry point.
 * Configuration is validated before anything binds to a port, so a missing
 * key fails loudly at boot instead of on the first request.
 */
async function start() {
  validateEnv();
  await db.init();

  if (env.seedOnStart) {
    // Mainly for DB_DRIVER=memory, where a separate seed process would write
    // to a store that dies with it.
    const { seed } = require('./scripts/seed');
    const existing = await db.count('organizations', {});
    if (existing === 0) {
      console.log('[medibridge] SEED_ON_START is set - loading demo data...');
      const summary = await seed({ quiet: true });
      console.log(
        `[medibridge] seeded ${summary.organizations} organisations, ${summary.medicines} medicines, ${summary.inventory} inventory rows.`
      );
      console.log(`[medibridge] demo login: ${summary.accounts.admin} / ${summary.demoPassword}`);
    }
  }

  const app = createApp();

  const server = app.listen(env.port, () => {
    console.log(`[medibridge] API listening on http://localhost:${env.port}`);
    console.log(`[medibridge] environment: ${env.nodeEnv} | database driver: ${db.name}`);
    console.log(`[medibridge] health check: http://localhost:${env.port}/api/health`);
  });

  // Reservations must not hold stock hostage after they expire.
  const stopSweeper = startReservationSweeper();

  const shutdown = (signal) => {
    console.log(`[medibridge] ${signal} received, shutting down.`);
    stopSweeper();
    server.close(() => process.exit(0));
    // Do not wait forever for slow keep-alive connections.
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  return server;
}

start().catch((error) => {
  console.error('[medibridge] failed to start:', error.message);
  process.exit(1);
});
