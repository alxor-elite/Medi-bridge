'use strict';

const { env } = require('./env');

/**
 * CORS policy for the MediBridge API.
 *
 * The browser sends a preflight (OPTIONS) before any cross-origin POST that
 * carries JSON or an Authorization header, so `/api/auth/login` is only
 * reachable from the Vercel frontend if that preflight is answered with the
 * right headers. The allow-list comes from CLIENT_URL (comma separated).
 *
 * A rejected origin is refused by *omitting* the CORS headers, never by
 * throwing: throwing turns a policy decision into a 500 with a stack trace on
 * the preflight, which is both a leak and a misleading signal. The browser
 * blocks a response with no Access-Control-Allow-Origin regardless of status.
 *
 * The origin is echoed back explicitly - never `*` - because the API is used
 * with `credentials: true`, and the two are illegal in combination.
 */

const ALLOWED_METHODS = ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'];
const ALLOWED_HEADERS = ['Content-Type', 'Authorization'];

/** A day - browsers cap this themselves, it just avoids a preflight per call. */
const PREFLIGHT_MAX_AGE_SECONDS = 86400;

/**
 * `https://App.Vercel.App/` and `https://app.vercel.app` are the same origin.
 * Hosting dashboards routinely store the trailing-slash form, so compare a
 * canonical shape instead of the raw string.
 */
function canonicaliseOrigin(value) {
  return String(value || '')
    .trim()
    .replace(/\/+$/, '')
    .toLowerCase();
}

const allowList = env.clientUrls.map(canonicaliseOrigin).filter(Boolean);

function isOriginAllowed(origin) {
  return allowList.includes(canonicaliseOrigin(origin));
}

/** Log each unknown origin once - repeated preflights must not spam the log. */
const warnedOrigins = new Set();

function resolveOrigin(origin, callback) {
  // No Origin header at all: curl, platform health checks, server-to-server.
  // These are not browser requests, so there is no CORS decision to make.
  if (!origin) return callback(null, true);

  if (isOriginAllowed(origin)) return callback(null, true);

  if (!warnedOrigins.has(origin)) {
    warnedOrigins.add(origin);
    console.warn(
      `[cors] blocked origin ${origin} - add it to CLIENT_URL if this is expected. ` +
        `Currently allowed: ${allowList.join(', ') || '(none)'}`
    );
  }

  return callback(null, false);
}

const corsOptions = {
  origin: resolveOrigin,
  credentials: true,
  methods: ALLOWED_METHODS,
  allowedHeaders: ALLOWED_HEADERS,
  optionsSuccessStatus: 204,
  maxAge: PREFLIGHT_MAX_AGE_SECONDS,
};

module.exports = {
  corsOptions,
  isOriginAllowed,
  canonicaliseOrigin,
  allowList,
  ALLOWED_METHODS,
  ALLOWED_HEADERS,
};
