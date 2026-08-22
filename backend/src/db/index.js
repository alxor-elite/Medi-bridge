'use strict';

const { randomUUID } = require('crypto');
const { env } = require('../config/env');
const { createMemoryDriver } = require('./memory.driver');

/**
 * Single entry point to the database.
 *
 * Services talk to this facade, never to Supabase directly. The facade picks
 * the driver from DB_DRIVER, fills in ids and timestamps so both drivers
 * behave identically, and exposes the atomic stock helpers.
 */

let driver = null;

function getDriver() {
  if (driver) return driver;

  if (env.dbDriver === 'memory') {
    driver = createMemoryDriver();
  } else {
    // Required lazily so a memory-driver run never needs Supabase credentials.
    const { createSupabaseDriver } = require('./supabase.driver');
    driver = createSupabaseDriver();
  }

  return driver;
}

const nowIso = () => new Date().toISOString();

function withDefaults(row, timestamp) {
  return {
    id: randomUUID(),
    created_at: timestamp,
    updated_at: timestamp,
    ...row,
  };
}

const db = {
  get name() {
    return getDriver().name;
  },

  /** Escape hatch for the seed script and tests only. */
  get raw() {
    return getDriver();
  },

  init: () => getDriver().init(),
  healthCheck: () => getDriver().healthCheck(),

  async insert(table, row) {
    return getDriver().insert(table, withDefaults(row, nowIso()));
  },

  async insertMany(table, rows) {
    const timestamp = nowIso();
    return getDriver().insertMany(
      table,
      rows.map((row) => withDefaults(row, timestamp))
    );
  },

  findById: (table, id) => (id ? getDriver().findById(table, id) : Promise.resolve(null)),
  findOne: (table, options) => getDriver().findOne(table, options),
  findMany: (table, options) => getDriver().findMany(table, options),
  count: (table, options) => getDriver().count(table, options),

  async update(table, id, patch) {
    return getDriver().update(table, id, { ...patch, updated_at: patch.updated_at || nowIso() });
  },

  async updateWhere(table, options, patch) {
    return getDriver().updateWhere(table, options, { ...patch, updated_at: patch.updated_at || nowIso() });
  },

  remove: (table, id) => getDriver().remove(table, id),

  reserveStock: (inventoryId, quantity) => getDriver().reserveStock(inventoryId, quantity, nowIso()),
  releaseStock: (inventoryId, quantity) => getDriver().releaseStock(inventoryId, quantity, nowIso()),
  consumeStock: (inventoryId, quantity) => getDriver().consumeStock(inventoryId, quantity, nowIso()),

  /** Used by tests to start from a clean slate. */
  async reset() {
    const active = getDriver();
    if (typeof active.reset !== 'function') {
      throw new Error(`The ${active.name} driver does not support reset()`);
    }
    return active.reset();
  },
};

module.exports = db;
