'use strict';

const db = require('../db');
const ApiError = require('../utils/ApiError');
const audit = require('./audit.service');
const { TABLES, AUDIT_ACTIONS } = require('../config/constants');

/**
 * The shared master catalogue of medicines and equipment.
 *
 * Catalogue entries describe *what a thing is* and are global - every
 * organisation references the same medicine record. What each organisation
 * actually holds lives in `inventory`, so two pharmacies stocking adrenaline
 * point at one medicine id and searching works across both.
 *
 * Medicines and equipment behave identically apart from their columns, so one
 * factory builds both rather than duplicating the module.
 */

function createCatalog({ table, label, searchColumns, writable, auditAction }) {
  /** Map the API's camelCase payload onto database columns. */
  function toColumns(payload) {
    const row = {};
    for (const [input, column] of Object.entries(writable)) {
      if (payload[input] !== undefined) row[column] = payload[input];
    }
    return row;
  }

  return {
    async list({ search, category, manufacturer, limit = 50, offset = 0 } = {}) {
      const where = {};
      if (category) where.category = category;
      if (manufacturer) where.manufacturer = manufacturer;

      return db.findMany(table, {
        where,
        search: search ? { columns: searchColumns, term: search } : undefined,
        order: { column: 'name', ascending: true },
        limit,
        offset,
      });
    },

    async getByIdOrFail(id) {
      const row = await db.findById(table, id);
      if (!row) throw ApiError.notFound(`${label} not found.`);
      return row;
    },

    async create(payload, actor) {
      const row = toColumns(payload);

      // The catalogue is shared, so a duplicate entry splits one product's
      // stock across two ids and hides supply from search.
      const duplicate = await db.findOne(table, {
        where: { name: row.name, manufacturer: row.manufacturer ?? null },
      });
      if (duplicate) {
        throw ApiError.conflict(
          `"${row.name}" from this manufacturer is already in the ${label.toLowerCase()} catalogue.`,
          undefined,
          { existingId: duplicate.id }
        );
      }

      const created = await db.insert(table, row);
      await audit.recordForUser(actor, auditAction, {
        entityType: table,
        entityId: created.id,
        metadata: { name: created.name },
      });
      return created;
    },

    async update(id, payload, actor) {
      await this.getByIdOrFail(id);
      const patch = toColumns(payload);
      if (Object.keys(patch).length === 0) return this.getByIdOrFail(id);

      const updated = await db.update(table, id, patch);
      await audit.recordForUser(actor, auditAction, {
        entityType: table,
        entityId: id,
        metadata: { updatedFields: Object.keys(patch) },
      });
      return updated;
    },
  };
}

const medicines = createCatalog({
  table: TABLES.MEDICINES,
  label: 'Medicine',
  searchColumns: ['name', 'generic_name', 'manufacturer', 'category'],
  auditAction: AUDIT_ACTIONS.MEDICINE_CREATED,
  writable: {
    name: 'name',
    genericName: 'generic_name',
    manufacturer: 'manufacturer',
    category: 'category',
    description: 'description',
    strength: 'strength',
    form: 'form',
    requiresPrescription: 'requires_prescription',
  },
});

const equipment = createCatalog({
  table: TABLES.EQUIPMENT,
  label: 'Equipment',
  searchColumns: ['name', 'manufacturer', 'model', 'category'],
  auditAction: AUDIT_ACTIONS.EQUIPMENT_CREATED,
  writable: {
    name: 'name',
    category: 'category',
    manufacturer: 'manufacturer',
    model: 'model',
    description: 'description',
  },
});

module.exports = { medicines, equipment, createCatalog };
