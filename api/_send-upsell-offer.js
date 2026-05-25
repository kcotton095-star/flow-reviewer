/**
 * Flow Reviewer — Upsell Offer Email
 *
 * Sends a branded email to a newly-onboarded client via Resend.
 * Called from onboarding-trigger.js after the DB upsert.
 *
 * Required env var:
 *   RESEND_API_KEY   — get from resend.com/api-keys
 *
 * Optional env vars (fall back to defaults):
 *   FROM_EMAIL       — e.g. "Flow Bookkeeping <karen@flowbookkeeping.com>"
 *   SITE_URL         — e.g. "https://flow-reviewer-hh88.vercel.app"
 *   STRIPE_PAYMENT_LINK — your Stripe Payment Link URL for $49/month
 *
 * Usage:
 *   const { sendUpsellOffer } = require('./_send-upsell-offer');
 *   await sendUpsellOffer({ client });   // client is the DB row
 */

const { Resend } = require('resend');

async function sendUpsellOffer({ client }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('RESEND_API_KEY env var is not set');

  const resend       = new Resend(apiKey);
  const from         = process.env.FROM_EMAIL        || 'Flow Bookkeeping Services <noreply@flowbookkeeping.com>';
  const siteUrl      = process.env.SITE_URL          || 'https://flow-reviewer-hh88.vercel.app';
  const paymentLink  = process.env.STRIPE_PAYMENT_LINK || `${siteUrl}/subscribe`;

  const reviewUrl    = `${siteUrl}${client.review_link_url || '/review/' + client.business_slug}`;
  const firstName    = (client.name || 'there').split(' ')[0];

  const html = buildEmailHtml({ client, firstName, reviewUrl, paymentLink });
  const text = buildEmailText({ client, firstName, reviewUrl, paymentLink });

  const { data, error } = await resend.emails.send({
    from,
    to:      client.email,
    subject: `Your free review link is ready, ${firstName} 🎉`,
    html,
    text,
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  console.log(`[send-upsell-offer] Email sent to ${client.email} — id: ${data?.id}`);
  return data;
}

// ── HTML email template ───────────────────────────────────────────────────────
function buildEmailHtml({ client, firstName, reviewUrl, paymentLink }) {
  return `<!DOCTYPE html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
         background: #f5f5f5; margin: 0; padding: 0; }
  .wrapper { max-width: 560px; margin: 40px auto; background: #fff;
             border-radius: 12px; overflow: hidden;
             box-shadow: 0 2px 12px rgba(0,0,0,0.08); }
  .header  { background: #1a1a2e; padding: 32px 40px; text-align: center; }
  .header h1 { color: #fff; margin: 0; font-size: 22px; font-weight: 700; }
  .header p  { color: #a0a8c0; margin: 6px 0 0; font-size: 14px; }
  .body    { padding: 36px 40px; }
  .body p  { color: #333; line-height: 1.65; margin: 0 0 16px; font-size: 15px; }
  .review-box { background: #f0f4ff; border: 2px solid #4f46e5; border-radius: 10px;
                padding: 20px 24px; margin: 24px 0; text-align: center; }
  .review-box p { margin: 0 0 12px; color: #4338ca; font-weight: 600; font-size: 15px; }
  .review-url { font-family: monospace; font-size: 13px; color: #555;
                word-break: break-all; margin: 0 0 16px; }
  .btn { display: inline-block; background: #4f46e5; color: #fff; text-decoration: none;
         padding: 12px 28px; border-radius: 8px; font-weight: 600; font-size: 15px;
         margin-top: 4px; }
  .upgrade { background: #fff7ed; border: 1px solid #fbbf24; border-radius: 10px;
             padding: 20px 24px; margin: 24px 0; }
  .upgrade p { margin: 0 0 8px; color: #92400e; font-size: 14px; }
  .upgrade strong { font-size: 18px; color: #1a1a2e; }
  .upgrade-btn { display: inline-block; background: #f59e0b; color: #fff;
                 text-decoration: none; padding: 11px 26px; border-radius: 8px;
                 font-weight: 600; font-size: 14px; margin-top: 12px; }
  .footer { background: #f9f9f9; padding: 20px 40px; text-align: center; }
  .footer p { color: #999; font-size: 12px; margin: 0; }
</style>
</head>
<body>
<div class="wrapper">
  <div class="header">
    <h1>Flow Bookkeeping Services</h1>
    <p>Your review system is ready</p>
  </div>
  <div class="body">
    <p>Hi ${firstName},</p>
    <p>Welcome aboard! Your onboarding is complete and I've set up a personalised
       Google review link for <strong>${client.business_name || client.name}</strong>.
       Start sending it to happy clients today — completely free.</p>

    <div class="review-box">
      <p>Your free review link</p>
      <p class="review-url">${reviewUrl}</p>
      <a href="${reviewUrl}" class="btn">Preview your review page</a>
    </div>

    <p>The page greets your clients by name, guides them toward leaving a
       5-star Google review, and quietly captures any negative feedback
       before it goes public.</p>

    <div class="upgrade">
      <p>Want the full system — automated follow-ups, review monitoring,
         and monthly reporting?</p>
      <strong>Flow Reviewer — $49/month</strong>
      <br>
      <a href="${paymentLink}" class="upgrade-btn">Activate for $49/month →</a>
    </div>

    <p>Questions? Just reply to this email.</p>
    <p>— Karen<br><span style="color:#999;font-size:13px;">Flow Bookkeeping Services</span></p>
  </div>
  <div class="footer">
    <p>Flow Bookkeeping Services &bull; You're receiving this because you recently onboarded.</p>
  </div>
</div>
</body>
</html>`;
}

// ── Plain-text fallback ───────────────────────────────────────────────────────
function buildEmailText({ client, firstName, reviewUrl, paymentLink }) {
  return `Hi ${firstName},

Welcome aboard! Your onboarding is complete and I've set up a free personalised
Google review link for ${client.business_name || client.name}.

Your review link:
${reviewUrl}

The page guides happy clients to leave a 5-star Google review and captures
negative feedback privately before it goes public.

──────────────────────────────────────
Want automated follow-ups, review monitoring, and monthly reporting?

Flow Reviewer — $49/month
${paymentLink}
──────────────────────────────────────

Questions? Just reply to this email.

— Karen
Flow Bookkeeping Services
`;
}

module.exports = { sendUpsellOffer };
