// RentBill Pro — Production-Grade Resilient Database Adapter
// Self-healing schema adaptation: automatically detects & strips unsupported columns across all Supabase versions

const unsupportedColumns = new Map(); // table -> Set of unsupported column names

// Columns known to be integer, bigint, or numeric in the database schema.
// Passing an empty string "" to these columns causes Postgres type-casting failure:
// "invalid input syntax for type integer: """
const INTEGER_COLUMNS = {
  units: new Set(['floor', 'property_id', 'monthly_rent']),
  properties: new Set(['owner_id']),
  renters: new Set([
    'unit_id', 'owner_id', 'base_rent', 'advance_amount', 'pending_arrears',
    'maint_charge', 'eb_unit_price', 'initial_eb', 'water_fixed_charge',
    'water_unit_price', 'initial_water'
  ]),
  bills: new Set([
    'renter_id', 'curr_eb_reading', 'curr_water_reading', 'late_fee',
    'discount_amount', 'others', 'net_amount', 'rent_amount', 'maint_amount',
    'eb_amount', 'water_amount', 'arrears_included'
  ]),
  payments: new Set(['bill_id', 'renter_id', 'amount']),
  expenses: new Set(['property_id', 'amount']),
  maintenance_tasks: new Set(['property_id', 'unit_id', 'renter_id', 'estimated_cost', 'actual_cost']),
  maintenance_tickets: new Set(['property_id', 'unit_id', 'renter_id', 'estimated_cost', 'actual_cost']),
  owner_withdrawals: new Set(['owner_id', 'amount']),
  documents: new Set(['entity_id', 'file_size'])
};

/**
 * Filter out known unsupported columns and sanitize empty strings for integer/numeric columns
 */
export function cleanPayload(table, payload) {
  if (!payload) return payload;

  if (Array.isArray(payload)) {
    return payload.map(item => cleanPayload(table, item));
  }

  const cleaned = { ...payload };
  const unsupported = unsupportedColumns.get(table);
  if (unsupported) {
    for (const col of unsupported) {
      delete cleaned[col];
    }
  }

  // Sanitize empty strings on numeric/integer columns to prevent Postgres syntax errors
  const intCols = INTEGER_COLUMNS[table];
  if (intCols) {
    for (const key of Object.keys(cleaned)) {
      if (intCols.has(key) && cleaned[key] === '') {
        cleaned[key] = null;
      }
    }
  }

  return cleaned;
}

/**
 * Safely inserts records into Supabase, automatically adapting to schema differences in production
 */
export async function safeInsert(client, table, payload) {
  if (!client) return { error: new Error('Database client not initialized') };

  let currentPayload = cleanPayload(table, payload);
  let maxRetries = 10;

  while (maxRetries > 0) {
    const res = await client.from(table).insert(currentPayload);
    if (!res.error) {
      return res;
    }

    const errMsg = res.error.message || '';
    // Match PostgREST schema cache errors or Postgres missing column errors
    const match = errMsg.match(/Could not find the '([^']+)' column/i) ||
                  errMsg.match(/column "?([^"'\s]+)"? of relation [^\s]+ does not exist/i) ||
                  errMsg.match(/column "?([^"'\s]+)"? does not exist/i);

    if (match && match[1]) {
      const missingCol = match[1].trim();
      const hasCol = Array.isArray(currentPayload)
        ? currentPayload.some(item => item && Object.prototype.hasOwnProperty.call(item, missingCol))
        : (currentPayload && typeof currentPayload === 'object' && Object.prototype.hasOwnProperty.call(currentPayload, missingCol));

      if (!hasCol) {
        return res;
      }

      if (!unsupportedColumns.has(table)) {
        unsupportedColumns.set(table, new Set());
      }
      unsupportedColumns.get(table).add(missingCol);

      // Strip missing column from currentPayload and retry
      if (Array.isArray(currentPayload)) {
        currentPayload = currentPayload.map(item => {
          const copy = { ...item };
          delete copy[missingCol];
          return copy;
        });
      } else if (typeof currentPayload === 'object' && currentPayload !== null) {
        currentPayload = { ...currentPayload };
        delete currentPayload[missingCol];
      }

      maxRetries--;
      continue;
    }

    // Self-healing resolution for duplicate unique constraint errors (e.g. recreating bill for same month)
    if (table === 'bills' && (errMsg.includes('bills_renter_id_billing_period_key') || errMsg.includes('duplicate key value violates unique constraint'))) {
      const singleItem = Array.isArray(currentPayload) ? currentPayload[0] : currentPayload;
      if (singleItem && singleItem.renter_id && singleItem.billing_period) {
        const { data: existing } = await client.from('bills')
          .select('id')
          .eq('renter_id', singleItem.renter_id)
          .eq('billing_period', singleItem.billing_period)
          .limit(1);

        if (existing && existing.length > 0) {
          return await safeUpdate(client, 'bills', { ...singleItem, deleted_at: null }, 'id', existing[0].id);
        }
      }
    }

    return res;
  }

  return { error: new Error(`Failed to insert into ${table}: ${res?.error?.message || 'schema adaptation limit reached'}`) };
}

/**
 * Safely updates records in Supabase, automatically adapting to schema differences in production
 */
export async function safeUpdate(client, table, payload, matchField, matchValue) {
  if (!client) return { error: new Error('Database client not initialized') };

  let currentPayload = cleanPayload(table, payload);
  let maxRetries = 10;
  let lastError = null;

  while (maxRetries > 0) {
    const res = await client.from(table).update(currentPayload).eq(matchField, matchValue);
    if (!res.error) {
      return res;
    }

    lastError = res.error;
    const errMsg = res.error.message || '';
    const match = errMsg.match(/Could not find the '([^']+)' column/i) ||
                  errMsg.match(/column "?([^"'\s]+)"? of relation [^\s]+ does not exist/i) ||
                  errMsg.match(/column "?([^"'\s]+)"? does not exist/i);

    if (match && match[1]) {
      const missingCol = match[1].trim();
      const hasCol = currentPayload && typeof currentPayload === 'object' && Object.prototype.hasOwnProperty.call(currentPayload, missingCol);

      if (!hasCol) {
        return res;
      }

      if (!unsupportedColumns.has(table)) {
        unsupportedColumns.set(table, new Set());
      }
      unsupportedColumns.get(table).add(missingCol);

      currentPayload = { ...currentPayload };
      delete currentPayload[missingCol];

      maxRetries--;
      continue;
    }

    return res;
  }

  return { error: new Error(`Failed to update ${table}: ${lastError?.message || 'schema adaptation limit reached'}`) };
}

/**
 * Safely performs soft delete, falling back to hard delete if deleted_at is not in schema
 */
export async function safeDelete(client, table, id) {
  if (!client) return { error: new Error('Database client not initialized') };

  // 1. Try soft delete first if not known to be unsupported
  const unsupported = unsupportedColumns.get(table);
  if (!unsupported || !unsupported.has('deleted_at')) {
    const res = await client.from(table).update({ deleted_at: new Date().toISOString() }).eq('id', id);
    if (!res.error) return res;

    const errMsg = res.error.message || '';
    if (errMsg.includes('deleted_at')) {
      if (!unsupportedColumns.has(table)) {
        unsupportedColumns.set(table, new Set());
      }
      unsupportedColumns.get(table).add('deleted_at');
    } else {
      return res;
    }
  }

  // 2. Fallback to hard delete if soft delete column is not in schema
  return await client.from(table).delete().eq('id', id);
}
