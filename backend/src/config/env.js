'use strict';

const path = require('path');
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

/** Read a number from the environment, falling back to a default. */
function num(key, fallback) {
  const raw = process.env[key];
  if (raw === undefined || raw === '') return fallback;
  const parsed = Number(raw);
  if (Number.isNaN(parsed)) {
    throw new Error(`Environment variable ${key} must be a number, got "${raw}"`);
  }
  return parsed;
}

const nodeEnv = process.env.NODE_ENV || 'development';
const isProduction = nodeEnv === 'production';
const isTest = nodeEnv === 'test';

const dbDriver = (process.env.DB_DRIVER || 'supabase').toLowerCase();

const env = {
  nodeEnv,
  isProduction,
  isTest,
  port: num('PORT', 5000),

  dbDriver,
  // Seeding an in-memory database from a separate `npm run seed` process is
  // pointless - the data dies with that process. This lets the API seed itself
  // at boot instead, which is how the demo runs without Supabase credentials.
  seedOnStart: (process.env.SEED_ON_START || '').toLowerCase() === 'true',

  supabaseUrl: process.env.SUPABASE_URL || '',
  supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '',
  supabaseServiceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',

  jwtSecret: process.env.JWT_SECRET || '',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  bcryptSaltRounds: num('BCRYPT_SALT_ROUNDS', 10),

  // Comma separated list -> array. Used by the CORS allow-list.
  clientUrls: (process.env.CLIENT_URL || 'http://localhost:5173')
    .split(',')
    .map((url) => url.trim())
    .filter(Boolean),

  freshness: {
    freshMinutes: num('FRESHNESS_FRESH_MINUTES', 30),
    recentMinutes: num('FRESHNESS_RECENT_MINUTES', 360),
  },

  reservationTtlMinutes: num('RESERVATION_TTL_MINUTES', 10),

  ranking: {
    eta: num('RANK_WEIGHT_ETA', 0.4),
    distance: num('RANK_WEIGHT_DISTANCE', 0.25),
    stock: num('RANK_WEIGHT_STOCK', 0.2),
    reliability: num('RANK_WEIGHT_RELIABILITY', 0.1),
    price: num('RANK_WEIGHT_PRICE', 0.05),
  },

  averageSpeedKmh: num('AVERAGE_SPEED_KMH', 28),
  dispatchOverheadMinutes: num('DISPATCH_OVERHEAD_MINUTES', 8),
};

/**
 * Fail fast on a misconfigured environment instead of throwing confusing
 * errors on the first request.
 */
function validateEnv() {
  const problems = [];

  if (!['supabase', 'memory'].includes(env.dbDriver)) {
    problems.push(`DB_DRIVER must be "supabase" or "memory", got "${env.dbDriver}"`);
  }

  if (env.dbDriver === 'memory' && isProduction) {
    problems.push('DB_DRIVER=memory is a development/test driver and must not be used in production');
  }

  if (env.dbDriver === 'supabase') {
    if (!env.supabaseUrl) problems.push('SUPABASE_URL is required when DB_DRIVER=supabase');
    if (!env.supabaseServiceRoleKey) {
      problems.push('SUPABASE_SERVICE_ROLE_KEY is required when DB_DRIVER=supabase');
    }
  }

  if (!env.jwtSecret) {
    if (isProduction) {
      problems.push('JWT_SECRET is required');
    } else {
      // Keep local development frictionless, but make the risk obvious.
      env.jwtSecret = 'medibridge-insecure-development-secret';
      console.warn('[env] JWT_SECRET is not set - using an insecure development secret.');
    }
  } else if (isProduction && env.jwtSecret.length < 32) {
    problems.push('JWT_SECRET must be at least 32 characters in production');
  }

  const weightTotal = Object.values(env.ranking).reduce((sum, w) => sum + w, 0);
  if (Math.abs(weightTotal - 1) > 0.001) {
    problems.push(`Supplier ranking weights must add up to 1, they currently add up to ${weightTotal}`);
  }

  if (problems.length > 0) {
    throw new Error(`Invalid environment configuration:\n  - ${problems.join('\n  - ')}`);
  }

  return env;
}

module.exports = { env, validateEnv };
