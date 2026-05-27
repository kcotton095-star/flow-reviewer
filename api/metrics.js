/**
 * Flow Reviewer — Live Metrics Endpoint
 * GET /api/metrics
 *
 * Returns live subscriber count, MRR, and recent signups.
 * Called by the command-center dashboard.
 */

const { getDb } = require('./_db');

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
    let activeCount = 0;
    let recentStripeSignups = [];

    try {
      const subs = await stripe.subscriptions.list({
        status: 'active',
        limit: 100,
        expand: ['data.customer'],
      });
      activeCount = subs.data.length;
      recentStripeSignups = subs.data
        .sort((a, b) => b.created - a.created)
        .slice(0, 5)
        .map(s => ({
          name:  s.customer?.name || s.customer?.email || 'Unknown',
          email: s.customer?.email || '',
          date:  new Date(s.created * 1000).toLocaleDateString('en-US', { month:'short', day:'numeric', year:'numeric' }),
          mrr:   (s.items.data[0]?.price?.unit_amount / 100).toFixed(2),
        }));
    } catch (stripeErr) {
      console.error('[metrics] Stripe error:', stripeErr.message);
    }

    let recentEvents = [];
    try {
      const db = getDb();
      const { data: events } = await db
        .from('webhook_events')
        .select('event_type, email, status, created_at')
        .order('created_at', { ascending: false })
        .limit(10);
      recentEvents = events || [];
    } catch (dbErr) {
      console.error('[metrics] Supabase error:', dbErr.message);
    }

    const mrr = (activeCount * 19.95).toFixed(2);
    return res.status(200).json({
      activeSubscribers: activeCount,
      mrr: parseFloat(mrr),
      annualRunRate: parseFloat((activeCount * 19.95 * 12).toFixed(2)),
      pricePerSeat: 19.95,
      recentSignups: recentStripeSignups,
      recentEvents,
      generatedAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[metrics] Error:', err.message);
    return res.status(500).json({ error: 'Failed to fetch metrics', detail: err.message });
  }
};
