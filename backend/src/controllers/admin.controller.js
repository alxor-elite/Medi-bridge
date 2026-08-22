'use strict';

const organizationService = require('../services/organization.service');
const authService = require('../services/auth.service');
const auditService = require('../services/audit.service');
const asyncHandler = require('../utils/asyncHandler');
const { sendSuccess, sendCreated } = require('../utils/response');
const { VERIFICATION_STATUS } = require('../config/constants');

/**
 * Admin-only surface: the verification queue, administrator provisioning and
 * the audit trail. Every route under /api/admin is gated by requireRole(ADMIN).
 */

/** The verification queue. Defaults to what still needs a decision. */
const listVerifications = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;
  const status = req.query.status || VERIFICATION_STATUS.PENDING;

  const organizations = await organizationService.list({
    verificationStatus: status === 'ALL' ? undefined : status,
    type: req.query.type,
    search: req.query.search,
    limit,
    offset,
  });

  return sendSuccess(res, organizations.map(organizationService.toDetailed), 200, {
    status,
    limit,
    offset,
    count: organizations.length,
  });
});

/** Organisation, its submitted documents and its members, on one screen. */
const getVerification = asyncHandler(async (req, res) => {
  return sendSuccess(res, await organizationService.getVerificationCase(req.params.id));
});

/**
 * Record the admin's decision: VERIFIED, REJECTED, SUSPENDED or back to
 * PENDING. This is a human review step, not a check against any government
 * licence register.
 */
const decideVerification = asyncHandler(async (req, res) => {
  const organization = await organizationService.setVerificationStatus(
    req.params.id,
    req.body.status,
    req.user,
    req.body.notes || null
  );

  return sendSuccess(res, organizationService.toDetailed(organization));
});

/** Only an existing admin can mint another admin account. */
const createUser = asyncHandler(async (req, res) => {
  const result = await authService.register(req.body, { allowAdminRole: true, actor: req.user });
  return sendCreated(res, result);
});

const listAuditLogs = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const logs = await auditService.list({
    organizationId: req.query.organizationId,
    userId: req.query.userId,
    action: req.query.action,
    entityType: req.query.entityType,
    entityId: req.query.entityId,
    limit,
    offset,
  });

  return sendSuccess(res, logs, 200, { limit, offset, count: logs.length });
});

module.exports = { listVerifications, getVerification, decideVerification, createUser, listAuditLogs };
