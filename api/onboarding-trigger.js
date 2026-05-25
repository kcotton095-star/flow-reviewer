/**
 * Flow Reviewer - Onboarding Trigger Endpoint
 * POST /api/onboarding-trigger
 *
 * Called by Zapier when a client completes onboarding in Financial Cents.
 * Phase 1: Validates and logs the event (no DB persistence yet).
 * Phase 2: Replace TODO blocks with Supabase/Neon writes.
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const incomingSecret =
    req.headers['x-flow-reviewer-secret'] ||
    req.headers['x-shared-secret'] ||
    req.body?.shared_secret;

  const expectedSecret = process.env.FLOW_REVIEWER_SHARED_SECRET;

  if (!expectedSecret) {
    console.error('[onboarding-trigger] FLOW_REVIEWER_SHARED_SECRET env var not set.');
    return res.status(500).json({ error: 'Server misconfiguration' });
  }

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    console.warn('[onboarding-trigger] Unauthorized: secret mismatch');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const body = req.body || {};
  const {
    client_name,
    client_email,
    client_phone,
    onboarding_completed_at,
    financial_cents_client_id,
    service_type,
    event_type,
  } = body;

  if (!client_name || !client_email) {
    return res.status(400).json({ error: 'Missing required fields: client_name, client_email' });
  }

  if (event_type && event_type !== 'onboarding_completed') {
    return res.status(400).json({ error: 'Unknown event_type: ' + event_type });
  }

  const clientRecord = {
    name: client_name,
    email: client_email,
    phone: client_phone || '',
    sector: service_type || 'Service business',
    onboardingStatus: 'Completed',
    onboardingCompletedAt: onboarding_completed_at || new Date().toISOString(),
    financialCentsId: financial_cents_client_id || '',
    offerEligible: true,
    offerStatus: 'Queued',
    subscriptionStatus: 'Not Subscribed',
    monthlyAmount: 49,
    reviewLinkUrl: '/review/' + client_name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/, ''),
  };

  console.log('[onboarding-trigger] Valid onboarding event:', {
    client: client_name,
    email: client_email,
    financial_cents_client_id,
  });

  // TODO Phase 2: Persist to database
  // const db = getDb();
  // await db.from('clients').upsert({ ...clientRecord }, { onConflict: 'financialCentsId' });

  // TODO Phase 2: Enqueue upsell offer
  // await sendUpsellOffer({ client: clientRecord, channel: 'Email' });

  return res.status(200).json({
    success: true,
    message: 'Onboarding event received and queued for processing.',
    client: clientRecord.name,
    offerStatus: 'Queued',
  });
};
