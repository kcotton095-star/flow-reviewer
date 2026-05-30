/**
 * Flow Reviewer — Onboarding Trigger Endpoint
 * POST /api/onboarding-trigger
 *
 * Called by Zapier when a client completes onboarding in Financial Cents.
 * Validates the shared secret, upserts the client record, and sends
 * the upsell offer email via Resend.
 *
 * Expected payload:
 * {
 *   "client_name": "Acme Plumbing",
 *   "client_email": "owner@acmeplumbing.com",
 *   "client_phone": "+1-555-111-2222",
 *   "onboarding_completed_at": "2026-05-24T13:00:00Z",
 *   "financial_cents_client_id": "fc_12345",
 *   "service_type": "Bookkeeping",
 *   "event_type": "onboarding_completed"
 * }
 */

const { getDb, logWebhookEvent } = require('./_db');
const { sendUpsellOffer }        = require('./_send-upsell-offer');

const KAREN_EMAIL  = 'Karencotton26@yahoo.com';
const FROM_EMAIL   = process.env.FROM_EMAIL || 'hello@flowbookkeepingservices.com';
const MONTHLY_AMOUNT = 19.95;

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Shared secret validation ──────────────────────────────────────────────
  const incomingSecret =
    req.headers['x-flow-reviewer-secret'] ||
    req.headers['x-shared-secret']         ||
    req.body?.shared_secret;

  const expectedSecret = process.env.FLOW_REVIEWER_SHARED_SECRET;

  if (!expectedSecret) {
    console.error('[onboarding-trigger] FLOW_REVIEWER_SHARED_SECRET env var is not set.');
    return res.status(500).json({ error: 'Server misconfiguration: missing secret env var' });
  }

  if (!incomingSecret || incomingSecret !== expectedSecret) {
    console.warn('[onboarding-trigger] Unauthorized: secret mismatch');
    return res.status(401).json({ error: 'Unauthorized' });
  }

  // ── Payload validation ────────────────────────────────────────────────────
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
    return res.status(400).json({ error: `Unknown event_type: ${event_type}` });
  }

  // ── Build slug ────────────────────────────────────────────────────────────
  const slug = client_name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

  // ── Upsert client record ──────────────────────────────────────────────────
  const db = getDb();

  const clientRecord = {
    name:                    client_name,
    email:                   client_email,
    phone:                   client_phone || null,
    sector:                  service_type || 'Service business',
    onboarding_status:       'Completed',
    onboarding_completed_at: onboarding_completed_at || new Date().toISOString(),
    financial_cents_id:      financial_cents_client_id || null,
    offer_eligible:          true,
    offer_status:            'Queued',
    subscription_status:     'Not Subscribed',
    monthly_amount:          MONTHLY_AMOUNT,
    review_link_url:         `/review/${slug}`,
    business_name:           client_name,
    business_slug:           slug,
    business_tone:           'Helpful',
    private_feedback_email:  client_email,
  };

  const { data: upserted, error: upsertError } = await db
    .from('clients')
    .upsert(clientRecord, { onConflict: 'email' })
    .select()
    .single();

  if (upsertError) {
    console.error('[onboarding-trigger] DB upsert failed:', upsertError.message);
    await logWebhookEvent(db, 'financial_cents.onboarding_completed', client_email,
      'Failed', `DB upsert error: ${upsertError.message}`, body);
    return res.status(500).json({ error: 'Database error', detail: upsertError.message, code: upsertError.code, hint: upsertError.hint });
  }

  console.log('[onboarding-trigger] Client upserted:', { name: client_name, email: client_email });

  await logWebhookEvent(db, 'financial_cents.onboarding_completed', client_email,
    'Processed', 'Client upserted, offer queued', body);

  // ── Send upsell offer email to client ─────────────────────────────────────
  let offerStatus = 'Queued';
  try {
    await sendUpsellOffer({ client: upserted });
    await db
      .from('clients')
      .update({
        offer_status:    'Sent',
        offer_sent_at:   new Date().toISOString(),
        offer_channel:   'Email',
      })
      .eq('email', client_email);
    offerStatus = 'Sent';
  } catch (emailErr) {
    console.error('[onboarding-trigger] Failed to send upsell offer:', emailErr.message);
    await logWebhookEvent(db, 'financial_cents.offer_email', client_email,
      'Failed', emailErr.message, {});
  }

  // ── Alert Karen that a new client completed onboarding ────────────────────
  try {
    const { Resend } = require('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
    await resend.emails.send({
      from:    `Flow Reviewer <${FROM_EMAIL}>`,
      to:      [KAREN_EMAIL],
      subject: `📋 New onboarding: ${client_name} — offer email sent`,
      html:    `
        <div style="font-family:sans-serif;max-width:480px;margin:16px auto;padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
          <h2 style="color:#0d9488;margin-top:0;">📋 New Client Onboarded</h2>
          <p><strong>Name:</strong> ${client_name}<br>
          <strong>Email:</strong> ${client_email}<br>
          <strong>Service:</strong> ${service_type || 'Bookkeeping'}<br>
          <strong>FC ID:</strong> ${financial_cents_client_id || '—'}</p>
          <p style="color:#64748b;font-size:13px;">
            Offer status: <strong>${offerStatus}</strong><br>
            Monthly amount: <strong>$${MONTHLY_AMOUNT}/month</strong><br>
            Review link: <code>/review/${slug}</code>
          </p>
          <a href="https://flow-reviewer-hh88.vercel.app/admin" style="background:#0d9488;color:white;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;display:inline-block;margin-top:8px;">View in Admin</a>
        </div>`,
    });
  } catch (karenEmailErr) {
    console.error('[onboarding-trigger] Failed to alert Karen:', karenEmailErr.message);
  }

  return res.status(200).json({
    success: true,
    message: 'Onboarding event processed.',
    client:  client_name,
    offerStatus,
  });
};
