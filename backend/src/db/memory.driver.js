'use strict';

/**
 * In-process table store used when DB_DRIVER=memory.
 *
 * It exists so the whole API can be started, seeded and tested on a laptop
 * without Supabase credentials. It implements exactly the same driver
 * interface as the Supabase driver, so no service knows which one is active.
 *
 * Data lives only in this process and disappears on restart. `env.js`
 * refuses to boot with this driver when NODE_ENV=production.
 */

/** Serialises the atomic stock operations so two reservations cannot race. */
function createMutex() {
  let tail = Promise.resolve();
  return function withLock(fn) {
    const run = tail.then(() => fn());
    // Swallow rejections on the chain itself, otherwise one failed critical
    // section would poison every later one.
    tail = run.then(
      () => undefined,
      () => undefined
    );
    return run;
  };
}

const clone = (row) => (row === null || row === undefined ? row : JSON.parse(JSON.stringify(row)));

function matchesFilters(row, options) {
  const { where = {}, neq = {}, gt = {}, gte = {}, lt = {}, lte = {}, in: inFilter = {}, isNull = [], notNull = [] } = options;

  for (const [column, value] of Object.entries(where)) {
    if (row[column] !== value) return false;
  }
  for (const [column, value] of Object.entries(neq)) {
    if (row[column] === value) return false;
  }
  for (const [column, value] of Object.entries(gt)) {
    if (!(row[column] > value)) return false;
  }
  for (const [column, value] of Object.entries(gte)) {
    if (!(row[column] >= value)) return false;
  }
  for (const [column, value] of Object.entries(lt)) {
    if (!(row[column] < value)) return false;
  }
  for (const [column, value] of Object.entries(lte)) {
    if (!(row[column] <= value)) return false;
  }
  for (const [column, values] of Object.entries(inFilter)) {
    if (!Array.isArray(values) || !values.includes(row[column])) return false;
  }
  for (const column of isNull) {
    if (row[column] !== null && row[column] !== undefined) return false;
  }
  for (const column of notNull) {
    if (row[column] === null || row[column] === undefined) return false;
  }

  if (options.search && options.search.term) {
    const term = String(options.search.term).toLowerCase();
    const columns = options.search.columns || [];
    const hit = columns.some((column) => String(row[column] ?? '').toLowerCase().includes(term));
    if (!hit) return false;
  }

  return true;
}

function sortRows(rows, order) {
  if (!order || !order.column) return rows;
  const { column, ascending = true } = order;
  return rows.sort((a, b) => {
    const left = a[column];
    const right = b[column];
    if (left === right) return 0;
    if (left === null || left === undefined) return 1;
    if (right === null || right === undefined) return -1;
    if (left < right) return ascending ? -1 : 1;
    return ascending ? 1 : -1;
  });
}

function createMemoryDriver() {
  /** @type {Map<string, Map<string, object>>} */
  const tables = new Map();
  const withLock = createMutex();

  const table = (name) => {
    if (!tables.has(name)) tables.set(name, new Map());
    return tables.get(name);
  };

  const driver = {
    name: 'memory',

    async init() {
      return true;
    },

    async healthCheck() {
      return { driver: 'memory', reachable: true, tables: tables.size };
    },

    async insert(tableName, row) {
      const stored = clone(row);
      table(tableName).set(stored.id, stored);
      return clone(stored);
    },

    async insertMany(tableName, rows) {
      return Promise.all(rows.map((row) => driver.insert(tableName, row)));
    },

    async findById(tableName, id) {
      return clone(table(tableName).get(id) ?? null);
    },

    async findOne(tableName, options = {}) {
      const [row] = await driver.findMany(tableName, { ...options, limit: 1 });
      return row ?? null;
    },

    async findMany(tableName, options = {}) {
      let rows = [...table(tableName).values()].filter((row) => matchesFilters(row, options));
      rows = sortRows(rows, options.order);

      const offset = options.offset || 0;
      const limit = options.limit === undefined ? rows.length : options.limit;
      return rows.slice(offset, offset + limit).map(clone);
    },

    async count(tableName, options = {}) {
      return [...table(tableName).values()].filter((row) => matchesFilters(row, options)).length;
    },

    async update(tableName, id, patch) {
      const current = table(tableName).get(id);
      if (!current) return null;
      const next = { ...current, ...clone(patch) };
      table(tableName).set(id, next);
      return clone(next);
    },

    async updateWhere(tableName, options, patch) {
      const matches = [...table(tableName).values()].filter((row) => matchesFilters(row, options));
      return Promise.all(matches.map((row) => driver.update(tableName, row.id, patch)));
    },

    async remove(tableName, id) {
      const current = table(tableName).get(id);
      if (!current) return null;
      table(tableName).delete(id);
      return clone(current);
    },

    /**
     * Atomically move `quantity` from available into reserved.
     * Returns the updated row, or null when there is not enough stock.
     * Serialised through the mutex so two hospitals reserving at the same
     * moment can never oversell the same batch.
     */
    async reserveStock(inventoryId, quantity, timestamp) {
      return withLock(async () => {
        const row = table('inventory').get(inventoryId);
        if (!row) return null;
        const available = Number(row.quantity) - Number(row.reserved_quantity);
        if (available < quantity) return null;
        const next = {
          ...row,
          reserved_quantity: Number(row.reserved_quantity) + Number(quantity),
          updated_at: timestamp,
        };
        table('inventory').set(inventoryId, next);
        return clone(next);
      });
    },

    /** Give reserved units back to the available pool. */
    async releaseStock(inventoryId, quantity, timestamp) {
      return withLock(async () => {
        const row = table('inventory').get(inventoryId);
        if (!row) return null;
        const next = {
          ...row,
          reserved_quantity: Math.max(0, Number(row.reserved_quantity) - Number(quantity)),
          updated_at: timestamp,
        };
        table('inventory').set(inventoryId, next);
        return clone(next);
      });
    },

    /** Ship reserved units: they leave both the reserved pool and total stock. */
    async consumeStock(inventoryId, quantity, timestamp) {
      return withLock(async () => {
        const row = table('inventory').get(inventoryId);
        if (!row) return null;
        const next = {
          ...row,
          quantity: Math.max(0, Number(row.quantity) - Number(quantity)),
          reserved_quantity: Math.max(0, Number(row.reserved_quantity) - Number(quantity)),
          updated_at: timestamp,
        };
        table('inventory').set(inventoryId, next);
        return clone(next);
      });
    },

    /** Test helper - not part of the Supabase driver's public contract. */
    async reset() {
      tables.clear();
    },
  };

  return driver;
}

module.exports = { createMemoryDriver };
