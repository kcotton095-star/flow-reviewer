/**
 * /api/lead-intake
 *
 * POST handler for new lead submissions from the website contact / diagnostic form.
 * 1. Validates required fields (name, email)
 * 2. Inserts into Supabase `leads` table
 * 3. Sends notification email to Karen
 * 4. Sends confirmation email to the lead
 *
 * Returns: 201 { ok: true, id: <uuid> }
 */

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');

const KAREN_EMAIL = 'Karencotton26@yahoo.com';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'hello@flowbookkeepingservices.com';

/* ─────────────────────── helper: Karen notification ─────────────────────── */
function karenNotificationHtml({ name, email, phone, trade, message, leadId }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#1a5c3a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;font-size:18px">📋 New Lead — Flow Bookkeeping Services</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:20px;border-radius:0 0 8px 8px">
    <table style="width:100%;border-collapse:collapse">
      <tr><td style="padding:8px 0;color:#6b7280;width:120px">Name</td><td style="padding:8px 0;font-weight:bold">${name}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Email</td><td style="padding:8px 0"><a href="mailto:${email}" style="color:#1a5c3a">${email}</a></td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Phone</td><td style="padding:8px 0">${phone || '—'}</td></tr>
      <tr><td style="padding:8px 0;color:#6b7280">Trade</td><td style="padding:8px 0">${trade || '—'}</td></tr>
      ${message ? `<tr><td style="padding:8px 0;color:#6b7280;vertical-align:top">Message</td><td style="padding:8px 0">${message}</td></tr>` : ''}
      ${leadId ? `<tr><td style="padding:8px 0;color:#6b7280">Lead ID</td><td style="padding:8px 0;font-family:monospace;font-size:12px">${leadId}</td></tr>` : ''}
    </table>
    <div style="margin-top:16px;padding:12px;background:#f0fdf4;border-radius:6px;font-size:14px;color:#166534">
      Reply directly to this email to respond to ${name.split(' ')[0]}.
    </div>
  </div>
</body>
</html>`;
}

/* ──────────────────────── helper: lead confirmation ─────────────────────── */
function leadConfirmationHtml({ firstName }) {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;color:#1a1a1a;max-width:600px;margin:0 auto;padding:20px">
  <div style="background:#1a5c3a;color:#fff;padding:16px 20px;border-radius:8px 8px 0 0">
    <h2 style="margin:0;font-size:18px">Thanks for reaching out, ${firstName}! 👋</h2>
  </div>
  <div style="border:1px solid #e5e7eb;border-top:none;padding:24px;border-radius:0 0 8px 8px">
    <p>We received your message and will be in touch within <strong>1 business day</strong>.</p>
    <p>In the meantime, if you have any urgent questions feel free to reply directly to this email.</p>
    <p style="margin-top:24px">Looking forward to connecting,<br>
    <strong>Karen Cotton</strong><br>
    Flow Bookkeeping Services<br>
    <a href="https://flowbookkeepingservices.com" style="color:#1a5c3a">flowbookkeepingservices.com</a></p>
  </div>
</body>
</html>`;
}

/* ─────────────────────────────── handler ────────────────────────────────── */
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ ok: false, error: 'Method not allowed' });
  }

  // Parse body (Vercel auto-parses JSON, but guard against raw string just in case)
  const body =
    typeof req.body === 'string'
      ? JSON.parse(req.body)
      : req.body || {};

  const {
    name,
    email,
    phone   = '',
    trade   = '',
    message = '',
    source  = 'website',
  } = body;

  // Validate required fields
  if (!name || !email) {
    return res.status(400).json({ ok: false, error: 'name and email are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return res.status(400).json({ ok: false, error: 'Invalid email address' });
  }

  /* 1 ── Supabase insert ─────────────────────────────────────────────────── */
  let leadId = null;

  if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) {
    try {
      const db = createClient(
        process.env.SUPABASE_URL,
        process.env.SUPABASE_SERVICE_KEY,
        { auth: { persistSession: false } }
      );
      const { data, error } = await db
        .from('leads')
        .insert({
          name,
          email:      email.toLowerCase(),
          phone,
          trade_type: trade,
          message,
          source,
          status:     'New',
          created_at: new Date().toISOString(),
        })
        .select('id')
        .single();

      if (error) throw error;
      leadId = data?.id;
    } catch (err) {
      console.error('[lead-intake] Supabase error:', err.message);
      // Non-fatal — continue to send emails even if DB insert fails
    }
  } else {
    console.warn('[lead-intake] Supabase env vars not set — skipping DB insert');
  }

  /* 2 ── Send emails via Resend ──────────────────────────────────────────── */
  if (process.env.RESEND_API_KEY) {
    try {
      const resend    = new Resend(process.env.RESEND_API_KEY);
      const firstName = name.split(' ')[0];
      const tradeLine = trade ? ` (${trade})` : '';

      await Promise.all([
        // Notification to Karen
        resend.emails.send({
          from:     `Flow Bookkeeping Services <${FROM_EMAIL}>`,
          to:       [KAREN_EMAIL],
          reply_to: email,
          subject:  `📋 New Lead: ${name}${tradeLine}`,
          html:     karenNotificationHtml({ name, email, phone, trade, message, leadId }),
        }),
        // Confirmation to lead
        resend.emails.send({
          from:    `Flow Bookkeeping Services <${FROM_EMAIL}>`,
          to:      [email],
          subject: `Thanks for reaching out, ${firstName}! 👋`,
          html:    leadConfirmationHtml({ firstName }),
        }),
      ]);
    } catch (emailErr) {
      console.error('[lead-intake] Email error:', emailErr.message);
      // Non-fatal — lead is already in DB
    }
  } else {
    console.warn('[lead-intake] RESEND_API_KEY not set — skipping emails');
  }

  return res.status(201).json({ ok: true, id: leadId });
};
