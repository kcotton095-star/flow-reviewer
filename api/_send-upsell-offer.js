/**
 * _send-upsell-offer.js
 * Post-onboarding upsell email for Flow Bookkeeping Services clients.
 *
 * Introduces both optional add-on apps to newly onboarded clients:
 *   • Flow Receipt Capture  — $19.95/mo  (prod_receipt_cap)
 *   • Flow Reviewer         — $19.95/mo  (prod_flow_reviewer)
 *
 * Both are billed COMPLETELY SEPARATELY from the bookkeeping retainer.
 * Never mix these revenue streams.
 *
 * Called by:
 *   - /api/new-client  (Zapier webhook, 2-4hr delay after onboarding)
 *   - /api/onboarding-trigger (direct call after DB upsert)
 *
 * Required env vars:
 *   RESEND_API_KEY        — resend.com API key
 *   FROM_EMAIL            — "Flow Bookkeeping Services <hello@flowbookkeepingservices.com>"
 *   SITE_URL              — "https://flow-reviewer-hh88.vercel.app"
 */

const { Resend } = require('resend');

const SITE_URL       = process.env.SITE_URL  || 'https://flow-reviewer-hh88.vercel.app';
const FROM_EMAIL     = process.env.FROM_EMAIL || 'Flow Bookkeeping Services <hello@flowbookkeepingservices.com>';
const SUBSCRIBE_PAGE = `${SITE_URL}/subscribe`;

/**
 * sendUpsellOffer({ client })
 *
 * @param {Object}  client
 * @param {string}  client.email        — recipient email (required)
 * @param {string}  client.name         — full name  (firstName extracted)
 * @param {string}  [client.firstName]  — override first name
 * @param {string}  [client.companyName]
 */
async function sendUpsellOffer({ client }) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey)      throw new Error('RESEND_API_KEY env var is not set');
  if (!client.email) throw new Error('client.email is required');

  const resend = new Resend(apiKey);

  const firstName   = client.firstName || (client.name || 'there').split(' ')[0];
  const companyName = client.companyName || client.business_name || '';

  // Subscribe page URL with email + name pre-filled for personalised checkout
  const subscribeUrl = `${SUBSCRIBE_PAGE}?email=${encodeURIComponent(client.email)}&name=${encodeURIComponent(firstName)}`;

  const subject = `Welcome to Flow, ${firstName} — two tools that make bookkeeping effortless`;

  const { data, error } = await resend.emails.send({
    from:    FROM_EMAIL,
    to:      client.email,
    subject,
    html:    buildEmailHtml({ firstName, companyName, subscribeUrl }),
    text:    buildEmailText({ firstName, companyName, subscribeUrl }),
    tags: [
      { name: 'category', value: 'upsell_offer' },
      { name: 'client',   value: client.email.replace(/[^a-z0-9_-]/gi, '_') },
    ],
  });

  if (error) throw new Error(`Resend error: ${error.message}`);

  console.log(`[send-upsell-offer] Sent to ${client.email} — id: ${data?.id}`);
  return data;
}

// ── HTML email template ────────────────────────────────────────────────────────────────────────────
function buildEmailHtml({ firstName, companyName, subscribeUrl }) {
  const companyLine = companyName ? ` at ${companyName}` : '';
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Welcome to Flow</title>
<style>
  body{margin:0;padding:0;background:#f4f6f9;font-family:'DM Sans',Helvetica,Arial,sans-serif;color:#1a1f2e;-webkit-font-smoothing:antialiased}
  .wrap{max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.09)}
  .hdr{background:#015f6b;padding:28px 36px;display:flex;align-items:center;gap:14px}
  .hdr-icon{width:42px;height:42px;min-width:42px;background:rgba(255,255,255,.15);border-radius:10px;display:flex;align-items:center;justify-content:center}
  .hdr-name{color:#ffffff;font-size:16px;font-weight:700;letter-spacing:-.01em}
  .hdr-sub{color:rgba(255,255,255,.7);font-size:12px;margin-top:2px}
  .body{padding:36px}
  p{font-size:15px;color:#5a6278;line-height:1.7;margin:0 0 16px}
  .greet{font-size:21px;font-weight:800;color:#1a1f2e;margin-bottom:14px;letter-spacing:-.02em}
  hr{border:none;border-top:1px solid #d0d6e4;margin:24px 0}
  .lbl{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.07em;color:#015f6b;margin-bottom:14px}
  .acard{border:1.5px solid #d0d6e4;border-radius:10px;padding:20px 22px;margin-bottom:14px}
  .acard-name{font-size:16px;font-weight:800;color:#1a1f2e;margin-bottom:3px}
  .acard-price{font-size:12px;color:#9aa0b4;font-weight:500;margin-bottom:12px}
  ul.feats{margin:0;padding:0;list-style:none;display:flex;flex-direction:column;gap:6px}
  ul.feats li{font-size:13.5px;color:#5a6278;padding-left:20px;position:relative}
  ul.feats li::before{content:'\u2713';position:absolute;left:0;color:#2d7a3a;font-weight:700;font-size:12px;top:1px}
  .cta-wrap{text-align:center;padding:20px 0 8px}
  .cta{display:inline-block;background:#015f6b;color:#ffffff !important;text-decoration:none;font-size:15px;font-weight:700;padding:15px 40px;border-radius:8px;letter-spacing:-.01em}
  .note{font-size:12.5px;color:#9aa0b4;text-align:center;line-height:1.6;padding:0 8px}
  .sig{font-size:14px;color:#5a6278;line-height:1.75}
  .sig strong{color:#1a1f2e}
  .foot{background:#f4f6f9;border-top:1px solid #d0d6e4;padding:16px 36px;text-align:center;font-size:11.5px;color:#9aa0b4;line-height:1.7}
  .foot a{color:#015f6b;text-decoration:none}
  @media(max-width:600px){.wrap{margin:0;border-radius:0}.body,.foot{padding:24px 20px}.hdr{padding:20px}}
</style>
</head>
<body>
<div class="wrap">
  <div class="hdr">
    <div class="hdr-icon">
      <svg width="22" height="22" viewBox="0 0 32 32" fill="none">
        <path d="M8 10h10a6 6 0 0 1 0 12H8" stroke="white" stroke-width="2.5" stroke-linecap="round"/>
        <path d="M8 16h8" stroke="white" stroke-width="2.5" stroke-linecap="round" opacity="0.5"/>
      </svg>
    </div>
    <div>
      <div class="hdr-name">Flow Bookkeeping Services</div>
      <div class="hdr-sub">Charleston, SC</div>
    </div>
  </div>

  <div class="body">
    <div class="greet">Hi ${firstName}, welcome to Flow! \u{1F44B}</div>

    <p>We're so glad to have you on board${companyLine}. Your bookkeeping is in good hands — we're already getting your account organized.</p>

    <p>As a Flow client, you have access to two tools that take the hassle completely out of your monthly bookkeeping. These are <strong>optional add-ons</strong> — each available separately for <strong>$19.95/month</strong> on autopay, billed completely separately from your bookkeeping service.</p>

    <hr>
    <div class="lbl">Available Add-On Apps</div>

    <div class="acard">
      <div class="acard-name">\u{1F4F8}&nbsp; Flow Receipt Capture</div>
      <div class="acard-price">$19.95/month — billed separately &middot; autopay &middot; cancel anytime</div>
      <ul class="feats">
        <li>Snap a photo of any receipt from your phone</li>
        <li>AI reads, categorizes, and names it instantly</li>
        <li>Automatically uploads to your Dropbox bookkeeping folder</li>
        <li>Duplicate detection, spending alerts &amp; monthly insights</li>
        <li>No more collecting, scanning, or emailing receipts to us</li>
      </ul>
    </div>

    <div class="acard">
      <div class="acard-name">\u{1F50D}&nbsp; Flow Reviewer</div>
      <div class="acard-price">$19.95/month — billed separately &middot; autopay &middot; cancel anytime</div>
      <ul class="feats">
        <li>Review and approve your monthly bookkeeping entries</li>
        <li>Flag items or leave notes directly for your bookkeeper</li>
        <li>See spending summaries, trends, and category breakdowns</li>
        <li>Approve reports right from your phone</li>
        <li>Direct communication channel with the Flow team</li>
      </ul>
    </div>

    <hr>
    <p>You can subscribe to one or both — they work independently and are billed as separate subscriptions. Click below to choose your plan:</p>

    <div class="cta-wrap">
      <a href="${subscribeUrl}" class="cta">Set Up My Apps →</a>
    </div>

    <p class="note">Both apps are month-to-month with no contracts. Cancel anytime. Subscribing to an app does <strong>not</strong> affect your Flow Bookkeeping Services billing — they are completely separate charges on your card.</p>

    <hr>
    <p>Questions? Just reply to this email or book a quick call. We're here to make your bookkeeping as smooth as possible.</p>

    <p class="sig">Talk soon,<br><strong>Karen Cotton</strong><br>Flow Bookkeeping Services &middot; Charleston, SC</p>
  </div>

  <div class="foot">
    Flow Bookkeeping Services &middot; Charleston, SC &middot; <a href="mailto:hello@flowbookkeepingservices.com">hello@flowbookkeepingservices.com</a><br>
    You're receiving this because you're a new Flow Bookkeeping Services client.
  </div>
</div>
</body>
</html>`;
}

// ── Plain-text fallback ───────────────────────────────────────────────────────────────────────────────
function buildEmailText({ firstName, companyName, subscribeUrl }) {
  const companyLine = companyName ? ` at ${companyName}` : '';
  return `Hi ${firstName}, welcome to Flow! \u{1F44B}

We're so glad to have you on board${companyLine}. Your bookkeeping is in good hands.

As a Flow client, you have access to two optional add-on tools — each $19.95/month
on autopay, billed completely separately from your bookkeeping service.

────────────────────────────────────────
\u{1F4F8} FLOW RECEIPT CAPTURE — $19.95/mo (billed separately)
────────────────────────────────────────
• Snap a photo of any receipt from your phone
• AI reads, categorizes, and names it instantly
• Automatically uploads to your Dropbox bookkeeping folder
• Duplicate detection, spending alerts & monthly insights
• No more collecting, scanning, or emailing receipts

────────────────────────────────────────
\u{1F50D} FLOW REVIEWER — $19.95/mo (billed separately)
────────────────────────────────────────
• Review and approve your monthly bookkeeping entries
• Flag items or leave notes for your bookkeeper
• Spending summaries, trends & category breakdowns
• Approve reports right from your phone
• Direct messaging with the Flow team

────────────────────────────────────────
Subscribe to one or both — separate subscriptions, cancel anytime:
${subscribeUrl}
────────────────────────────────────────

These apps do NOT affect your Flow Bookkeeping Services billing.
They are completely separate charges on your card.

Questions? Reply to this email anytime.

Talk soon,
Karen Cotton
Flow Bookkeeping Services · Charleston, SC
hello@flowbookkeepingservices.com
`;
}

module.exports = { sendUpsellOffer };
