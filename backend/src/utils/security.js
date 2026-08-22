'use strict';

const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { env } = require('../config/env');

/**
 * Password hashing and token signing.
 *
 * MediBridge issues its own credentials rather than using Supabase Auth so
 * that the API works unchanged against either database driver. Passwords are
 * never stored or logged in plain text - only the bcrypt hash is persisted,
 * and `sanitizeProfile` strips it from everything the API returns.
 */

const TOKEN_ISSUER = 'medibridge-api';

async function hashPassword(plainText) {
  return bcrypt.hash(plainText, env.bcryptSaltRounds);
}

async function verifyPassword(plainText, hash) {
  if (!hash) return false;
  return bcrypt.compare(plainText, hash);
}

function signToken(profile) {
  return jwt.sign(
    {
      sub: profile.id,
      email: profile.email,
      role: profile.role,
      organizationId: profile.organization_id || null,
    },
    env.jwtSecret,
    { expiresIn: env.jwtExpiresIn, issuer: TOKEN_ISSUER }
  );
}

/** Returns the decoded payload, or null when the token is invalid/expired. */
function verifyToken(token) {
  try {
    return jwt.verify(token, env.jwtSecret, { issuer: TOKEN_ISSUER });
  } catch {
    return null;
  }
}

/** Never let the password hash leave the process. */
function sanitizeProfile(profile) {
  if (!profile) return null;
  const { password_hash: _passwordHash, ...safe } = profile;
  return safe;
}

module.exports = { hashPassword, verifyPassword, signToken, verifyToken, sanitizeProfile, TOKEN_ISSUER };
