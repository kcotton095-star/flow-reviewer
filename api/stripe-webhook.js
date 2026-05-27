/**
 * Flow Reviewer — Stripe Webhook Endpoint
 * POST /api/stripe-webhook
 *
 * Fully automated billing lifecycle:
 *   checkout.session.completed   -> Activate DB + welcome email + alert Karen
 *   invoice.paid                 -> Extend paid-through date
 *   invoice.payment_failed       -> Past Due + email customer + alert Karen
 *   customer.subscription.updated-> Handle cancel-at-period-end
 *   customer.subscription.deleted-> Expire + cancellation email + alert Karen
 */

const { getDb, logWebhookEvent } = require('./_db');

const KAREN_EMAIL = 'Karencotton26@yahoo.com';
const FROM_EMAIL  = process.env.FROM_EMAIL || 'hello@flowbookkeepingservices.com';
const SITE_URL    = process.env.SITE_URL   || 'https://flow-reviewer-hh88.vercel.app';
const PRICE_LABEL = '$19.95/month';

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function tsToDate(unixTs) {
  return new Date(unixTs * 1000).toISOString().slice(0, 10);
}

async function sendEmail({ to, subject, html }) {
  const { Resend } = require('resend');
  const resend = new Resend(process.env.RESEND_API_KEY);
  const { error } = await resend.emails.send({
    from: `Flow Reviewer <${FROM_EMAIL}>`,
    to: Array.isArray(to) ? to : [to],
    subject,
    html,
  });
  if (error) console.error('[stripe-webhook] Email error:', JSON.stringify(error));
}

function buildWelcomeEmail({ name }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08);">
  <div style="background:linear-gradient(135deg,#0d9488,#0f766e);padding:28px;color:white;text-align:center;">
    <div style="font-size:32px;">🌊</div>
    <h1 style="margin:8px 0 0;font-size:22px;font-weight:800;">Welcome to Flow Reviewer!</h1>
    <p style="margin:6px 0 0;opacity:.85;font-size:14px;">Your subscription is active</p>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;color:#1e293b;">Hi ${name || 'there'},</p>
    <p style="font-size:14px;color:#334155;line-height:1.7;">
      You're all set! Your Flow Reviewer subscription (${PRICE_LABEL}) is now active.
      Your Google review link is ready to share with clients today.
    </p>
    <div style="background:#f0fdfa;border:1px solid #99f6e4;border-radius:8px;padding:16px;margin:20px 0;">
      <ul style="margin:0;padding-left:18px;font-size:13px;color:#134e4a;line-height:2;">
        <li>Share your review link with satisfied clients right away</li>
        <li>Happy clients go to Google — private feedback stays private</li>
        <li>Subscription renews automatically at ${PRICE_LABEL}</li>
      </ul>
    </div>
    <div style="text-align:center;margin:24px 0;">
      <a href="${SITE_URL}" style="background:#0d9488;color:white;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Access Your Account</a>
    </div>
  </div>
  <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">
    Flow Bookkeeping Services
  </div>
</div></body></html>`;
}

function buildKarenNewSubAlert({ customerName, customerEmail, subId }) {
  const now = new Date().toLocaleString('en-US', { timeZone: 'America/Chicago', dateStyle: 'medium', timeStyle: 'short' });
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
<div style="max-width:520px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#16a34a,#15803d);padding:20px 24px;color:white;">
    <div style="font-size:24px;">🎉 New Subscriber!</div>
    <div style="font-size:12px;opacity:.8;">${now}</div>
  </div>
  <div style="padding:24px;">
    <table style="width:100%;font-size:14px;">
      <tr><td style="padding:8px 0;color:#64748b;width:120px;">Name</td><td style="font-weight:700;">${customerName || 'Unknown'}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Email</td><td style="color:#0d9488;">${customerEmail}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Plan</td><td style="font-weight:600;">Flow Reviewer ${PRICE_LABEL}</td></tr>
      <tr><td style="padding:8px 0;color:#64748b;">Sub ID</td><td style="font-size:12px;font-family:monospace;">${subId || '-'}</td></tr>
    </table>
    <div style="margin-top:16px;">
      <a href="https://dashboard.stripe.com/subscriptions" style="background:#635bff;color:white;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;margin-right:8px;">View in Stripe</a>
      <a href="${SITE_URL}/admin" style="background:#0d9488;color:white;padding:8px 16px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">Admin Panel</a>
    </div>
  </div>
</div></body></html>`;
}

function buildPaymentFailedEmail({ name }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:#dc2626;padding:22px 28px;color:white;">
    <div style="font-size:20px;font-weight:700;">⚠️ Payment Issue — Action Required</div>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;color:#1e293b;">Hi ${name || 'there'},</p>
    <p style="font-size:14px;color:#334155;line-height:1.7;">
      We were unable to process your payment for Flow Reviewer (${PRICE_LABEL}).
      Your access is in a grace period — please update your payment method.
    </p>
    <div style="text-align:center;margin:24px 0;">
      <a href="https://billing.stripe.com/p/login/test_00g" style="background:#dc2626;color:white;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Update Payment Method</a>
    </div>
  </div>
  <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">Flow Bookkeeping Services</div>
</div></body></html>`;
}

function buildCancellationEmail({ name }) {
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"></head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:sans-serif;">
<div style="max-width:560px;margin:24px auto;background:#fff;border-radius:12px;overflow:hidden;">
  <div style="background:linear-gradient(135deg,#1e293b,#334155);padding:22px 28px;color:white;">
    <div style="font-size:20px;font-weight:700;">Your subscription has ended</div>
  </div>
  <div style="padding:28px;">
    <p style="font-size:15px;color:#1e293b;">Hi ${name || 'there'},</p>
    <p style="font-size:14px;color:#334155;line-height:1.7;">Your Flow Reviewer subscription has been cancelled. We're sorry to see you go!</p>
    <div style="text-align:center;margin:24px 0;">
      <a href="${SITE_URL}" style="background:#0d9488;color:white;padding:12px 28px;border-radius:8px;font-size:14px;font-weight:700;text-decoration:none;">Resubscribe</a>
    </div>
  </div>
  <div style="background:#f8fafc;padding:14px 28px;border-top:1px solid #e2e8f0;text-align:center;font-size:11px;color:#94a3b8;">Flow Bookkeeping Services</div>
</div></body></html>`;
}

async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  const sig    = req.headers['stripe-signature'];

  const rawBody = await new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data',  c => chunks.push(Buffer.isBuffer(c) ? c : Buffer.from(c)));
    req.on('end',   () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[stripe-webhook] Sig failed:', err.message);
    return res.status(400).json({ error: err.message });
  }

  const db   = getDb();
  const data = event.data?.object || {};

  switch (event.type) {

    case 'checkout.session.completed': {
      const customerEmail  = data.customer_email || data.customer_details?.email;
      const customerId     = data.customer;
      const subscriptionId = data.subscription;
      const paidThrough    = addDays(new Date(), 30);

      const { error } = await db.from('clients').update({
        stripe_customer_id: customerId, stripe_subscription_id: subscriptionId,
        subscription_status: 'Active', paid_through_date: paidThrough,
        billing_start_date: new Date().toISOString().slice(0,10),
        review_link_status: 'Active', offer_status: 'Converted', monthly_amount: 19.95,
      }).eq('email', customerEmail);

      await logWebhookEvent(db, 'stripe.checkout.session.completed', customerEmail,
        error ? 'Failed' : 'Processed',
        error ? error.message : `Activated, paid through ${paidThrough}`, {});

      let customerName = customerEmail;
      try { const c = await stripe.customers.retrieve(customerId); customerName = c.name || customerEmail; } catch(_) {}

      await sendEmail({ to: customerEmail, subject: '🌊 Welcome to Flow Reviewer — Your subscription is active!', html: buildWelcomeEmail({ name: customerName }) });
      await sendEmail({ to: KAREN_EMAIL, subject: `🎉 New subscriber: ${customerName} (${customerEmail})`, html: buildKarenNewSubAlert({ customerName, customerEmail, subId: subscriptionId }) });
      break;
    }

    case 'invoice.paid': {
      const customerId = data.customer;
      const paidThrough = addDays(new Date(), 30);
      const { error } = await db.from('clients').update({
        subscription_status: 'Active', paid_through_date: paidThrough, review_link_status: 'Active',
      }).eq('stripe_customer_id', customerId);
      await logWebhookEvent(db, 'stripe.invoice.paid', null, error ? 'Failed' : 'Processed',
        error ? error.message : `Access extended to ${paidThrough}`, {});
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = data.customer;
      const { error } = await db.from('clients').update({
        subscription_status: 'Past Due', review_link_status: 'Grace period',
      }).eq('stripe_customer_id', customerId);
      await logWebhookEvent(db, 'stripe.invoice.payment_failed', null, error ? 'Failed' : 'Processed',
        error ? error.message : 'Moved to Past Due', {});
      try {
        const { data: client } = await db.from('clients').select('name, email').eq('stripe_customer_id', customerId).single();
        if (client?.email) {
          await sendEmail({ to: client.email, subject: '⚠️ Payment failed — Action required for your Flow Reviewer subscription', html: buildPaymentFailedEmail({ name: client.name }) });
        }
      } catch(_) {}
      await sendEmail({ to: KAREN_EMAIL, subject: `⚠️ Payment failed — Stripe customer ${customerId}`,
        html: `<div style="font-family:sans-serif;max-width:480px;margin:16px auto;padding:20px;background:#fff;border:1px solid #fee2e2;border-radius:10px;">
  <h2 style="color:#dc2626;margin-top:0;">⚠️ Payment Failed</h2>
  <p>Customer ID: <code>${customerId}</code></p>
  <p>Moved to <strong>Past Due</strong> with grace-period access.</p>
  <a href="https://dashboard.stripe.com/customers/${customerId}" style="background:#dc2626;color:white;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">View in Stripe</a>
</div>` });
      break;
    }

    case 'customer.subscription.updated': {
      const customerId = data.customer;
      const cancelAtPeriodEnd = data.cancel_at_period_end;
      const currentPeriodEnd  = data.current_period_end ? tsToDate(data.current_period_end) : null;
      if (cancelAtPeriodEnd) {
        const { error } = await db.from('clients').update({
          subscription_status: 'Cancel Scheduled', cancel_scheduled_at: new Date().toISOString().slice(0,10),
          paid_through_date: currentPeriodEnd, review_link_status: 'Active until end of term',
        }).eq('stripe_customer_id', customerId);
        await logWebhookEvent(db, 'stripe.customer.subscription.updated', null, error ? 'Failed' : 'Processed',
          error ? error.message : `Cancel scheduled; access until ${currentPeriodEnd}`, {});
      } else {
        const { error } = await db.from('clients').update({
          subscription_status: 'Active', cancel_scheduled_at: null, review_link_status: 'Active',
        }).eq('stripe_customer_id', customerId);
        await logWebhookEvent(db, 'stripe.customer.subscription.updated', null, error ? 'Failed' : 'Processed',
          error ? error.message : 'Cancellation reversed', {});
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = data.customer;
      const { error } = await db.from('clients').update({
        subscription_status: 'Expired', review_link_status: 'Inactive',
        cancellation_date: new Date().toISOString().slice(0,10),
      }).eq('stripe_customer_id', customerId);
      await logWebhookEvent(db, 'stripe.customer.subscription.deleted', null, error ? 'Failed' : 'Processed',
        error ? error.message : 'Expired; review link deactivated', {});
      try {
        const { data: client } = await db.from('clients').select('name, email').eq('stripe_customer_id', customerId).single();
        if (client?.email) {
          await sendEmail({ to: client.email, subject: 'Your Flow Reviewer subscription has been cancelled', html: buildCancellationEmail({ name: client.name }) });
          await sendEmail({ to: KAREN_EMAIL, subject: `📉 Subscriber cancelled: ${client.name || client.email}`,
            html: `<div style="font-family:sans-serif;max-width:480px;margin:16px auto;padding:20px;background:#fff;border:1px solid #e2e8f0;border-radius:10px;">
  <h2 style="color:#dc2626;margin-top:0;">📉 Cancellation Alert</h2>
  <p><strong>Name:</strong> ${client.name || 'Unknown'}<br><strong>Email:</strong> ${client.email}<br><strong>Stripe ID:</strong> <code>${customerId}</code></p>
  <a href="https://dashboard.stripe.com/customers/${customerId}" style="background:#1e293b;color:white;padding:8px 14px;border-radius:6px;font-size:12px;font-weight:700;text-decoration:none;">View in Stripe</a>
</div>` });
        }
      } catch(_) {}
      break;
    }

    default:
      await logWebhookEvent(db, `stripe.${event.type}`, null, 'Ignored', 'Unhandled event type', {});
  }

  return res.status(200).json({ received: true, type: event.type });
}

handler.config = { api: { bodyParser: false } };
module.exports = handler;
