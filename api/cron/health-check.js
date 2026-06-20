// api/cron/health-check.js
// Vercel Cron — runs daily at 8 AM ET
// Also serves as /api/health-check (see vercel.json routes)
// GET ?alert=true + Authorization: Bearer <CRON_SECRET> for alert mode

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL  = process.env.SUPABASE_URL;
const SUPABASE_KEY  = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY    = process.env.RESEND_API_KEY;
const STRIPE_KEY    = process.env.STRIPE_SECRET_KEY;
const CRON_SECRET   = process.env.CRON_SECRET;
const SLACK_WEBHOOK = process.env.SLACK_ALERT_WEBHOOK_URL;

async function checkSupabase() {
  try {
    if (!SUPABASE_URL || !SUPABASE_KEY) throw new Error('Supabase env vars not set');
    const db = createClient(SUPABASE_URL, SUPABASE_KEY, { auth: { persistSession: false } });
    const { error } = await db.from('leads').select('id').limit(1);
    if (error) throw new Error(error.message);
    return { name: 'supabase', status: 'ok' };
  } catch (e) {
    return { name: 'supabase', status: 'fail', error: e.message };
  }
}

async function checkResend() {
  try {
    if (!RESEND_KEY) throw new Error('RESEND_API_KEY not set');
    const res = await fetch('https://api.resend.com/domains', {
      headers: { Authorization: `Bearer ${RESEND_KEY}` },
    });
    if (!res.ok) throw new Error(`Resend API returned ${res.status}`);
    return { name: 'resend', status: 'ok' };
  } catch (e) {
    return { name: 'resend', status: 'fail', error: e.message };
  }
}

async function checkStripe() {
  try {
    if (!STRIPE_KEY) throw new Error('STRIPE_SECRET_KEY not set');
    const res = await fetch('https://api.stripe.com/v1/balance', {
      headers: { Authorization: `Bearer ${STRIPE_KEY}` },
    });
    if (!res.ok) throw new Error(`Stripe API returned ${res.status}`);
    return { name: 'stripe', status: 'ok' };
  } catch (e) {
    return { name: 'stripe', status: 'fail', error: e.message };
  }
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const alertMode = req.query.alert === 'true';
  if (alertMode && CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (token !== CRON_SECRET) return res.status(401).json({ error: 'Unauthorized' });
  }

  const [supabaseCheck, resendCheck, stripeCheck] = await Promise.all([
    checkSupabase(),
    checkResend(),
    checkStripe(),
  ]);

  const checks   = [supabaseCheck, resendCheck, stripeCheck];
  const failures = checks.filter(c => c.status !== 'ok');
  const status   = failures.length === 0 ? 'healthy' : 'degraded';

  console.log(`[health-check] status=${status} failures=${failures.length}`);

  if (alertMode && failures.length > 0 && SLACK_WEBHOOK) {
    try {
      const failNames = failures.map(f => f.name).join(', ');
      await fetch(SLACK_WEBHOOK, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: `FBS Health Check Failed — ${failures.length} check(s) down: ${failNames}`,
        }),
      });
    } catch (e) {
      console.error('[health-check] Slack alert error:', e.message);
    }
  }

  return res.status(200).json({ status, checks, failures, timestamp: new Date().toISOString() });
};
