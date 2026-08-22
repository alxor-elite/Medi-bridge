'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const { TABLES } = require('../config/constants');

/**
 * In-app notifications.
 *
 * Delivery is deliberately just a database row the frontend polls - no SMS or
 * email until the core procurement flow is complete (build brief section 20).
 * Everything goes through `create`/`createForOrganization` so adding a
 * transport later means changing one file.
 */

async function create({ profileId, organizationId = null, type, title, message, metadata = null }) {
  try {
    return await db.insert(TABLES.NOTIFICATIONS, {
      profile_id: profileId,
      organization_id: organizationId,
      type,
      title,
      message,
      metadata,
      read_at: null,
    });
  } catch (error) {
    // A notification is never worth failing the underlying action for.
    console.error('[notifications] failed to create notification:', type, error.message);
    return null;
  }
}

/** Fan a notification out to every member of an organisation. */
async function createForOrganization(organizationId, payload) {
  if (!organizationId) return [];

  const members = await db.findMany(TABLES.PROFILES, { where: { organization_id: organizationId } });
  return Promise.all(
    members.map((member) => create({ ...payload, profileId: member.id, organizationId }))
  );
}

async function listForUser(user, { unreadOnly = false, limit = 50, offset = 0 } = {}) {
  const options = {
    where: { profile_id: user.id },
    order: { column: 'created_at', ascending: false },
    limit,
    offset,
  };
  if (unreadOnly) options.isNull = ['read_at'];

  const [items, unreadCount] = await Promise.all([
    db.findMany(TABLES.NOTIFICATIONS, options),
    db.count(TABLES.NOTIFICATIONS, { where: { profile_id: user.id }, isNull: ['read_at'] }),
  ]);

  return { items, unreadCount };
}

async function markRead(notificationId, user) {
  const notification = await db.findById(TABLES.NOTIFICATIONS, notificationId);
  if (!notification) throw ApiError.notFound('Notification not found.');

  // A notification is private to its recipient - not even an admin reads it
  // through this endpoint.
  if (notification.profile_id !== user.id) {
    throw ApiError.forbidden('This notification belongs to another user.');
  }

  if (notification.read_at) return notification;
  return db.update(TABLES.NOTIFICATIONS, notificationId, { read_at: new Date().toISOString() });
}

async function markAllRead(user) {
  const updated = await db.updateWhere(
    TABLES.NOTIFICATIONS,
    { where: { profile_id: user.id }, isNull: ['read_at'] },
    { read_at: new Date().toISOString() }
  );
  return { updated: updated.length };
}

module.exports = { create, createForOrganization, listForUser, markRead, markAllRead };
