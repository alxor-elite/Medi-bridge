'use strict';

const db = require('../db');
const { TABLES } = require('../config/constants');

/**
 * Append-only trail of the actions that matter for accountability:
 * who approved an organisation, who moved stock, who cancelled an order.
 *
 * Two rules:
 *  - Never store credentials or secrets in `metadata` (see `scrub`).
 *  - Never let an audit failure break the operation being audited. A dropped
 *    log line is bad; a failed emergency order because of a dropped log line
 *    is worse.
 */

const FORBIDDEN_KEYS = ['password', 'password_hash', 'passwordhash', 'token', 'secret', 'authorization', 'apikey', 'api_key'];

/** Strip anything credential-shaped out of audit metadata, at any depth. */
function scrub(value, depth = 0) {
  if (depth > 4 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => scrub(item, depth + 1));

  const safe = {};
  for (const [key, item] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.includes(key.toLowerCase())) {
      safe[key] = '[redacted]';
    } else {
      safe[key] = scrub(item, depth + 1);
    }
  }
  return safe;
}

async function record({ userId = null, organizationId = null, action, entityType = null, entityId = null, metadata = null }) {
  try {
    return await db.insert(TABLES.AUDIT_LOGS, {
      user_id: userId,
      organization_id: organizationId,
      action,
      entity_type: entityType,
      entity_id: entityId,
      metadata: metadata ? scrub(metadata) : null,
    });
  } catch (error) {
    console.error('[audit] failed to write audit log:', action, error.message);
    return null;
  }
}

/** Convenience wrapper for the common "the signed-in user did X" case. */
function recordForUser(user, action, { entityType, entityId, metadata } = {}) {
  return record({
    userId: user?.id ?? null,
    organizationId: user?.organization_id ?? null,
    action,
    entityType,
    entityId,
    metadata,
  });
}

async function list({ organizationId, userId, action, entityType, entityId, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (organizationId) where.organization_id = organizationId;
  if (userId) where.user_id = userId;
  if (action) where.action = action;
  if (entityType) where.entity_type = entityType;
  if (entityId) where.entity_id = entityId;

  return db.findMany(TABLES.AUDIT_LOGS, {
    where,
    order: { column: 'created_at', ascending: false },
    limit,
    offset,
  });
}

module.exports = { record, recordForUser, list, scrub };
