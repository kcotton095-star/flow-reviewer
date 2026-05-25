/**
 * Flow Reviewer — Supabase client singleton
 *
 * Usage in any API route:
 *   const { getDb, logWebhookEvent } = require('./_db');
 *   const db = getDb();
 *   await db.from('clients').select('*');
 *
 * Required environment variables (set in Vercel dashboard):
 *   SUPABASE_URL          — e.g. https://xxxx.supabase.co
 *   SUPABASE_SERVICE_KEY  — service-role secret key (bypasses RLS)
 */

const { createClient } = require('@supabase/supabase-js');

let _client = null;

function getDb() {
  if (_client) return _client;

  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;

  if (!url || !key) {
    throw new Error(
      'Missing Supabase env vars: SUPABASE_URL and SUPABASE_SERVICE_KEY must be set.'
    );
  }

  _client = createClient(url, key, {
    auth: { persistSession: false },
  });

  return _client;
}

/**
 * logWebhookEvent — appends a row to the webhook_events audit table.
 *
 * @param {object} db       - Supabase client from getDb()
 * @param {string} type     - e.g. 'stripe.invoice.paid'
 * @param {string} email    - client email (nullable)
 * @param {string} status   - 'Processed' | 'Failed' | 'Ignored'
 * @param {string} note     - short human-readable description
 * @param {object} payload  - raw event body (stored as JSONB)
 */
async function logWebhookEvent(db, type, email, status, note, payload = {}) {
  const { error } = await db.from('webhook_events').insert({
    event_type:   type,
    client_email: email || null,
    payload:      payload,
    status:       status,
    note:         note,
  });
  if (error) {
    console.error('[_db] Failed to log webhook event:', error.message);
  }
}

module.exports = { getDb, logWebhookEvent };
