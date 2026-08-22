'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const orderService = require('./order.service');
const { distanceKm, estimateEtaMinutes } = require('../utils/geo');
const {
  TABLES,
  ROLES,
  DELIVERY_STATUS,
  DELIVERY_STATUS_TRANSITIONS,
  ORDER_STATUS,
  AUDIT_ACTIONS,
  ERROR_CODES,
} = require('../config/constants');

/**
 * Delivery tracking.
 *
 * Deliberately simple, as the brief asks: one delivery per order, a courier
 * profile, a status, and a last known position that the courier's app pushes
 * in. The ETA is recomputed from that position with the same straight-line
 * helper the search uses, so a real routing provider swaps in at one place.
 */

function toApi(delivery) {
  return {
    id: delivery.id,
    orderId: delivery.order_id,
    deliveryPartnerId: delivery.delivery_partner_id,
    status: delivery.status,
    currentLatitude: delivery.current_latitude,
    currentLongitude: delivery.current_longitude,
    destinationLatitude: delivery.destination_latitude,
    destinationLongitude: delivery.destination_longitude,
    distanceRemainingKm: delivery.distance_remaining_km,
    estimatedArrival: delivery.estimated_arrival,
    vehicleType: delivery.vehicle_type,
    vehicleNumber: delivery.vehicle_number,
    contactPhone: delivery.contact_phone,
    notes: delivery.notes,
    locationUpdatedAt: delivery.location_updated_at,
    createdAt: delivery.created_at,
    updatedAt: delivery.updated_at,
  };
}

async function getByIdOrFail(id) {
  const delivery = await db.findById(TABLES.DELIVERIES, id);
  if (!delivery) throw ApiError.notFound('Delivery not found.');
  return delivery;
}

/** The courier assigned to it, either trading side, or an admin. */
function assertCanTouch(delivery, order, actor, { partnerOnly = false } = {}) {
  if (actor.role === ROLES.ADMIN) return;

  const isPartner = delivery.delivery_partner_id === actor.id;
  if (isPartner) return;

  if (partnerOnly) {
    throw ApiError.forbidden('Only the assigned delivery partner can report this.');
  }

  if (actor.organization_id === order.supplier_id || actor.organization_id === order.hospital_id) return;

  throw ApiError.forbidden('This delivery belongs to another organisation.');
}

/** The supplier books a courier once it has accepted the order. */
async function create(payload, actor) {
  const order = await orderService.getByIdOrFail(payload.orderId);

  if (actor.role !== ROLES.ADMIN && actor.organization_id !== order.supplier_id) {
    throw ApiError.forbidden('Only the supplying organisation can arrange the delivery for this order.');
  }

  if ([ORDER_STATUS.PENDING, ORDER_STATUS.CANCELLED].includes(order.status)) {
    throw ApiError.conflict(
      `A delivery cannot be arranged while the order is ${order.status}. Accept the order first.`,
      ERROR_CODES.INVALID_STATUS_TRANSITION
    );
  }

  const existing = await db.findOne(TABLES.DELIVERIES, { where: { order_id: order.id } });
  if (existing) {
    throw ApiError.conflict('This order already has a delivery.', ERROR_CODES.CONFLICT, {
      deliveryId: existing.id,
    });
  }

  if (payload.deliveryPartnerId) {
    const partner = await db.findById(TABLES.PROFILES, payload.deliveryPartnerId);
    if (!partner) throw ApiError.notFound('Delivery partner not found.');
    if (partner.role !== ROLES.DELIVERY) {
      throw ApiError.badRequest('The assigned profile must have the DELIVERY role.');
    }
  }

  const delivery = await db.insert(TABLES.DELIVERIES, {
    order_id: order.id,
    delivery_partner_id: payload.deliveryPartnerId || null,
    status: DELIVERY_STATUS.ASSIGNED,
    current_latitude: payload.currentLatitude ?? null,
    current_longitude: payload.currentLongitude ?? null,
    destination_latitude: order.delivery_latitude ?? null,
    destination_longitude: order.delivery_longitude ?? null,
    distance_remaining_km: null,
    estimated_arrival: payload.estimatedArrival || null,
    vehicle_type: payload.vehicleType || null,
    vehicle_number: payload.vehicleNumber || null,
    contact_phone: payload.contactPhone || null,
    notes: payload.notes || null,
    location_updated_at: null,
  });

  await audit.recordForUser(actor, AUDIT_ACTIONS.DELIVERY_CREATED, {
    entityType: 'delivery',
    entityId: delivery.id,
    metadata: { orderId: order.id, deliveryPartnerId: delivery.delivery_partner_id },
  });

  return toApi(delivery);
}

async function getById(id, viewer) {
  const delivery = await getByIdOrFail(id);
  const order = await orderService.getByIdOrFail(delivery.order_id);
  assertCanTouch(delivery, order, viewer);
  return toApi(delivery);
}

async function getByOrderId(orderId, viewer) {
  const order = await orderService.getByIdOrFail(orderId);
  await orderService.assertCanView(order, viewer);

  const delivery = await db.findOne(TABLES.DELIVERIES, { where: { order_id: orderId } });
  return delivery ? toApi(delivery) : null;
}

async function list(query, viewer) {
  const where = {};
  if (query.status) where.status = query.status;

  if (viewer.role === ROLES.DELIVERY) {
    where.delivery_partner_id = viewer.id;
  } else if (viewer.role !== ROLES.ADMIN) {
    // Suppliers and hospitals see the deliveries for their own orders.
    const orders = await orderService.list({ limit: 200 }, viewer);
    const orderIds = orders.map((order) => order.id);
    if (orderIds.length === 0) return [];

    const deliveries = await db.findMany(TABLES.DELIVERIES, {
      where,
      in: { order_id: orderIds },
      order: { column: 'created_at', ascending: false },
    });
    return deliveries.map(toApi);
  }

  const deliveries = await db.findMany(TABLES.DELIVERIES, {
    where,
    order: { column: 'created_at', ascending: false },
    limit: query.limit || 50,
    offset: query.offset || 0,
  });

  return deliveries.map(toApi);
}

/**
 * Moves the delivery through ASSIGNED -> PICKED_UP -> IN_TRANSIT -> DELIVERED,
 * and keeps the order in step: picking up dispatches the order, arriving
 * completes it. The order service still validates its own transitions, so a
 * courier cannot push an order somewhere it should not go.
 */
async function updateStatus(id, nextStatus, actor, { note = null } = {}) {
  const delivery = await getByIdOrFail(id);
  const order = await orderService.getByIdOrFail(delivery.order_id);
  assertCanTouch(delivery, order, actor, { partnerOnly: false });

  const allowedNext = DELIVERY_STATUS_TRANSITIONS[delivery.status] || [];
  if (!allowedNext.includes(nextStatus)) {
    throw new ApiError(
      409,
      ERROR_CODES.INVALID_STATUS_TRANSITION,
      `A delivery cannot move from ${delivery.status} to ${nextStatus}.` +
        (allowedNext.length > 0 ? ` Allowed next: ${allowedNext.join(', ')}.` : ' This delivery is final.'),
      { from: delivery.status, to: nextStatus, allowed: allowedNext }
    );
  }

  const patch = { status: nextStatus, notes: note || delivery.notes };
  if (nextStatus === DELIVERY_STATUS.DELIVERED) {
    patch.estimated_arrival = new Date().toISOString();
    patch.distance_remaining_km = 0;
  }

  const updated = await db.update(TABLES.DELIVERIES, id, patch);

  await syncOrderStatus(order, nextStatus, actor);

  await audit.recordForUser(actor, AUDIT_ACTIONS.DELIVERY_STATUS_CHANGED, {
    entityType: 'delivery',
    entityId: id,
    metadata: { orderId: order.id, from: delivery.status, to: nextStatus },
  });

  return toApi(updated);
}

/**
 * Keep the order's status honest as the van moves. Transitions that are not
 * currently legal for the order are skipped rather than forced - the order's
 * own state machine is the authority.
 */
async function syncOrderStatus(order, deliveryStatus, actor) {
  const wanted = {
    [DELIVERY_STATUS.PICKED_UP]: ORDER_STATUS.DISPATCHED,
    [DELIVERY_STATUS.IN_TRANSIT]: ORDER_STATUS.OUT_FOR_DELIVERY,
    [DELIVERY_STATUS.DELIVERED]: ORDER_STATUS.DELIVERED,
  }[deliveryStatus];

  if (!wanted) return;

  // Walk the order forward one legal step at a time so PICKED_UP on a
  // PREPARING order still ends up DISPATCHED.
  let current = await orderService.getByIdOrFail(order.id);
  const path = [ORDER_STATUS.ACCEPTED, ORDER_STATUS.PREPARING, ORDER_STATUS.DISPATCHED, ORDER_STATUS.OUT_FOR_DELIVERY, ORDER_STATUS.DELIVERED];
  const target = path.indexOf(wanted);

  for (let step = path.indexOf(current.status) + 1; step <= target && step < path.length; step += 1) {
    if (step < 0) break;
    try {
      await orderService.updateStatus(current.id, path[step], actor, {
        note: 'Updated from delivery tracking.',
        // The delivery record is the authority here: this courier is the one
        // assigned to this order, which assertCanTouch has already verified.
        viaDelivery: true,
      });
      current = await orderService.getByIdOrFail(order.id);
    } catch (error) {
      // The order's rules win; surface nothing and leave it where it is.
      console.warn('[deliveries] could not sync order status:', error.message);
      break;
    }
  }
}

/** The courier's app pushes its position; the ETA follows from it. */
async function updateLocation(id, { latitude, longitude }, actor) {
  const delivery = await getByIdOrFail(id);
  const order = await orderService.getByIdOrFail(delivery.order_id);
  assertCanTouch(delivery, order, actor, { partnerOnly: true });

  const remaining = distanceKm(
    latitude,
    longitude,
    delivery.destination_latitude,
    delivery.destination_longitude
  );

  const now = new Date();
  const etaMinutes = estimateEtaMinutes(remaining, { overheadMinutes: 0 });

  const updated = await db.update(TABLES.DELIVERIES, id, {
    current_latitude: latitude,
    current_longitude: longitude,
    distance_remaining_km: remaining,
    estimated_arrival: etaMinutes === null ? delivery.estimated_arrival : new Date(now.getTime() + etaMinutes * 60000).toISOString(),
    location_updated_at: now.toISOString(),
  });

  return toApi(updated);
}

module.exports = { create, list, getById, getByOrderId, updateStatus, updateLocation, toApi };
