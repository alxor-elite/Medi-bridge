'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const notifications = require('./notification.service');
const {
  TABLES,
  ROLES,
  VERIFICATION_STATUS,
  AUDIT_ACTIONS,
  NOTIFICATION_TYPES,
  ERROR_CODES,
} = require('../config/constants');

/**
 * Organisations are hospitals, pharmacies and suppliers.
 *
 * Every organisation starts PENDING and only an admin can move it to
 * VERIFIED. Until then it cannot trade: unverified organisations are filtered
 * out of emergency search and blocked by `requireVerifiedOrganization`.
 */

/** Fields any signed-in user may see about any organisation. */
function toPublic(organization) {
  if (!organization) return null;
  return {
    id: organization.id,
    name: organization.name,
    type: organization.type,
    phone: organization.phone,
    address: organization.address,
    latitude: organization.latitude,
    longitude: organization.longitude,
    verificationStatus: organization.verification_status,
    createdAt: organization.created_at,
  };
}

/**
 * Adds the commercially sensitive fields. Only the organisation's own members
 * and admins get this projection.
 */
function toDetailed(organization) {
  if (!organization) return null;
  return {
    ...toPublic(organization),
    email: organization.email,
    registrationNumber: organization.registration_number,
    licenseNumber: organization.license_number,
    verificationNotes: organization.verification_notes || null,
    verifiedAt: organization.verified_at || null,
    verifiedBy: organization.verified_by || null,
    reliabilityScore: organization.reliability_score,
    updatedAt: organization.updated_at,
  };
}

/** True when the viewer belongs to the organisation, or is an admin. */
function canSeeDetails(viewer, organizationId) {
  if (!viewer) return false;
  return viewer.role === ROLES.ADMIN || viewer.organization_id === organizationId;
}

function present(organization, viewer) {
  return canSeeDetails(viewer, organization.id) ? toDetailed(organization) : toPublic(organization);
}

async function create(payload, actor = null) {
  const existing = await db.findOne(TABLES.ORGANIZATIONS, {
    where: { registration_number: payload.registrationNumber },
  });
  if (existing) {
    throw ApiError.conflict(
      'An organisation with this registration number is already on MediBridge.',
      ERROR_CODES.CONFLICT
    );
  }

  const organization = await db.insert(TABLES.ORGANIZATIONS, {
    name: payload.name,
    type: payload.type,
    registration_number: payload.registrationNumber,
    license_number: payload.licenseNumber || null,
    phone: payload.phone || null,
    email: payload.email || null,
    address: payload.address || null,
    latitude: payload.latitude ?? null,
    longitude: payload.longitude ?? null,
    verification_status: VERIFICATION_STATUS.PENDING,
    verification_notes: null,
    verified_at: null,
    verified_by: null,
    // Starts neutral; earned by delivering orders on time (see recomputeReliability).
    reliability_score: 75,
  });

  await audit.record({
    userId: actor?.id ?? null,
    organizationId: organization.id,
    action: AUDIT_ACTIONS.ORGANIZATION_CREATED,
    entityType: 'organization',
    entityId: organization.id,
    metadata: { name: organization.name, type: organization.type },
  });

  return organization;
}

async function getByIdOrFail(id) {
  const organization = await db.findById(TABLES.ORGANIZATIONS, id);
  if (!organization) throw ApiError.notFound('Organisation not found.');
  return organization;
}

async function list({ type, verificationStatus, search, limit = 50, offset = 0 } = {}) {
  const where = {};
  if (type) where.type = type;
  if (verificationStatus) where.verification_status = verificationStatus;

  return db.findMany(TABLES.ORGANIZATIONS, {
    where,
    search: search ? { columns: ['name', 'address'], term: search } : undefined,
    order: { column: 'name', ascending: true },
    limit,
    offset,
  });
}

/** Members update their own organisation; admins may update any. */
async function update(id, payload, actor) {
  const organization = await getByIdOrFail(id);

  if (actor.role !== ROLES.ADMIN && actor.organization_id !== id) {
    throw ApiError.forbidden('You can only update your own organisation.');
  }

  const patch = {};
  const editable = {
    name: 'name',
    phone: 'phone',
    email: 'email',
    address: 'address',
    latitude: 'latitude',
    longitude: 'longitude',
    licenseNumber: 'license_number',
  };
  for (const [input, column] of Object.entries(editable)) {
    if (payload[input] !== undefined) patch[column] = payload[input];
  }

  // The registration number and verification status are not self-service:
  // changing either would defeat the whole verification workflow.
  if (Object.keys(patch).length === 0) return organization;

  const updated = await db.update(TABLES.ORGANIZATIONS, id, patch);
  await audit.recordForUser(actor, AUDIT_ACTIONS.ORGANIZATION_CREATED, {
    entityType: 'organization',
    entityId: id,
    metadata: { updatedFields: Object.keys(patch) },
  });
  return updated;
}

/* -------------------------------------------------------------------------
 * Verification workflow
 * ---------------------------------------------------------------------- */

/**
 * Documents an organisation submits to support its verification request.
 * For the hackathon these are URLs to uploaded files plus a declared type -
 * MediBridge does not contact any licensing authority, and must not claim to.
 */
async function addDocument(organizationId, payload, actor) {
  await getByIdOrFail(organizationId);

  if (actor.role !== ROLES.ADMIN && actor.organization_id !== organizationId) {
    throw ApiError.forbidden('You can only submit documents for your own organisation.');
  }

  const document = await db.insert(TABLES.VERIFICATION_DOCUMENTS, {
    organization_id: organizationId,
    document_type: payload.documentType,
    document_number: payload.documentNumber || null,
    file_url: payload.fileUrl,
    issued_by: payload.issuedBy || null,
    expires_on: payload.expiresOn || null,
    uploaded_by: actor.id,
    notes: payload.notes || null,
  });

  await audit.recordForUser(actor, AUDIT_ACTIONS.DOCUMENT_SUBMITTED, {
    entityType: 'verification_document',
    entityId: document.id,
    metadata: { organizationId, documentType: document.document_type },
  });

  return document;
}

async function listDocuments(organizationId, viewer) {
  await getByIdOrFail(organizationId);

  if (!canSeeDetails(viewer, organizationId)) {
    throw ApiError.forbidden('Verification documents are private to the organisation and administrators.');
  }

  return db.findMany(TABLES.VERIFICATION_DOCUMENTS, {
    where: { organization_id: organizationId },
    order: { column: 'created_at', ascending: false },
  });
}

/** Everything an admin needs on one screen to make a verification decision. */
async function getVerificationCase(organizationId) {
  const organization = await getByIdOrFail(organizationId);
  const [documents, members] = await Promise.all([
    db.findMany(TABLES.VERIFICATION_DOCUMENTS, {
      where: { organization_id: organizationId },
      order: { column: 'created_at', ascending: false },
    }),
    db.findMany(TABLES.PROFILES, { where: { organization_id: organizationId } }),
  ]);

  return {
    organization: toDetailed(organization),
    documents,
    members: members.map((member) => ({
      id: member.id,
      fullName: member.full_name,
      email: member.email,
      phone: member.phone,
      role: member.role,
    })),
  };
}

const DECISION_AUDIT = {
  [VERIFICATION_STATUS.VERIFIED]: AUDIT_ACTIONS.ORGANIZATION_APPROVED,
  [VERIFICATION_STATUS.REJECTED]: AUDIT_ACTIONS.ORGANIZATION_REJECTED,
  [VERIFICATION_STATUS.SUSPENDED]: AUDIT_ACTIONS.ORGANIZATION_SUSPENDED,
  [VERIFICATION_STATUS.PENDING]: AUDIT_ACTIONS.ORGANIZATION_CREATED,
};

const DECISION_NOTIFICATION = {
  [VERIFICATION_STATUS.VERIFIED]: {
    type: NOTIFICATION_TYPES.VERIFICATION_APPROVED,
    title: 'Organisation verified',
    message: 'Your organisation has been verified. You can now trade on MediBridge.',
  },
  [VERIFICATION_STATUS.REJECTED]: {
    type: NOTIFICATION_TYPES.VERIFICATION_REJECTED,
    title: 'Verification rejected',
    message: 'Your verification request was rejected. Review the reviewer notes and submit again.',
  },
  [VERIFICATION_STATUS.SUSPENDED]: {
    type: NOTIFICATION_TYPES.VERIFICATION_SUSPENDED,
    title: 'Organisation suspended',
    message: 'Your organisation has been suspended and cannot trade until it is reinstated.',
  },
};

/**
 * The admin decision step of the mock verification workflow.
 * This records a human's judgement - it does not verify a licence against any
 * government register.
 */
async function setVerificationStatus(organizationId, status, adminUser, notes = null) {
  const organization = await getByIdOrFail(organizationId);

  if (organization.verification_status === status) {
    throw ApiError.conflict(`This organisation is already ${status}.`);
  }

  const isDecided = status === VERIFICATION_STATUS.VERIFIED;
  const updated = await db.update(TABLES.ORGANIZATIONS, organizationId, {
    verification_status: status,
    verification_notes: notes,
    verified_at: isDecided ? new Date().toISOString() : organization.verified_at,
    verified_by: isDecided ? adminUser.id : organization.verified_by,
  });

  await audit.record({
    userId: adminUser.id,
    organizationId,
    action: DECISION_AUDIT[status],
    entityType: 'organization',
    entityId: organizationId,
    metadata: { from: organization.verification_status, to: status, notes },
  });

  const template = DECISION_NOTIFICATION[status];
  if (template) {
    await notifications.createForOrganization(organizationId, {
      ...template,
      metadata: { status, notes },
    });
  }

  return updated;
}

/**
 * Reliability is a delivery track record, recomputed from completed orders:
 * the share that reached DELIVERED rather than being cancelled by the
 * supplier. New organisations sit at a neutral 75 until they have history.
 */
async function recomputeReliability(organizationId) {
  const orders = await db.findMany(TABLES.ORDERS, { where: { supplier_id: organizationId } });
  const finished = orders.filter((order) => ['DELIVERED', 'CANCELLED'].includes(order.status));
  if (finished.length < 3) return null;

  const delivered = finished.filter((order) => order.status === 'DELIVERED').length;
  const score = Math.round((delivered / finished.length) * 100);

  return db.update(TABLES.ORGANIZATIONS, organizationId, { reliability_score: score });
}

module.exports = {
  create,
  list,
  update,
  getByIdOrFail,
  addDocument,
  listDocuments,
  getVerificationCase,
  setVerificationStatus,
  recomputeReliability,
  toPublic,
  toDetailed,
  present,
  canSeeDetails,
};
