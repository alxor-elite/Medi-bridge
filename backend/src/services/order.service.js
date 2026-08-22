'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const reservationService = require('./reservation.service');
const organizationService = require('./organization.service');
const {
  TABLES,
  ROLES,
  ORDER_STATUS,
  ORDER_STATUS_TRANSITIONS,
  ORDER_STATUS_ACTORS,
  PRIORITY,
  RESERVATION_STATUS,
  AUDIT_ACTIONS,
  NOTIFICATION_TYPES,
  ERROR_CODES,
} = require('../config/constants');

/**
 * Orders: the commitment that follows a search.
 *
 * An order always stands on reservations. Either the hospital reserved the
 * stock first and passes the reservation ids, or it passes the items and this
 * service reserves them on its behalf - never a bare "decrement the number",
 * which is how stock gets oversold.
 *
 * Stock physically leaves the supplier at DISPATCHED, not at order time: until
 * the van moves, the units are reserved but still on the shelf.
 */

function toApi(order, items = null) {
  const payload = {
    id: order.id,
    reference: order.reference,
    hospitalId: order.hospital_id,
    supplierId: order.supplier_id,
    createdBy: order.created_by,
    priority: order.priority,
    status: order.status,
    totalAmount: order.total_amount === null ? null : Number(order.total_amount),
    currency: order.currency,
    deliveryAddress: order.delivery_address,
    deliveryLatitude: order.delivery_latitude,
    deliveryLongitude: order.delivery_longitude,
    requiredByMinutes: order.required_by_minutes,
    notes: order.notes,
    statusHistory: order.status_history || [],
    cancelledReason: order.cancelled_reason || null,
    createdAt: order.created_at,
    updatedAt: order.updated_at,
  };

  if (items) {
    payload.items = items.map((item) => ({
      id: item.id,
      inventoryId: item.inventory_id,
      itemType: item.item_type,
      medicineId: item.medicine_id,
      equipmentId: item.equipment_id,
      name: item.item_name,
      quantity: Number(item.quantity),
      unitPrice: item.unit_price === null ? null : Number(item.unit_price),
      lineTotal: item.line_total === null ? null : Number(item.line_total),
    }));
  }

  return payload;
}

/** Short human-quotable reference for phone calls during an emergency. */
function buildReference() {
  const stamp = new Date().toISOString().slice(2, 10).replace(/-/g, '');
  const suffix = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `MB-${stamp}-${suffix}`;
}

async function getByIdOrFail(id) {
  const order = await db.findById(TABLES.ORDERS, id);
  if (!order) throw ApiError.notFound('Order not found.');
  return order;
}

async function loadItems(orderId) {
  return db.findMany(TABLES.ORDER_ITEMS, { where: { order_id: orderId } });
}

/**
 * Who may look at an order: the buying hospital, the selling supplier, the
 * courier carrying it, and admins. Nobody else, ever.
 */
async function assertCanView(order, viewer) {
  if (viewer.role === ROLES.ADMIN) return;
  if (viewer.organization_id === order.hospital_id) return;
  if (viewer.organization_id === order.supplier_id) return;

  if (viewer.role === ROLES.DELIVERY) {
    const delivery = await db.findOne(TABLES.DELIVERIES, {
      where: { order_id: order.id, delivery_partner_id: viewer.id },
    });
    if (delivery) return;
  }

  throw ApiError.forbidden('This order belongs to another organisation.');
}

/**
 * Turn the request into reservation-backed lines.
 * Reservations passed in are validated; raw items are reserved here so both
 * paths end up equally safe.
 */
async function resolveReservations(payload, actor) {
  if (payload.reservationGroupId || (payload.reservationIds && payload.reservationIds.length > 0)) {
    const reservations = payload.reservationGroupId
      ? await db.findMany(TABLES.RESERVATIONS, { where: { group_id: payload.reservationGroupId } })
      : await Promise.all(payload.reservationIds.map((id) => reservationService.getByIdOrFail(id)));

    const active = reservations.filter((reservation) => reservation.status === RESERVATION_STATUS.ACTIVE);
    if (active.length === 0) {
      throw new ApiError(
        409,
        ERROR_CODES.RESERVATION_EXPIRED,
        'Those reservations are no longer active. Search again and reserve the stock afresh.'
      );
    }

    return { reservations: active, createdHere: false };
  }

  if (!Array.isArray(payload.items) || payload.items.length === 0) {
    throw ApiError.badRequest('Provide either reservation ids or the items to order.');
  }

  // No prior hold: take one now, so the order rests on reserved stock either way.
  const result = await reservationService.create({ allocation: payload.items, notes: payload.notes }, actor);
  const reservations = await Promise.all(
    result.reservations.map((reservation) => reservationService.getByIdOrFail(reservation.id))
  );

  return { reservations, createdHere: true };
}

async function create(payload, actor) {
  if (!actor.organization_id) {
    throw ApiError.forbidden('Your account must belong to an organisation before you can order.');
  }

  const { reservations, createdHere } = await resolveReservations(payload, actor);

  try {
    // A reservation may only be spent by the organisation that made it.
    for (const reservation of reservations) {
      if (reservation.organization_id !== actor.organization_id && actor.role !== ROLES.ADMIN) {
        throw ApiError.forbidden('One of those reservations belongs to another organisation.');
      }
    }

    // One order, one supplier: a multi-supplier basket is really several
    // orders, each with its own acceptance and its own van.
    const supplierIds = [...new Set(reservations.map((reservation) => reservation.supplier_id))];
    if (supplierIds.length > 1) {
      throw ApiError.badRequest(
        'All items in an order must come from one supplier. Create a separate order per supplier.'
      );
    }

    const supplierId = supplierIds[0];
    const supplier = await organizationService.getByIdOrFail(supplierId);
    const hospital = await organizationService.getByIdOrFail(actor.organization_id);

    const lines = await buildLines(reservations);
    const totalAmount = lines.every((line) => line.unit_price === null)
      ? null
      : Math.round(lines.reduce((sum, line) => sum + (line.line_total || 0), 0) * 100) / 100;

    const now = new Date().toISOString();
    const order = await db.insert(TABLES.ORDERS, {
      reference: buildReference(),
      hospital_id: actor.organization_id,
      supplier_id: supplierId,
      created_by: actor.id,
      priority: payload.priority || PRIORITY.NORMAL,
      status: ORDER_STATUS.PENDING,
      total_amount: totalAmount,
      currency: payload.currency || 'INR',
      delivery_address: payload.deliveryAddress || hospital.address || null,
      delivery_latitude: payload.deliveryLatitude ?? hospital.latitude ?? null,
      delivery_longitude: payload.deliveryLongitude ?? hospital.longitude ?? null,
      required_by_minutes: payload.requiredByMinutes ?? null,
      notes: payload.notes || null,
      cancelled_reason: null,
      status_history: [{ status: ORDER_STATUS.PENDING, at: now, by: actor.id }],
    });

    await db.insertMany(
      TABLES.ORDER_ITEMS,
      lines.map((line) => ({ ...line, order_id: order.id }))
    );

    await reservationService.consumeForOrder(
      reservations.map((reservation) => reservation.id),
      order.id,
      actor
    );

    await audit.recordForUser(actor, AUDIT_ACTIONS.ORDER_CREATED, {
      entityType: 'order',
      entityId: order.id,
      metadata: {
        reference: order.reference,
        supplierId,
        priority: order.priority,
        lineCount: lines.length,
        totalAmount,
      },
    });

    await notifications.createForOrganization(supplierId, {
      type: NOTIFICATION_TYPES.ORDER_CREATED,
      title: `New ${order.priority} order ${order.reference}`,
      message: `${hospital.name} placed a ${order.priority.toLowerCase()} order for ${lines.length} line item(s).`,
      metadata: { orderId: order.id, reference: order.reference, priority: order.priority },
    });

    return toApi(order, await loadItems(order.id));
  } catch (error) {
    // If this service took the hold, it also owns undoing it.
    if (createdHere) {
      await Promise.all(
        reservations.map((reservation) =>
          reservationService.release(reservation.id, actor).catch(() => undefined)
        )
      );
    }
    throw error;
  }
}

/** Snapshot price and description at order time - the catalogue may change later. */
async function buildLines(reservations) {
  const lines = [];

  for (const reservation of reservations) {
    const inventory = await db.findById(TABLES.INVENTORY, reservation.inventory_id);
    if (!inventory) throw ApiError.notFound(`Inventory item ${reservation.inventory_id} no longer exists.`);

    const catalogEntry = inventory.medicine_id
      ? await db.findById(TABLES.MEDICINES, inventory.medicine_id)
      : await db.findById(TABLES.EQUIPMENT, inventory.equipment_id);

    const quantity = Number(reservation.quantity);
    const unitPrice = inventory.price === null || inventory.price === undefined ? null : Number(inventory.price);

    lines.push({
      inventory_id: inventory.id,
      item_type: inventory.item_type,
      medicine_id: inventory.medicine_id,
      equipment_id: inventory.equipment_id,
      item_name: catalogEntry?.name || 'Unknown item',
      quantity,
      unit_price: unitPrice,
      line_total: unitPrice === null ? null : Math.round(unitPrice * quantity * 100) / 100,
    });
  }

  return lines;
}

async function list(query, viewer) {
  const where = {};
  if (query.status) where.status = query.status;
  if (query.priority) where.priority = query.priority;

  if (viewer.role === ROLES.ADMIN) {
    if (query.organizationId) where.hospital_id = query.organizationId;
    if (query.supplierId) where.supplier_id = query.supplierId;
  } else if (viewer.role === ROLES.SUPPLIER) {
    where.supplier_id = viewer.organization_id;
  } else if (viewer.role === ROLES.HOSPITAL) {
    where.hospital_id = viewer.organization_id;
  } else if (viewer.role === ROLES.DELIVERY) {
    // A courier's list is exactly the jobs assigned to them.
    const assignments = await db.findMany(TABLES.DELIVERIES, {
      where: { delivery_partner_id: viewer.id },
    });
    const orderIds = assignments.map((assignment) => assignment.order_id);
    if (orderIds.length === 0) return [];

    const orders = await db.findMany(TABLES.ORDERS, {
      in: { id: orderIds },
      order: { column: 'created_at', ascending: false },
    });
    return orders.map((order) => toApi(order));
  }

  const orders = await db.findMany(TABLES.ORDERS, {
    where,
    order: { column: 'created_at', ascending: false },
    limit: query.limit || 50,
    offset: query.offset || 0,
  });

  return orders.map((order) => toApi(order));
}

async function getById(id, viewer) {
  const order = await getByIdOrFail(id);
  await assertCanView(order, viewer);

  const [items, delivery] = await Promise.all([
    loadItems(id),
    db.findOne(TABLES.DELIVERIES, { where: { order_id: id } }),
  ]);

  return { ...toApi(order, items), delivery: delivery || null };
}

/* -------------------------------------------------------------------------
 * Status transitions
 * ---------------------------------------------------------------------- */

/**
 * Guards the state machine in config/constants.js. Two separate questions:
 * is this move legal at all, and is this caller allowed to make it?
 * DELIVERED -> PREPARING fails the first; a hospital marking its own order
 * DISPATCHED fails the second.
 */
function assertTransitionAllowed(order, nextStatus, actor, { viaDelivery = false } = {}) {
  const allowedNext = ORDER_STATUS_TRANSITIONS[order.status] || [];

  if (!allowedNext.includes(nextStatus)) {
    throw new ApiError(
      409,
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `An order cannot move from ${order.status} to ${nextStatus}.` +
        (allowedNext.length > 0 ? ` Allowed next: ${allowedNext.join(', ')}.` : ' This order is final.'),
      { from: order.status, to: nextStatus, allowed: allowedNext }
    );
  }

  // Admins act as the override workflow the brief allows for.
  if (actor.role === ROLES.ADMIN) return;

  /**
   * Driven by the delivery record rather than by someone asserting a status.
   * A courier confirming pickup IS the supplier handing the goods over, and
   * delivery.service has already proved this courier is the one assigned to
   * this order. The transition legality check above still applies, so this
   * cannot invent an impossible move - it only waives the "which role may ask
   * for this status" rule. Nothing reachable from a route sets this.
   */
  if (viaDelivery) return;

  const actorRoles = ORDER_STATUS_ACTORS[nextStatus] || [];
  if (!actorRoles.includes(actor.role)) {
    throw ApiError.forbidden(`Only ${actorRoles.join(' or ')} can move an order to ${nextStatus}.`);
  }

  // Being the right role is not enough - it has to be your order.
  const isSupplierSide = actor.organization_id === order.supplier_id;
  const isHospitalSide = actor.organization_id === order.hospital_id;

  if (actor.role === ROLES.SUPPLIER && !isSupplierSide) {
    throw ApiError.forbidden('This order was placed with another supplier.');
  }
  if (actor.role === ROLES.HOSPITAL && !isHospitalSide) {
    throw ApiError.forbidden('This order belongs to another hospital.');
  }
}

const STATUS_NOTIFICATION = {
  [ORDER_STATUS.ACCEPTED]: {
    type: NOTIFICATION_TYPES.ORDER_ACCEPTED,
    title: 'Order accepted',
    audience: 'hospital',
  },
  [ORDER_STATUS.PREPARING]: {
    type: NOTIFICATION_TYPES.ORDER_ACCEPTED,
    title: 'Order is being prepared',
    audience: 'hospital',
  },
  [ORDER_STATUS.DISPATCHED]: {
    type: NOTIFICATION_TYPES.ORDER_DISPATCHED,
    title: 'Order dispatched',
    audience: 'hospital',
  },
  [ORDER_STATUS.OUT_FOR_DELIVERY]: {
    type: NOTIFICATION_TYPES.ORDER_DISPATCHED,
    title: 'Order is out for delivery',
    audience: 'hospital',
  },
  [ORDER_STATUS.DELIVERED]: {
    type: NOTIFICATION_TYPES.ORDER_DELIVERED,
    title: 'Order delivered',
    audience: 'both',
  },
  [ORDER_STATUS.CANCELLED]: {
    type: NOTIFICATION_TYPES.ORDER_CANCELLED,
    title: 'Order cancelled',
    audience: 'both',
  },
};

async function updateStatus(id, nextStatus, actor, { reason = null, note = null, viaDelivery = false } = {}) {
  const order = await getByIdOrFail(id);
  await assertCanView(order, actor);
  assertTransitionAllowed(order, nextStatus, actor, { viaDelivery });

  const now = new Date().toISOString();
  const history = Array.isArray(order.status_history) ? [...order.status_history] : [];
  history.push({
    status: nextStatus,
    at: now,
    by: actor.id,
    via: viaDelivery ? 'delivery-tracking' : 'api',
    note: note || reason || null,
  });

  // Side effects first: if stock movement fails, the order must not claim to
  // have moved.
  if (nextStatus === ORDER_STATUS.DISPATCHED) {
    await shipReservedStock(order);
  }

  if (nextStatus === ORDER_STATUS.CANCELLED) {
    await handleCancellation(order);
  }

  const updated = await db.update(TABLES.ORDERS, id, {
    status: nextStatus,
    status_history: history,
    cancelled_reason: nextStatus === ORDER_STATUS.CANCELLED ? reason || note || null : order.cancelled_reason,
  });

  await audit.recordForUser(
    actor,
    nextStatus === ORDER_STATUS.CANCELLED ? AUDIT_ACTIONS.ORDER_CANCELLED : AUDIT_ACTIONS.ORDER_STATUS_CHANGED,
    {
      entityType: 'order',
      entityId: id,
      metadata: {
        reference: order.reference,
        from: order.status,
        to: nextStatus,
        reason,
        via: viaDelivery ? 'delivery-tracking' : 'api',
      },
    }
  );

  await announceStatus(updated, nextStatus, reason);

  if (nextStatus === ORDER_STATUS.DELIVERED) {
    // A completed delivery is exactly what the reliability score measures.
    await organizationService.recomputeReliability(order.supplier_id).catch(() => undefined);
  }

  return toApi(updated, await loadItems(id));
}

/**
 * The units leave the shelf. Reserved quantity and total quantity both drop,
 * so `available` is unchanged - the stock was already spoken for.
 */
async function shipReservedStock(order) {
  const reservations = await db.findMany(TABLES.RESERVATIONS, {
    where: { order_id: order.id, status: RESERVATION_STATUS.CONSUMED },
  });

  for (const reservation of reservations) {
    await db.consumeStock(reservation.inventory_id, Number(reservation.quantity));
  }
}

/**
 * Cancelling before dispatch returns the stock. After dispatch the goods have
 * physically left, so the stock stays gone and a human has to sort out the
 * return - inventing units back onto the shelf would be a lie.
 */
async function handleCancellation(order) {
  const alreadyShipped = [ORDER_STATUS.DISPATCHED, ORDER_STATUS.OUT_FOR_DELIVERY].includes(order.status);
  if (alreadyShipped) return;

  await reservationService.releaseForOrder(order.id);
}

async function announceStatus(order, status, reason) {
  const template = STATUS_NOTIFICATION[status];
  if (!template) return;

  const message =
    `Order ${order.reference} is now ${status.replace(/_/g, ' ').toLowerCase()}.` +
    (reason ? ` Reason: ${reason}` : '');

  const payload = {
    type: template.type,
    title: template.title,
    message,
    metadata: { orderId: order.id, reference: order.reference, status },
  };

  if (template.audience === 'hospital' || template.audience === 'both') {
    await notifications.createForOrganization(order.hospital_id, payload);
  }
  if (template.audience === 'supplier' || template.audience === 'both') {
    await notifications.createForOrganization(order.supplier_id, payload);
  }
}

module.exports = {
  create,
  list,
  getById,
  getByIdOrFail,
  updateStatus,
  assertCanView,
  assertTransitionAllowed,
  toApi,
};
