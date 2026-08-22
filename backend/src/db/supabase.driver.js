'use strict';

const { createClient } = require('@supabase/supabase-js');
const { env } = require('../config/env');
const ApiError = require('../utils/ApiError');
const { ERROR_CODES } = require('../config/constants');

/**
 * Supabase/PostgREST implementation of the driver interface.
 *
 * The service role key is used here and nowhere else - it bypasses row level
 * security, so every access rule in this codebase is enforced by the auth and
 * ownership middleware, not by the database. The key must never reach the
 * frontend.
 */

function wrap(error, context) {
  return new ApiError(
    500,
    ERROR_CODES.DATABASE_ERROR,
    `Database operation failed while ${context}.`,
    env.isProduction ? undefined : { supabase: error.message, code: error.code }
  );
}

/** Translate the shared filter spec onto a PostgREST query builder. */
function applyFilters(query, options = {}) {
  const {
    where = {},
    neq = {},
    gt = {},
    gte = {},
    lt = {},
    lte = {},
    in: inFilter = {},
    isNull = [],
    notNull = [],
  } = options;

  for (const [column, value] of Object.entries(where)) query = query.eq(column, value);
  for (const [column, value] of Object.entries(neq)) query = query.neq(column, value);
  for (const [column, value] of Object.entries(gt)) query = query.gt(column, value);
  for (const [column, value] of Object.entries(gte)) query = query.gte(column, value);
  for (const [column, value] of Object.entries(lt)) query = query.lt(column, value);
  for (const [column, value] of Object.entries(lte)) query = query.lte(column, value);
  for (const [column, values] of Object.entries(inFilter)) query = query.in(column, values);
  for (const column of isNull) query = query.is(column, null);
  for (const column of notNull) query = query.not(column, 'is', null);

  if (options.search && options.search.term) {
    // Strip PostgREST's `or()` delimiters so a search term cannot break out
    // of the filter expression.
    const term = String(options.search.term).replace(/[%,().*]/g, ' ');
    const columns = options.search.columns || [];
    if (columns.length > 0) {
      query = query.or(columns.map((column) => `${column}.ilike.%${term}%`).join(','));
    }
  }

  if (options.order && options.order.column) {
    query = query.order(options.order.column, { ascending: options.order.ascending !== false });
  }

  if (options.limit !== undefined) {
    const offset = options.offset || 0;
    query = query.range(offset, offset + options.limit - 1);
  } else if (options.offset) {
    query = query.range(options.offset, options.offset + 999);
  }

  return query;
}

/** `RETURNS SETOF inventory` gives an array; an empty array means "refused". */
function unwrapRpcRow(data) {
  if (!data) return null;
  if (Array.isArray(data)) return data[0] ?? null;
  return data;
}

function createSupabaseDriver() {
  const client = createClient(env.supabaseUrl, env.supabaseServiceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const driver = {
    name: 'supabase',
    client,

    async init() {
      return true;
    },

    async healthCheck() {
      const { error } = await client.from('medicines').select('id').limit(1);
      return { driver: 'supabase', reachable: !error, message: error ? error.message : undefined };
    },

    async insert(tableName, row) {
      const { data, error } = await client.from(tableName).insert(row).select().single();
      if (error) throw wrap(error, `inserting into ${tableName}`);
      return data;
    },

    /**
     * Inserted in chunks: the seed writes ~1,800 inventory rows at once, and a
     * single payload that size can be rejected by PostgREST.
     */
    async insertMany(tableName, rows, chunkSize = 500) {
      if (rows.length === 0) return [];

      const inserted = [];
      for (let start = 0; start < rows.length; start += chunkSize) {
        const chunk = rows.slice(start, start + chunkSize);
        const { data, error } = await client.from(tableName).insert(chunk).select();
        if (error) throw wrap(error, `inserting into ${tableName}`);
        inserted.push(...(data || []));
      }

      return inserted;
    },

    async findById(tableName, id) {
      const { data, error } = await client.from(tableName).select('*').eq('id', id).maybeSingle();
      if (error) throw wrap(error, `reading ${tableName}`);
      return data ?? null;
    },

    async findOne(tableName, options = {}) {
      const rows = await driver.findMany(tableName, { ...options, limit: 1 });
      return rows[0] ?? null;
    },

    async findMany(tableName, options = {}) {
      const query = applyFilters(client.from(tableName).select(options.select || '*'), options);
      const { data, error } = await query;
      if (error) throw wrap(error, `querying ${tableName}`);
      return data || [];
    },

    async count(tableName, options = {}) {
      const query = applyFilters(client.from(tableName).select('id', { count: 'exact', head: true }), {
        ...options,
        limit: undefined,
        offset: undefined,
        order: undefined,
      });
      const { count, error } = await query;
      if (error) throw wrap(error, `counting ${tableName}`);
      return count || 0;
    },

    async update(tableName, id, patch) {
      const { data, error } = await client.from(tableName).update(patch).eq('id', id).select().maybeSingle();
      if (error) throw wrap(error, `updating ${tableName}`);
      return data ?? null;
    },

    async updateWhere(tableName, options, patch) {
      const query = applyFilters(client.from(tableName).update(patch), {
        ...options,
        limit: undefined,
        offset: undefined,
        order: undefined,
      });
      const { data, error } = await query.select();
      if (error) throw wrap(error, `updating ${tableName}`);
      return data || [];
    },

    async remove(tableName, id) {
      const { data, error } = await client.from(tableName).delete().eq('id', id).select().maybeSingle();
      if (error) throw wrap(error, `deleting from ${tableName}`);
      return data ?? null;
    },

    /**
     * Stock movements run inside Postgres functions (see db/schema.sql) so the
     * read-check-write happens in one statement under a row lock. Doing the
     * check in JavaScript would let two concurrent reservations both see the
     * same "available" figure and oversell the batch.
     */
    async reserveStock(inventoryId, quantity) {
      const { data, error } = await client.rpc('reserve_inventory', {
        p_inventory_id: inventoryId,
        p_quantity: quantity,
      });
      if (error) throw wrap(error, 'reserving inventory');
      return unwrapRpcRow(data);
    },

    async releaseStock(inventoryId, quantity) {
      const { data, error } = await client.rpc('release_inventory', {
        p_inventory_id: inventoryId,
        p_quantity: quantity,
      });
      if (error) throw wrap(error, 'releasing inventory');
      return unwrapRpcRow(data);
    },

    async consumeStock(inventoryId, quantity) {
      const { data, error } = await client.rpc('consume_inventory', {
        p_inventory_id: inventoryId,
        p_quantity: quantity,
      });
      if (error) throw wrap(error, 'consuming inventory');
      return unwrapRpcRow(data);
    },
  };

  return driver;
}

module.exports = { createSupabaseDriver };
