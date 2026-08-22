'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const organizationService = require('./organization.service');
const { hashPassword, verifyPassword, signToken, sanitizeProfile } = require('../utils/security');
const { TABLES, ROLES, ERROR_CODES, AUDIT_ACTIONS } = require('../config/constants');

/**
 * Registration and sign-in.
 *
 * Passwords are bcrypt hashed with a configurable cost and the hash never
 * leaves this process. Sign-in answers with the same message whether the
 * email or the password was wrong, so the endpoint cannot be used to discover
 * which addresses are registered.
 */

const normaliseEmail = (email) => String(email).trim().toLowerCase();

/** Roles that must be attached to an organisation to be useful. */
const ORGANISATION_ROLES = [ROLES.HOSPITAL, ROLES.SUPPLIER];

async function findByEmail(email) {
  return db.findOne(TABLES.PROFILES, { where: { email: normaliseEmail(email) } });
}

/**
 * Creates a profile and, when the caller supplied one, the organisation it
 * belongs to. A brand new organisation is created PENDING - registering does
 * not grant the right to trade.
 *
 * `allowAdminRole` is only ever true for the seed script and the admin-only
 * user creation endpoint; the public route must never set it.
 */
async function register(payload, { allowAdminRole = false, actor = null } = {}) {
  const email = normaliseEmail(payload.email);

  if (await findByEmail(email)) {
    throw ApiError.conflict('That email address is already registered.', ERROR_CODES.EMAIL_IN_USE);
  }

  if (payload.role === ROLES.ADMIN && !allowAdminRole) {
    throw ApiError.forbidden('Administrator accounts cannot be created through public registration.');
  }

  let organizationId = payload.organizationId || null;
  let createdOrganization = null;

  if (payload.organization) {
    createdOrganization = await organizationService.create(payload.organization, actor);
    organizationId = createdOrganization.id;
  } else if (organizationId) {
    // Joining an existing organisation - make sure it exists before we create
    // a profile pointing at nothing.
    await organizationService.getByIdOrFail(organizationId);
  }

  if (ORGANISATION_ROLES.includes(payload.role) && !organizationId) {
    throw ApiError.badRequest(
      `A ${payload.role} account must either register a new organisation or join an existing one.`
    );
  }

  const profile = await db.insert(TABLES.PROFILES, {
    email,
    password_hash: await hashPassword(payload.password),
    full_name: payload.fullName,
    phone: payload.phone || null,
    role: payload.role,
    organization_id: organizationId,
  });

  await audit.record({
    userId: profile.id,
    organizationId,
    action: AUDIT_ACTIONS.USER_REGISTERED,
    entityType: 'profile',
    entityId: profile.id,
    metadata: { role: profile.role, joinedExistingOrganization: Boolean(payload.organizationId) },
  });

  const organization = organizationId ? await db.findById(TABLES.ORGANIZATIONS, organizationId) : null;

  return {
    token: signToken(profile),
    profile: sanitizeProfile(profile),
    organization: organization ? organizationService.toDetailed(organization) : null,
  };
}

async function login({ email, password }) {
  const profile = await findByEmail(email);

  // Same error either way - do not confirm whether an address is registered.
  const invalid = ApiError.unauthorized('Email or password is incorrect.', ERROR_CODES.INVALID_CREDENTIALS);
  if (!profile) {
    // Still spend the time hashing so a missing account is not detectably faster.
    await verifyPassword(password, '$2a$10$invalidinvalidinvalidinvalidinvalidinvalidinvalidinvalidiu');
    throw invalid;
  }

  if (!(await verifyPassword(password, profile.password_hash))) throw invalid;

  await audit.record({
    userId: profile.id,
    organizationId: profile.organization_id,
    action: AUDIT_ACTIONS.USER_LOGGED_IN,
    entityType: 'profile',
    entityId: profile.id,
  });

  const organization = profile.organization_id
    ? await db.findById(TABLES.ORGANIZATIONS, profile.organization_id)
    : null;

  return {
    token: signToken(profile),
    profile: sanitizeProfile(profile),
    organization: organization ? organizationService.toDetailed(organization) : null,
  };
}

async function getCurrentUser(user) {
  const organization = user.organization_id
    ? await db.findById(TABLES.ORGANIZATIONS, user.organization_id)
    : null;

  return {
    profile: user,
    organization: organization ? organizationService.toDetailed(organization) : null,
  };
}

/** Users may edit their own name and phone number, nothing else. */
async function updateProfile(user, payload) {
  const patch = {};
  if (payload.fullName !== undefined) patch.full_name = payload.fullName;
  if (payload.phone !== undefined) patch.phone = payload.phone;

  if (Object.keys(patch).length === 0) return user;

  const updated = await db.update(TABLES.PROFILES, user.id, patch);
  return sanitizeProfile(updated);
}

async function changePassword(user, { currentPassword, newPassword }) {
  const profile = await db.findById(TABLES.PROFILES, user.id);
  if (!profile) throw ApiError.unauthorized();

  if (!(await verifyPassword(currentPassword, profile.password_hash))) {
    throw ApiError.badRequest('Your current password is incorrect.', ERROR_CODES.INVALID_CREDENTIALS);
  }

  await db.update(TABLES.PROFILES, user.id, { password_hash: await hashPassword(newPassword) });
  return { changed: true };
}

module.exports = { register, login, getCurrentUser, updateProfile, changePassword, findByEmail };
