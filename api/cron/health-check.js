// api/cron/health-check.js
// Vercel Cron — runs daily at 8 AM ET
// Invokes the full health check with alert email on failure
// Required env var: CRON_SECRET (set in Vercel project settings)

export const config = { runtime: 'edge' };

export default async function handler(req) {
  // Vercel cron authenticates with CRON_SECRET in Authorization header
  const secret = process.env.CRON_SECRET;
  if (!secret) {
    return new Response(JSON.stringify({ error: 'CRON_SECRET not configured' }), {
            status: 500,
            headers: { 'Content-Type': 'application/json' },
      });
  }

  const baseUrl = process.env.VERCEL_URL
    ? `https://${process.env.VERCEL_URL}`
    : 'https://flow-reviewer-hh88.vercel.app';

  try {
    const res = await fetch(`${baseUrl}/api/health-check?alert=true`, {
            method:  'GET',
                    headers: { 'Authorization': `Bearer ${secret}` },
    });

    const data = await res.json();

    // Optionally post to Slack incoming webhook if configured
    const slackWebhook = process.env.SLACK_ALERT_WEBHOOK_URL;
    if (slackWebhook && data.status !== 'healthy') {
      const failNames = (data.failures || []).map(f => f.name).join(', ');
      await fetch(slackWebhook, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          text: `FBS Health Check Failed — ${data.failures} check(s) down: ${failNames}\nReview: https://vercel.com/dashboard`,
}),
});
}

    return new Response(JSON.stringify(data), {
            status:  res.status,
            headers: { 'Content-Type': 'application/json' },
      });
  } catch (e) {
    return new Response(JSON.stringify({ error: e.message }), {
            status:  500,
            headers: { 'Content-Type': 'application/json' },
      });
  }
}
