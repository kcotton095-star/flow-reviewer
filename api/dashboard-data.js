/**
 * Flow Reviewer — Dashboard Data API
 * GET /api/dashboard-data
 *
 * Returns aggregated data for the admin dashboard:
 *   - Summary counts (total, active, grace period, expired, etc.)
 *   - Full client list with subscription + review status
 *   - Last 50 webhook events
 *
 * Protected by the shared secret header:
 *   x-flow-reviewer-secret: <FLOW_REVIEWER_SHARED_SECRET>
 */

const { getDb } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Auth ──────────────────────────────────────────────────────────────────
  const secret = process.env.FLOW_REVIEWER_SHARED_SECRET;
  if (secret && req.headers['x-flow-reviewer-secret'] !== secret) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const db = getDb();

  // ── Clients ───────────────────────────────────────────────────────────────
  const { data: clients, error: clientsErr } = await db
    .from('clients')
    .select([
      'id',
      'name',
      'email',
      'business_name',
      'business_slug',
      'business_tone',
      'subscription_status',
      'review_link_status',
      'offer_status',
      'paid_through_date',
      'billing_start_date',
      'cancellation_date',
      'google_review_url',
      'created_at',
      'updated_at',
    ].join(', '))
    .order('created_at', { ascending: false });

  if (clientsErr) {
    return res.status(500).json({ error: 'Failed to load clients', detail: clientsErr.message });
  }

  // ── Webhook events ────────────────────────────────────────────────────────
  const { data: events, error: eventsErr } = await db
    .from('webhook_events')
    .select('id, event_type, client_email, status, note, processed_at')
    .order('processed_at', { ascending: false })
    .limit(50);

  if (eventsErr) {
    return res.status(500).json({ error: 'Failed to load events', detail: eventsErr.message });
  }

  // ── Summary counts ────────────────────────────────────────────────────────
  const counts = {
    total:            clients.length,
    active:           clients.filter(c => c.subscription_status === 'Active').length,
    grace_period:     clients.filter(c => c.subscription_status === 'Grace period').length,
    cancel_scheduled: clients.filter(c => c.subscription_status === 'Cancel Scheduled').length,
    past_due:         clients.filter(c => c.subscription_status === 'Past Due').length,
    expired:          clients.filter(c => c.subscription_status === 'Expired').length,
    not_subscribed:   clients.filter(c => c.subscription_status === 'Not Subscribed').length,
    review_links_active: clients.filter(c =>
      ['Active', 'Grace period', 'Active until end of term'].includes(c.review_link_status)
    ).length,
  };

  return res.status(200).json({ counts, clients, events });
};
