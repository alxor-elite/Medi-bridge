'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const { verifyToken, sanitizeProfile } = require('../utils/security');
const { TABLES, ROLES, ERROR_CODES, VERIFICATION_STATUS } = require('../config/constants');

/**
 * Authentication and role based access control.
 *
 * `requireAuth` proves who the caller is; `requireRole` proves what they may
 * do; `requireVerifiedOrganization` proves their organisation is allowed to
 * trade. Ownership ("is this *your* inventory row?") is enforced in the
 * services, because only they know which column carries the owner.
 */

function readBearerToken(req) {
  const header = req.headers.authorization || '';
  if (!header.startsWith('Bearer ')) return null;
  const token = header.slice('Bearer '.length).trim();
  return token || null;
}

/** Rejects the request unless it carries a valid token for an existing profile. */
async function requireAuth(req, res, next) {
  try {
    const token = readBearerToken(req);
    if (!token) {
      throw ApiError.unauthorized('Provide a bearer token in the Authorization header.');
    }

    const payload = verifyToken(token);
    if (!payload) {
      throw ApiError.unauthorized('Your session token is invalid or has expired.');
    }

    // Always re-read the profile: a role change or deletion must take effect
    // immediately, not when the old token happens to expire.
    const profile = await db.findById(TABLES.PROFILES, payload.sub);
    if (!profile) {
      throw ApiError.unauthorized('This account no longer exists.');
    }

    req.user = sanitizeProfile(profile);
    req.organization = profile.organization_id
      ? await db.findById(TABLES.ORGANIZATIONS, profile.organization_id)
      : null;

    return next();
  } catch (error) {
    return next(error);
  }
}

/**
 * Attaches the caller when a token is present but never rejects.
 * Used by public read endpoints that show a little more to signed-in users.
 */
async function optionalAuth(req, res, next) {
  if (!readBearerToken(req)) return next();
  return requireAuth(req, res, (error) => (error ? next() : next()));
}

/** `requireRole('ADMIN')` or `requireRole('HOSPITAL', 'ADMIN')`. */
function requireRole(...roles) {
  const allowed = roles.flat();
  return function roleGuard(req, res, next) {
    if (!req.user) {
      return next(ApiError.unauthorized());
    }
    if (!allowed.includes(req.user.role)) {
      return next(
        ApiError.forbidden(
          `This endpoint requires the ${allowed.join(' or ')} role. Your role is ${req.user.role}.`
        )
      );
    }
    return next();
  };
}

/**
 * Blocks organisations that are still pending, rejected or suspended.
 * Admins are exempt - they have to be able to act before anyone is verified.
 */
function requireVerifiedOrganization(req, res, next) {
  if (!req.user) return next(ApiError.unauthorized());
  if (req.user.role === ROLES.ADMIN) return next();

  if (!req.organization) {
    return next(
      ApiError.forbidden(
        'Your account is not linked to an organisation yet.',
        ERROR_CODES.ORGANIZATION_NOT_VERIFIED
      )
    );
  }

  if (req.organization.verification_status !== VERIFICATION_STATUS.VERIFIED) {
    return next(
      new ApiError(
        403,
        ERROR_CODES.ORGANIZATION_NOT_VERIFIED,
        `Your organisation is ${req.organization.verification_status}. An administrator must verify it before you can trade on MediBridge.`
      )
    );
  }

  return next();
}

module.exports = { requireAuth, optionalAuth, requireRole, requireVerifiedOrganization, readBearerToken };
