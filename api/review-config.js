/**
 * Flow Reviewer — Review Config API
 * GET /api/review-config?slug=acme-plumbing
 *
 * Returns the public business setup needed to render the review page.
 * Only exposes non-sensitive fields (no billing data).
 */

const { getDb } = require('./_db');

module.exports = async function handler(req, res) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug } = req.query;
  if (!slug) {
    return res.status(400).json({ error: 'Missing slug parameter' });
  }

  // ── Check subscription is active enough to serve review page ─────────────
  const db = getDb();

  const { data: client, error } = await db
    .from('clients')
    .select('business_name, business_slug, business_tone, google_review_url, review_link_status')
    .eq('business_slug', slug)
    .single();

  if (error || !client) {
    return res.status(404).json({ error: 'Review page not found' });
  }

  const activeStatuses = ['Active', 'Grace period', 'Active until end of term'];
  if (!activeStatuses.includes(client.review_link_status)) {
    return res.status(403).json({ error: 'Review link is not currently active' });
  }

  return res.status(200).json({
    businessName: client.business_name,
    slug:         client.business_slug,
    tone:         client.business_tone   || 'Helpful',
    googleUrl:    client.google_review_url,
  });
};
