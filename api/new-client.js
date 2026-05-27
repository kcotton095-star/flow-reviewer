/**
 * /api/new-client
 *
 * Zapier webhook endpoint — triggered when a new client is onboarded
 * in Financial Cents (or Google Sheets / HubSpot / Dubsado).
 *
 * Zapier setup (5-step Zap):
 *   Step 1 — Trigger: Google Sheets "New Row" in Active Clients sheet
 *             OR Financial Cents / HubSpot new contact tagged "onboarded"
 *   Step 2 — Delay: 2–4 hours (Delay by Zapier)
 *   Step 3 — Action: Webhooks by Zapier → POST to this endpoint
 *   Step 4 — Action: Tag client record "Upsell Email Sent" in source CRM
 *   Step 5 — (optional) 7-day follow-up if link not clicked
 *
 * POST body (JSON):
 * {
 *   "firstName":   "Jane",
 *   "email":       "jane@example.com",
 *   "companyName": "Jane's Café"      // optional
 * }
 *
 * Auth: x-flow-secret header OR ?secret= query param
 *   Must match FLOW_REVIEWER_SHARED_SECRET env var
 *
 * Responses:
 *   200 { ok: true,  messageId }
 *   400 { ok: false, error: "missing fields" }
 *   401 { ok: false, error: "unauthorized" }
 *   409 { ok: false, error: "already sent" }   (if Supabase tag present)
 *   500 { ok: false, error: "..." }
 */

const { sendUpsellOffer }     = require('./_send-upsell-offer');
const { createClient }        = require('@supabase/supabase-js');

const SHARED_SECRET = process.env.FLOW_REVIEWER_SHARED_SECRET;
const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;

module.exports = async function handler(req, res) {
  // ── CORS pre-flight ──────────────────────────────────────────────────────────
  res.setHeader('Access-Control-Allow-Origin',  '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-flow-secret');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // ── Auth check ───────────────────────────────────────────────────────────────
  const incomingSecret =
    req.headers['x-flow-secret'] ||
    req.query.secret             ||
    '';

  if (SHARED_SECRET && incomingSecret !== SHARED_SECRET) {
    console.warn('[new-client] Unauthorized attempt from', req.headers['x-forwarded-for']);
    return res.status(401).json({ ok: false, error: 'unauthorized' });
  }

  // ── Parse body ───────────────────────────────────────────────────────────────
  let body = req.body || {};
  // Zapier sometimes sends application/x-www-form-urlencoded
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (_) {}
  }

  const { firstName, email, companyName = '' } = body;

  if (!firstName || !email) {
    return res.status(400).json({
      ok: false,
      error: 'Missing required fields: firstName, email',
    });
  }

  // Basic email sanity check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address' });
  }

  // ── Duplicate check via Supabase ─────────────────────────────────────────────
  // Prevents re-sending if Zapier fires the webhook twice for the same client.
  if (SUPABASE_URL && SUPABASE_KEY) {
    try {
      const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
      const { data: existing } = await sb
        .from('clients')
        .select('id, upsell_email_sent_at')
        .eq('email', email.toLowerCase())
        .maybeSingle();

      if (existing?.upsell_email_sent_at) {
        console.log(`[new-client] Already sent to ${email} at ${existing.upsell_email_sent_at}`);
        return res.status(409).json({
          ok: false,
          error: 'Upsell email already sent to this address',
          sentAt: existing.upsell_email_sent_at,
        });
      }
    } catch (dbErr) {
      // Non-fatal — log and continue sending
      console.error('[new-client] Supabase check failed:', dbErr.message);
    }
  }

  // ── Send the upsell email ────────────────────────────────────────────────────
  try {
    const result = await sendUpsellOffer({
      client: { firstName, email, companyName },
    });

    // ── Record the send in Supabase ────────────────────────────────────────────
    if (SUPABASE_URL && SUPABASE_KEY) {
      try {
        const sb = createClient(SUPABASE_URL, SUPABASE_KEY);
        await sb.from('clients').upsert(
          {
            email:                  email.toLowerCase(),
            name:                   firstName,
            company_name:           companyName,
            upsell_email_sent_at:   new Date().toISOString(),
            upsell_email_source:    'zapier_new_client_webhook',
          },
          { onConflict: 'email' }
        );
      } catch (dbWriteErr) {
        console.error('[new-client] Supabase write failed:', dbWriteErr.message);
      }
    }

    console.log(`[new-client] Upsell email queued for ${email} — Resend id: ${result?.id}`);
    return res.status(200).json({
      ok:        true,
      messageId: result?.id,
      sentTo:    email,
    });

  } catch (err) {
    console.error('[new-client] Send error:', err.message);
    return res.status(500).json({ ok: false, error: err.message });
  }
};
