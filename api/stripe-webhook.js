/**
 * Flow Reviewer — Stripe Webhook Endpoint
 * POST /api/stripe-webhook
 *
 * Receives billing lifecycle events from Stripe and updates
 * the clients table in Supabase accordingly.
 *
 * Handled event types:
 *   checkout.session.completed    → Activate subscription, set paid-through date
 *   invoice.paid                  → Extend paid-through date by 30 days
 *   invoice.payment_failed        → Move to Past Due, keep grace-period access
 *   customer.subscription.updated → Handle cancel-at-period-end scheduling
 *   customer.subscription.deleted → Expire subscription, deactivate review link
 *
 * TODO: Uncomment Stripe signature verification once STRIPE_WEBHOOK_SECRET is set.
 */

const { getDb, logWebhookEvent } = require('./_db');

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

function tsToDate(unixTs) {
  return new Date(unixTs * 1000).toISOString().slice(0, 10);
}

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // ── Stripe signature verification (uncomment when STRIPE_WEBHOOK_SECRET is set) ──
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const sig    = req.headers['stripe-signature'];
  // let event;
  // try {
  //   event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  // } catch (err) {
  //   console.error('[stripe-webhook] Signature verification failed:', err.message);
  //   return res.status(400).json({ error: `Webhook error: ${err.message}` });
  // }

  const event = req.body;

  if (!event || !event.type) {
    return res.status(400).json({ error: 'Invalid Stripe event: missing type' });
  }

  console.log(`[stripe-webhook] Received event: ${event.type}`);

  const db   = getDb();
  const data = event.data?.object || {};

  switch (event.type) {

    case 'checkout.session.completed': {
      const customerEmail  = data.customer_email || data.customer_details?.email;
      const customerId     = data.customer;
      const subscriptionId = data.subscription;
      const paidThrough    = addDays(new Date(), 30);

      const { error } = await db.from('clients').update({
        stripe_customer_id:     customerId,
        stripe_subscription_id: subscriptionId,
        subscription_status:    'Active',
        paid_through_date:      paidThrough,
        billing_start_date:     new Date().toISOString().slice(0, 10),
        review_link_status:     'Active',
        offer_status:           'Converted',
        activation_source:      'Post-onboarding upsell',
      }).eq('email', customerEmail);

      if (error) console.error('[stripe-webhook] checkout.session.completed DB error:', error.message);

      await logWebhookEvent(db, 'stripe.checkout.session.completed', customerEmail,
        error ? 'Failed' : 'Processed',
        error ? error.message : `Subscription activated, paid through ${paidThrough}`,
        event);
      break;
    }

    case 'invoice.paid': {
      const customerId     = data.customer;
      const subscriptionId = data.subscription;
      const paidThrough    = addDays(new Date(), 30);

      const { error } = await db.from('clients').update({
        subscription_status: 'Active',
        paid_through_date:   paidThrough,
        review_link_status:  'Active',
      }).eq('stripe_customer_id', customerId);

      if (error) console.error('[stripe-webhook] invoice.paid DB error:', error.message);

      await logWebhookEvent(db, 'stripe.invoice.paid', null,
        error ? 'Failed' : 'Processed',
        error ? error.message : `Access extended to ${paidThrough}`,
        { customerId, subscriptionId });
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = data.customer;

      const { error } = await db.from('clients').update({
        subscription_status: 'Past Due',
        review_link_status:  'Grace period',
      }).eq('stripe_customer_id', customerId);

      if (error) console.error('[stripe-webhook] invoice.payment_failed DB error:', error.message);

      await logWebhookEvent(db, 'stripe.invoice.payment_failed', null,
        error ? 'Failed' : 'Processed',
        error ? error.message : 'Moved to Past Due with grace-period access',
        { customerId });
      break;
    }

    case 'customer.subscription.updated': {
      const customerId        = data.customer;
      const cancelAtPeriodEnd = data.cancel_at_period_end;
      const currentPeriodEnd  = data.current_period_end ? tsToDate(data.current_period_end) : null;

      if (cancelAtPeriodEnd) {
        const { error } = await db.from('clients').update({
          subscription_status: 'Cancel Scheduled',
          cancel_scheduled_at: new Date().toISOString().slice(0, 10),
          paid_through_date:   currentPeriodEnd,
          review_link_status:  'Active until end of term',
        }).eq('stripe_customer_id', customerId);

        if (error) console.error('[stripe-webhook] subscription.updated DB error:', error.message);

        await logWebhookEvent(db, 'stripe.customer.subscription.updated', null,
          error ? 'Failed' : 'Processed',
          error ? error.message : `Cancel scheduled; access until ${currentPeriodEnd}`,
          { customerId, cancelAtPeriodEnd, currentPeriodEnd });
      } else {
        // Cancellation reversed
        const { error } = await db.from('clients').update({
          subscription_status: 'Active',
          cancel_scheduled_at: null,
          review_link_status:  'Active',
        }).eq('stripe_customer_id', customerId);

        if (error) console.error('[stripe-webhook] subscription.reactivated DB error:', error.message);

        await logWebhookEvent(db, 'stripe.customer.subscription.updated', null,
          error ? 'Failed' : 'Processed',
          error ? error.message : 'Cancellation reversed; subscription reactivated',
          { customerId });
      }
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = data.customer;

      const { error } = await db.from('clients').update({
        subscription_status: 'Expired',
        review_link_status:  'Inactive',
        cancellation_date:   new Date().toISOString().slice(0, 10),
      }).eq('stripe_customer_id', customerId);

      if (error) console.error('[stripe-webhook] subscription.deleted DB error:', error.message);

      await logWebhookEvent(db, 'stripe.customer.subscription.deleted', null,
        error ? 'Failed' : 'Processed',
        error ? error.message : 'Subscription expired; review link deactivated',
        { customerId });
      break;
    }

    default:
      console.log(`[stripe-webhook] Unhandled event type: ${event.type} — ignoring`);
      await logWebhookEvent(db, `stripe.${event.type}`, null, 'Ignored', 'Unhandled event type', {});
  }

  return res.status(200).json({ received: true, type: event.type });
};
