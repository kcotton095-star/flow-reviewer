/**
 * Flow Reviewer — Daily Briefing Email
 * GET /api/daily-brief
 *
 * Sends Karen a formatted HTML email every morning with:
 *   - Active subscriber count + MRR
 *   - Recent signups from the last 24 hours
 *   - Recent webhook events
 *   - Quick-access links
 *
 * Called by the Cowork scheduled task at 8:00 AM daily.
 * Secured with FLOW_REVIEWER_SHARED_SECRET header.
 */

const { getDb } = require('./_db');

const KAREN_EMAIL = 'Karencotton26@yahoo.com';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'hello@flowbookkeepingservices.com';

module.exports = async function handler(req, res) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // Optional secret check (called internally by scheduled task)
  const incomingSecret = req.headers['x-flow-reviewer-secret'] || req.query.secret;
  if (process.env.FLOW_REVIEWER_SHARED_SECRET && incomingSecret !== process.env.FLOW_REVIEWER_SHARED_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const stripe   = require('stripe')(process.env.STRIPE_SECRET_KEY);
    const { Resend } = require('resend');
    const resend   = new Resend(process.env.RESEND_API_KEY);
    const db       = getDb();

    // ── Stripe metrics ────────────────────────────────────────────────────
    let activeCount = 0;
    let newToday = [];

    const subs = await stripe.subscriptions.list({
      status: 'active',
      limit: 100,
      expand: ['data.customer'],
    });
    activeCount = subs.data.length;

    const oneDayAgo = Math.floor(Date.now() / 1000) - 86400;
    newToday = subs.data
      .filter(s => s.created >= oneDayAgo)
      .map(s => ({
        name:  s.customer?.name  || s.customer?.email || 'Unknown',
        email: s.customer?.email || '',
        date:  new Date(s.created * 1000).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
      }));

    // ── Supabase: recent events ───────────────────────────────────────────
    const { data: recentEvents } = await db
      .from('webhook_events')
      .select('event_type, email, status, created_at')
      .gte('created_at', new Date(Date.now() - 86400000).toISOString())
      .order('created_at', { ascending: false })
      .limit(20);

    const mrr = (activeCount * 19.95).toFixed(2);
    const today = new Date().toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });

    // ── Build HTML email ──────────────────────────────────────────────────
    const newTodayRows = newToday.length > 0
      ? newToday.map(s => `
          <tr>
            <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;font-weight:600;">${s.name}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${s.email}</td>
            <td style="padding:6px 10px;border-bottom:1px solid #f1f5f9;color:#64748b;">${s.date}</td>
          </tr>`).join('')
      : `<tr><td colspan="3" style="padding:12px 10px;color:#94a3b8;text-align:center;">No new subscribers in the last 24 hours</td></tr>`;

    const eventRows = (recentEvents || []).slice(0, 8).map(e => {
      const color = e.status === 'Processed' ? '#16a34a' : e.status === 'Failed' ? '#dc2626' : '#d97706';
      return `
        <tr>
          <td style="padding:5px 10px;border-bottom:1px solid #f8fafc;font-size:12px;font-family:monospace;">${e.event_type}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f8fafc;font-size:12px;color:#64748b;">${e.email || '—'}</td>
          <td style="padding:5px 10px;border-bottom:1px solid #f8fafc;font-size:12px;font-weight:700;color:${color};">${e.status}</td>
        </tr>`;
    }).join('') || `<tr><td colspan="3" style="padding:12px;color:#94a3b8;text-align:center;font-size:12px;">No events in the last 24 hours</td></tr>`;

    const html = `<!DOCTYPE html>
<html>
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;">
  <div style="max-width:600px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08);">
    <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:24px 28px;color:white;">
      <div style="font-size:17px;font-weight:700;">🌊 Flow Reviewer — Daily Brief</div>
      <div style="font-size:12px;color:#94a3b8;margin-top:2px;">${today}</div>
    </div>
    <div style="display:flex;gap:0;border-bottom:1px solid #e2e8f0;">
      <div style="flex:1;padding:20px 24px;border-right:1px solid #e2e8f0;border-top:3px solid #0d9488;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">MRR</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b;margin:6px 0 2px;">$${mrr}</div>
        <div style="font-size:12px;color:#94a3b8;">${activeCount} active × $19.95</div>
      </div>
      <div style="flex:1;padding:20px 24px;border-right:1px solid #e2e8f0;border-top:3px solid #16a34a;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Subscribers</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b;margin:6px 0 2px;">${activeCount}</div>
        <div style="font-size:12px;color:#94a3b8;">Active plans</div>
      </div>
      <div style="flex:1;padding:20px 24px;border-top:3px solid #7c3aed;">
        <div style="font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">New Today</div>
        <div style="font-size:28px;font-weight:800;color:#1e293b;margin:6px 0 2px;">${newToday.length}</div>
        <div style="font-size:12px;color:#94a3b8;">Last 24 hours</div>
      </div>
    </div>
    <div style="padding:24px 28px;">
      <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px;">🆕 New Subscribers (Last 24h)</div>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Name</th>
            <th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Email</th>
            <th style="padding:7px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Time</th>
          </tr></thead>
          <tbody>${newTodayRows}</tbody>
        </table>
      </div>
      <div style="margin-bottom:24px;">
        <div style="font-size:13px;font-weight:700;color:#1e293b;margin-bottom:12px;">⚡ Recent System Events (Last 24h)</div>
        <table style="width:100%;border-collapse:collapse;">
          <thead><tr style="background:#f8fafc;">
            <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Event</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Email</th>
            <th style="padding:6px 10px;text-align:left;font-size:11px;font-weight:700;color:#64748b;text-transform:uppercase;">Status</th>
          </tr></thead>
          <tbody>${eventRows}</tbody>
        </table>
      </div>
      <div style="background:#f8fafc;border-radius:10px;padding:16px;margin-bottom:24px;">
        <div style="font-size:12px;font-weight:700;color:#64748b;margin-bottom:10px;text-transform:uppercase;">Quick Links</div>
        <div style="display:flex;flex-wrap:wrap;gap:8px;">
          <a href="https://flow-reviewer-hh88.vercel.app/admin" style="background:#0d9488;color:white;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Admin Panel</a>
          <a href="https://dashboard.stripe.com/subscriptions" style="background:#635bff;color:white;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Stripe Subs</a>
          <a href="https://supabase.com/dashboard" style="background:#1e293b;color:white;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Supabase</a>
          <a href="https://vercel.com/kcotton095-5850s-projects/flow-reviewer-hh88" style="background:#000;color:white;padding:7px 14px;border-radius:6px;font-size:12px;font-weight:600;text-decoration:none;">Vercel</a>
        </div>
      </div>
    </div>
    <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
      Flow Bookkeeping Services · Automated daily brief · Sent at 8:00 AM
    </div>
  </div>
</body>
</html>`;

    // ── Send via Resend ───────────────────────────────────────────────────
    const { data, error } = await resend.emails.send({
      from: `Flow Reviewer <${FROM_EMAIL}>`,
      to:   [KAREN_EMAIL],
      subject: `☀️ Daily Brief — ${activeCount} subscribers · $${mrr} MRR · ${newToday.length} new today`,
      html,
    });

    if (error) {
      console.error('[daily-brief] Resend error:', error);
      return res.status(500).json({ error: 'Email send failed', detail: error });
    }

    console.log(`[daily-brief] Sent to ${KAREN_EMAIL}. subs=${activeCount}, mrr=${mrr}, newToday=${newToday.length}`);
    return res.status(200).json({
      sent: true,
      to: KAREN_EMAIL,
      activeSubscribers: activeCount,
      mrr: parseFloat(mrr),
      newToday: newToday.length,
      emailId: data?.id,
    });

  } catch (err) {
    console.error('[daily-brief] Fatal error:', err.message);
    return res.status(500).json({ error: 'Daily brief failed', detail: err.message });
  }
};
