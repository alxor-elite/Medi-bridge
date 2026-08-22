'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const { medicines, equipment } = require('./catalog.service');
const { describeFreshness } = require('../utils/freshness');
const {
  TABLES,
  ROLES,
  ITEM_TYPES,
  EQUIPMENT_CONDITION,
  AUDIT_ACTIONS,
  NOTIFICATION_TYPES,
  ERROR_CODES,
  VERIFICATION_STATUS,
} = require('../config/constants');

/**
 * What each organisation physically holds.
 *
 * Two invariants this module exists to protect:
 *  1. available = quantity - reserved_quantity, and it may never go negative.
 *  2. Only an organisation's own members may change its stock.
 *
 * Reserving and consuming stock happen in reservation.service.js through the
 * driver's atomic helpers - never by reading a row and writing it back here.
 */

const DEFAULT_LOW_STOCK_THRESHOLD = 10;

function availableQuantity(row) {
  return Math.max(0, Number(row.quantity) - Number(row.reserved_quantity));
}

/** Projection for the owning organisation and admins - includes cost data. */
function toDetailed(row, now = Date.now()) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    itemType: row.item_type,
    medicineId: row.medicine_id,
    equipmentId: row.equipment_id,
    batchNumber: row.batch_number,
    quantity: Number(row.quantity),
    reservedQuantity: Number(row.reserved_quantity),
    availableQuantity: availableQuantity(row),
    unit: row.unit,
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    expiryDate: row.expiry_date,
    storageRequirement: row.storage_requirement,
    condition: row.condition,
    lowStockThreshold: row.low_stock_threshold,
    ...describeFreshness(row.updated_at, now),
    createdAt: row.created_at,
  };
}

/**
 * Projection for other organisations: enough to decide whether to order,
 * without exposing batch numbers or internal thresholds.
 */
function toPublic(row, now = Date.now()) {
  const detailed = toDetailed(row, now);
  return {
    id: detailed.id,
    organizationId: detailed.organizationId,
    itemType: detailed.itemType,
    medicineId: detailed.medicineId,
    equipmentId: detailed.equipmentId,
    availableQuantity: detailed.availableQuantity,
    unit: detailed.unit,
    price: detailed.price,
    expiryDate: detailed.expiryDate,
    condition: detailed.condition,
    lastUpdated: detailed.lastUpdated,
    stockFreshness: detailed.stockFreshness,
    minutesSinceUpdate: detailed.minutesSinceUpdate,
  };
}

const ownsRow = (user, row) => user.role === ROLES.ADMIN || user.organization_id === row.organization_id;

async function getByIdOrFail(id) {
  const row = await db.findById(TABLES.INVENTORY, id);
  if (!row) throw ApiError.notFound('Inventory item not found.');
  return row;
}

/**
 * Reading another organisation's shelf is allowed - that is the whole point of
 * a supply network - but only for verified organisations and only through the
 * public projection.
 */
async function list(query, viewer) {
  const scopeId = query.organizationId || viewer.organization_id;
  const isOwnScope = viewer.role === ROLES.ADMIN || scopeId === viewer.organization_id;

  if (!scopeId) {
    throw ApiError.badRequest('Specify an organizationId, or sign in with an account that has an organisation.');
  }

  if (!isOwnScope) {
    const organization = await db.findById(TABLES.ORGANIZATIONS, scopeId);
    if (!organization) throw ApiError.notFound('Organisation not found.');
    if (organization.verification_status !== VERIFICATION_STATUS.VERIFIED) {
      throw new ApiError(
        403,
        ERROR_CODES.ORGANIZATION_NOT_VERIFIED,
        'That organisation is not verified, so its inventory is not published.'
      );
    }
  }

  const where = { organization_id: scopeId };
  if (query.itemType) where.item_type = query.itemType;
  if (query.medicineId) where.medicine_id = query.medicineId;
  if (query.equipmentId) where.equipment_id = query.equipmentId;

  const options = {
    where,
    order: { column: 'updated_at', ascending: false },
    limit: query.limit || 100,
    offset: query.offset || 0,
  };

  let rows = await db.findMany(TABLES.INVENTORY, options);

  // Expired batches are hidden by default - nobody should be offered them.
  // Filtered here rather than in SQL because "no expiry date" (equipment) has
  // to pass too, and that is an OR the shared filter spec does not express.
  if (!query.includeExpired) {
    const today = new Date().toISOString().slice(0, 10);
    rows = rows.filter((row) => !row.expiry_date || row.expiry_date >= today);
  }
  if (query.inStockOnly) {
    rows = rows.filter((row) => availableQuantity(row) > 0);
  }

  const now = Date.now();
  return rows.map((row) => (isOwnScope ? toDetailed(row, now) : toPublic(row, now)));
}

async function getById(id, viewer) {
  const row = await getByIdOrFail(id);
  return ownsRow(viewer, row) ? toDetailed(row) : toPublic(row);
}

/** Confirms the catalogue entry the item points at actually exists. */
async function assertCatalogItem(payload) {
  if (payload.itemType === ITEM_TYPES.MEDICINE) {
    if (!payload.medicineId) throw ApiError.badRequest('medicineId is required for a MEDICINE inventory item.');
    await medicines.getByIdOrFail(payload.medicineId);
    return { medicine_id: payload.medicineId, equipment_id: null };
  }

  if (!payload.equipmentId) throw ApiError.badRequest('equipmentId is required for an EQUIPMENT inventory item.');
  await equipment.getByIdOrFail(payload.equipmentId);
  return { medicine_id: null, equipment_id: payload.equipmentId };
}

async function create(payload, actor) {
  if (!actor.organization_id) {
    throw ApiError.forbidden('Your account must belong to an organisation before you can hold stock.');
  }

  const catalogLink = await assertCatalogItem(payload);

  const row = await db.insert(TABLES.INVENTORY, {
    organization_id: actor.organization_id,
    item_type: payload.itemType,
    ...catalogLink,
    batch_number: payload.batchNumber || null,
    quantity: payload.quantity,
    reserved_quantity: 0,
    unit: payload.unit || (payload.itemType === ITEM_TYPES.MEDICINE ? 'unit' : 'item'),
    price: payload.price ?? null,
    expiry_date: payload.expiryDate || null,
    storage_requirement: payload.storageRequirement || null,
    condition: payload.itemType === ITEM_TYPES.EQUIPMENT ? payload.condition || EQUIPMENT_CONDITION.GOOD : null,
    low_stock_threshold: payload.lowStockThreshold ?? DEFAULT_LOW_STOCK_THRESHOLD,
  });

  await audit.recordForUser(actor, AUDIT_ACTIONS.INVENTORY_CREATED, {
    entityType: 'inventory',
    entityId: row.id,
    metadata: { itemType: row.item_type, quantity: row.quantity },
  });

  return toDetailed(row);
}

async function update(id, payload, actor) {
  const row = await getByIdOrFail(id);

  if (!ownsRow(actor, row)) {
    throw ApiError.forbidden('You can only change inventory that belongs to your own organisation.');
  }

  const patch = {};
  const editable = {
    batchNumber: 'batch_number',
    unit: 'unit',
    price: 'price',
    expiryDate: 'expiry_date',
    storageRequirement: 'storage_requirement',
    condition: 'condition',
    lowStockThreshold: 'low_stock_threshold',
  };
  for (const [input, column] of Object.entries(editable)) {
    if (payload[input] !== undefined) patch[column] = payload[input];
  }

  if (payload.quantity !== undefined) {
    // Reserved units are already promised to someone. Letting the total drop
    // below them would make available_quantity negative and oversell stock
    // that other hospitals are counting on.
    if (payload.quantity < Number(row.reserved_quantity)) {
      throw ApiError.conflict(
        `${row.reserved_quantity} unit(s) of this batch are reserved, so the quantity cannot be set below that. Release the reservations first.`,
        ERROR_CODES.INVENTORY_NOT_AVAILABLE
      );
    }
    patch.quantity = payload.quantity;
  }

  if (Object.keys(patch).length === 0) return toDetailed(row);

  const updated = await db.update(TABLES.INVENTORY, id, patch);

  await audit.recordForUser(actor, AUDIT_ACTIONS.INVENTORY_UPDATED, {
    entityType: 'inventory',
    entityId: id,
    metadata: {
      updatedFields: Object.keys(patch),
      quantityBefore: Number(row.quantity),
      quantityAfter: Number(updated.quantity),
    },
  });

  await maybeWarnLowStock(updated);

  return toDetailed(updated);
}

async function remove(id, actor) {
  const row = await getByIdOrFail(id);

  if (!ownsRow(actor, row)) {
    throw ApiError.forbidden('You can only delete inventory that belongs to your own organisation.');
  }

  if (Number(row.reserved_quantity) > 0) {
    throw ApiError.conflict(
      'This batch has active reservations against it and cannot be deleted yet.',
      ERROR_CODES.INVENTORY_NOT_AVAILABLE
    );
  }

  await db.remove(TABLES.INVENTORY, id);
  await audit.recordForUser(actor, AUDIT_ACTIONS.INVENTORY_DELETED, {
    entityType: 'inventory',
    entityId: id,
    metadata: { itemType: row.item_type, quantity: Number(row.quantity) },
  });

  return { deleted: true, id };
}

/** Nudge the owner when a batch drops to its reorder point. */
async function maybeWarnLowStock(row) {
  const threshold = Number(row.low_stock_threshold ?? DEFAULT_LOW_STOCK_THRESHOLD);
  if (availableQuantity(row) > threshold) return;

  await notifications.createForOrganization(row.organization_id, {
    type: NOTIFICATION_TYPES.LOW_STOCK,
    title: 'Low stock',
    message: `A batch is down to ${availableQuantity(row)} available unit(s), at or below your reorder point of ${threshold}.`,
    metadata: { inventoryId: row.id, availableQuantity: availableQuantity(row), threshold },
  });
}

/**
 * Batches expiring inside `withinDays`. Powers the EXPIRING_SOON alert and
 * gives the dashboard something honest to show about wastage risk.
 */
async function expiringSoon(organizationId, withinDays = 30, viewer) {
  if (!organizationId) {
    throw ApiError.badRequest('Specify an organizationId, or sign in with an account that has an organisation.');
  }

  // This projection exposes batch numbers and reorder points, so it stays
  // inside the organisation.
  if (viewer.role !== ROLES.ADMIN && viewer.organization_id !== organizationId) {
    throw ApiError.forbidden('You can only review expiry for your own organisation.');
  }

  const cutoff = new Date(Date.now() + withinDays * 86400000).toISOString().slice(0, 10);
  const today = new Date().toISOString().slice(0, 10);

  const rows = await db.findMany(TABLES.INVENTORY, {
    where: { organization_id: organizationId },
    notNull: ['expiry_date'],
    lte: { expiry_date: cutoff },
    gte: { expiry_date: today },
    order: { column: 'expiry_date', ascending: true },
  });

  return rows.map((row) => toDetailed(row));
}

module.exports = {
  list,
  getById,
  getByIdOrFail,
  create,
  update,
  remove,
  expiringSoon,
  availableQuantity,
  toDetailed,
  toPublic,
  maybeWarnLowStock,
};
