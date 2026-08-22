'use strict';

const db = require('../db');
const organizationService = require('../services/organization.service');
const asyncHandler = require('../utils/asyncHandler');
const ApiError = require('../utils/ApiError');
const { sendSuccess, sendCreated } = require('../utils/response');
const { sanitizeProfile } = require('../utils/security');
const { TABLES } = require('../config/constants');

/** HTTP layer for /api/organizations. */

/**
 * Registers an organisation for a user who signed up without one and links
 * the two. Users who already belong to an organisation cannot create a second.
 */
const create = asyncHandler(async (req, res) => {
  if (req.user.organization_id) {
    throw ApiError.conflict('Your account already belongs to an organisation.');
  }

  const organization = await organizationService.create(req.body, req.user);
  const profile = await db.update(TABLES.PROFILES, req.user.id, { organization_id: organization.id });

  return sendCreated(res, {
    organization: organizationService.toDetailed(organization),
    profile: sanitizeProfile(profile),
  });
});

const list = asyncHandler(async (req, res) => {
  const limit = Number(req.query.limit) || 50;
  const offset = Number(req.query.offset) || 0;

  const organizations = await organizationService.list({
    type: req.query.type,
    verificationStatus: req.query.verificationStatus,
    search: req.query.search,
    limit,
    offset,
  });

  return sendSuccess(
    res,
    organizations.map((organization) => organizationService.present(organization, req.user)),
    200,
    { limit, offset, count: organizations.length }
  );
});

const getById = asyncHandler(async (req, res) => {
  const organization = await organizationService.getByIdOrFail(req.params.id);
  return sendSuccess(res, organizationService.present(organization, req.user));
});

const update = asyncHandler(async (req, res) => {
  const organization = await organizationService.update(req.params.id, req.body, req.user);
  return sendSuccess(res, organizationService.toDetailed(organization));
});

const addDocument = asyncHandler(async (req, res) => {
  const document = await organizationService.addDocument(req.params.id, req.body, req.user);
  return sendCreated(res, document);
});

const listDocuments = asyncHandler(async (req, res) => {
  const documents = await organizationService.listDocuments(req.params.id, req.user);
  return sendSuccess(res, documents);
});

module.exports = { create, list, getById, update, addDocument, listDocuments };
