/**
 * /api/health-check
 *
 * System health check endpoint.
 * Called daily by api/cron/health-check.js and external monitors.
 *
 * GET /api/health-check           → { status, checks, failures, timestamp }
 * GET /api/health-check?alert=true → same, requires Bearer CRON_SECRET
 */

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
const RESEND_KEY   = process.env.RESEND_API_KEY;
const STRIPE_KEY   = process.env.STRIPE_SECRET_KEY;
const CRON_SECRET  = process.env.CRON_SECRET;

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

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const alertMode = req.query.alert === 'true';

  // Require auth for alert mode
  if (alertMode && CRON_SECRET) {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.replace('Bearer ', '').trim();
    if (token !== CRON_SECRET) {
      return res.status(401).json({ error: 'Unauthorized' });
    }
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

  return res.status(200).json({
    status,
    checks,
    failures,
    timestamp: new Date().toISOString(),
  });
};
