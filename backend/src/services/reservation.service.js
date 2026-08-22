'use strict';

const { randomUUID } = require('crypto');

const db = require('../db');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const {
  TABLES,
  ROLES,
  RESERVATION_STATUS,
  AUDIT_ACTIONS,
  ERROR_CODES,
} = require('../config/constants');

/**
 * Short-lived holds on stock.
 *
 * A reservation moves units from available into reserved so a hospital can
 * finish creating an order without another hospital taking the same box off
 * the shelf underneath it. It expires after RESERVATION_TTL_MINUTES (10 by
 * default) so abandoned searches cannot freeze supply.
 *
 * The reserve itself is a single atomic operation in the driver - a Postgres
 * function under Supabase, a mutex in memory - so two concurrent requests can
 * never both succeed against the same last box.
 */

const SWEEP_INTERVAL_MS = 30_000;

function toApi(reservation) {
  return {
    id: reservation.id,
    groupId: reservation.group_id,
    inventoryId: reservation.inventory_id,
    organizationId: reservation.organization_id,
    supplierId: reservation.supplier_id,
    profileId: reservation.profile_id,
    quantity: Number(reservation.quantity),
    status: reservation.status,
    expiresAt: reservation.expires_at,
    orderId: reservation.order_id,
    notes: reservation.notes,
    createdAt: reservation.created_at,
    updatedAt: reservation.updated_at,
  };
}

const isExpired = (reservation) => new Date(reservation.expires_at).getTime() <= Date.now();

/**
 * Releases every ACTIVE reservation whose clock has run out and gives the
 * stock back. Safe to call as often as you like.
 */
async function expireDue() {
  const due = await db.findMany(TABLES.RESERVATIONS, {
    where: { status: RESERVATION_STATUS.ACTIVE },
    lte: { expires_at: new Date().toISOString() },
  });

  for (const reservation of due) {
    // Give the stock back first: a crash between the two leaves the
    // reservation ACTIVE and it gets swept again, which is harmless.
    // The other order would silently lose the units.
    await db.releaseStock(reservation.inventory_id, Number(reservation.quantity));
    await db.update(TABLES.RESERVATIONS, reservation.id, { status: RESERVATION_STATUS.EXPIRED });
  }

  return due.length;
}

/** Background sweeper started by server.js; returns its stop function. */
function startReservationSweeper(intervalMs = SWEEP_INTERVAL_MS) {
  const timer = setInterval(() => {
    expireDue().catch((error) => console.error('[reservations] sweep failed:', error.message));
  }, intervalMs);

  // Never keep the process alive just for the sweeper.
  timer.unref?.();

  return function stop() {
    clearInterval(timer);
  };
}

/**
 * Reserve stock across one or more batches.
 *
 * Accepts either a single `{ inventoryId, quantity }` or the `allocation`
 * array a search result hands back. Reserving several batches is not one
 * database transaction, so if a later line fails, the lines already taken are
 * released again - the caller either gets the whole hold or nothing.
 */
async function create(payload, actor) {
  await expireDue();

  if (!actor.organization_id) {
    throw ApiError.forbidden('Your account must belong to an organisation before you can reserve stock.');
  }

  const lines = normaliseLines(payload);
  const groupId = randomUUID();
  const expiresAt = new Date(Date.now() + env.reservationTtlMinutes * 60000).toISOString();

  const created = [];

  try {
    for (const line of lines) {
      const inventory = await db.findById(TABLES.INVENTORY, line.inventoryId);
      if (!inventory) throw ApiError.notFound(`Inventory item ${line.inventoryId} not found.`);

      if (inventory.organization_id === actor.organization_id) {
        throw ApiError.badRequest('You do not need to reserve stock from your own organisation.');
      }

      const updated = await db.reserveStock(line.inventoryId, line.quantity);
      if (!updated) {
        const available = Math.max(0, Number(inventory.quantity) - Number(inventory.reserved_quantity));
        throw new ApiError(
          409,
          ERROR_CODES.INVENTORY_NOT_AVAILABLE,
          `Requested quantity is not available. ${available} unit(s) remain in that batch, ${line.quantity} were requested.`,
          { inventoryId: line.inventoryId, requested: line.quantity, available }
        );
      }

      const reservation = await db.insert(TABLES.RESERVATIONS, {
        group_id: groupId,
        inventory_id: line.inventoryId,
        organization_id: actor.organization_id,
        supplier_id: inventory.organization_id,
        profile_id: actor.id,
        quantity: line.quantity,
        status: RESERVATION_STATUS.ACTIVE,
        expires_at: expiresAt,
        order_id: null,
        notes: payload.notes || null,
      });

      created.push(reservation);
    }
  } catch (error) {
    // Partial holds would silently strand stock nobody can use.
    await rollback(created);
    throw error;
  }

  await audit.recordForUser(actor, AUDIT_ACTIONS.RESERVATION_CREATED, {
    entityType: 'reservation',
    entityId: groupId,
    metadata: {
      groupId,
      lines: created.map((reservation) => ({
        inventoryId: reservation.inventory_id,
        quantity: Number(reservation.quantity),
      })),
      expiresAt,
    },
  });

  return {
    groupId,
    expiresAt,
    expiresInMinutes: env.reservationTtlMinutes,
    reservations: created.map(toApi),
  };
}

function normaliseLines(payload) {
  const raw = Array.isArray(payload.allocation) && payload.allocation.length > 0
    ? payload.allocation
    : [{ inventoryId: payload.inventoryId, quantity: payload.quantity }];

  const lines = raw.map((line) => ({
    inventoryId: line.inventoryId,
    quantity: Number(line.quantity),
  }));

  if (lines.some((line) => !line.inventoryId || !Number.isInteger(line.quantity) || line.quantity < 1)) {
    throw ApiError.badRequest('Each reservation line needs an inventoryId and a whole quantity of at least 1.');
  }

  // Two lines against one batch would take the mutex twice and read as one
  // hold to the user; collapse them so the arithmetic stays obvious.
  const merged = new Map();
  for (const line of lines) {
    merged.set(line.inventoryId, (merged.get(line.inventoryId) || 0) + line.quantity);
  }

  return [...merged.entries()].map(([inventoryId, quantity]) => ({ inventoryId, quantity }));
}

async function rollback(reservations) {
  for (const reservation of reservations) {
    try {
      await db.releaseStock(reservation.inventory_id, Number(reservation.quantity));
      await db.update(TABLES.RESERVATIONS, reservation.id, { status: RESERVATION_STATUS.RELEASED });
    } catch (error) {
      console.error('[reservations] rollback failed for', reservation.id, error.message);
    }
  }
}

async function list(query, viewer) {
  await expireDue();

  const where = {};
  if (query.status) where.status = query.status;

  if (viewer.role === ROLES.ADMIN) {
    if (query.organizationId) where.organization_id = query.organizationId;
  } else if (viewer.role === ROLES.SUPPLIER) {
    // A supplier sees the holds placed against its own shelves.
    where.supplier_id = viewer.organization_id;
  } else {
    where.organization_id = viewer.organization_id;
  }

  const reservations = await db.findMany(TABLES.RESERVATIONS, {
    where,
    order: { column: 'created_at', ascending: false },
    limit: query.limit || 50,
    offset: query.offset || 0,
  });

  return reservations.map(toApi);
}

async function getByIdOrFail(id) {
  const reservation = await db.findById(TABLES.RESERVATIONS, id);
  if (!reservation) throw ApiError.notFound('Reservation not found.');
  return reservation;
}

function assertCanTouch(reservation, viewer) {
  const allowed =
    viewer.role === ROLES.ADMIN ||
    viewer.organization_id === reservation.organization_id ||
    viewer.organization_id === reservation.supplier_id;

  if (!allowed) throw ApiError.forbidden('This reservation belongs to another organisation.');
}

/** Manual cancel - hands the units straight back to the available pool. */
async function release(id, actor) {
  const reservation = await getByIdOrFail(id);
  assertCanTouch(reservation, actor);

  if (reservation.status !== RESERVATION_STATUS.ACTIVE) {
    throw ApiError.conflict(`This reservation is already ${reservation.status}.`);
  }

  await db.releaseStock(reservation.inventory_id, Number(reservation.quantity));
  const updated = await db.update(TABLES.RESERVATIONS, id, { status: RESERVATION_STATUS.RELEASED });

  await audit.recordForUser(actor, AUDIT_ACTIONS.RESERVATION_RELEASED, {
    entityType: 'reservation',
    entityId: id,
    metadata: { inventoryId: reservation.inventory_id, quantity: Number(reservation.quantity) },
  });

  return toApi(updated);
}

/** Release every reservation in a group (what "cancel my hold" means to a user). */
async function releaseGroup(groupId, actor) {
  const reservations = await db.findMany(TABLES.RESERVATIONS, {
    where: { group_id: groupId, status: RESERVATION_STATUS.ACTIVE },
  });

  if (reservations.length === 0) throw ApiError.notFound('No active reservations found for that group.');

  const released = [];
  for (const reservation of reservations) {
    released.push(await release(reservation.id, actor));
  }
  return released;
}

/**
 * Attach reservations to the order that consumes them. The units stay
 * reserved - they are only deducted from total stock when the order is
 * dispatched, because until then they are still physically on the shelf.
 */
async function consumeForOrder(reservationIds, orderId, actor) {
  const consumed = [];

  for (const id of reservationIds) {
    const reservation = await getByIdOrFail(id);
    assertCanTouch(reservation, actor);

    if (reservation.status !== RESERVATION_STATUS.ACTIVE) {
      throw ApiError.conflict(
        `Reservation ${id} is ${reservation.status} and can no longer be used.`,
        ERROR_CODES.RESERVATION_EXPIRED
      );
    }

    if (isExpired(reservation)) {
      // Sweep it now rather than letting an expired hold become an order.
      await db.releaseStock(reservation.inventory_id, Number(reservation.quantity));
      await db.update(TABLES.RESERVATIONS, id, { status: RESERVATION_STATUS.EXPIRED });
      throw new ApiError(
        409,
        ERROR_CODES.RESERVATION_EXPIRED,
        `Reservation ${id} expired before the order was created. Search again and reserve the stock afresh.`
      );
    }

    consumed.push(
      await db.update(TABLES.RESERVATIONS, id, {
        status: RESERVATION_STATUS.CONSUMED,
        order_id: orderId,
      })
    );
  }

  return consumed;
}

/** Give stock back for a cancelled order that never shipped. */
async function releaseForOrder(orderId) {
  const reservations = await db.findMany(TABLES.RESERVATIONS, { where: { order_id: orderId } });

  for (const reservation of reservations) {
    if (reservation.status !== RESERVATION_STATUS.CONSUMED) continue;
    await db.releaseStock(reservation.inventory_id, Number(reservation.quantity));
    await db.update(TABLES.RESERVATIONS, reservation.id, { status: RESERVATION_STATUS.RELEASED });
  }

  return reservations.length;
}

module.exports = {
  create,
  list,
  release,
  releaseGroup,
  getByIdOrFail,
  consumeForOrder,
  releaseForOrder,
  expireDue,
  startReservationSweeper,
  toApi,
};
