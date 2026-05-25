/**
 * Flow Reviewer - Stripe Webhook Endpoint
 * POST /api/stripe-webhook
 *
 * Receives billing lifecycle events from Stripe and updates subscription state.
 * Phase 1: Logs events (no signature check or DB persistence yet).
 * Phase 2: Add stripe.webhooks.constructEvent() + DB writes.
 *
 * Handled events:
 *   checkout.session.completed     - Activate subscription
 *   invoice.paid                   - Extend paid-through date
 *   invoice.payment_failed         - Move to Past Due
 *   customer.subscription.updated  - Handle cancel scheduling
 *   customer.subscription.deleted  - Expire subscription
 */

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  // TODO Phase 2: Replace with real Stripe signature verification
  // const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
  // const sig = req.headers['stripe-signature'];
  // let event;
  // try {
  //   event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET);
  // } catch (err) {
  //   return res.status(400).json({ error: 'Webhook error: ' + err.message });
  // }

  // Phase 1: Parse body directly
  const event = req.body;

  if (!event || !event.type) {
    return res.status(400).json({ error: 'Invalid Stripe event: missing type' });
  }

  console.log('[stripe-webhook] Received event: ' + event.type);

  const data = event.data?.object || {};

  switch (event.type) {

    case 'checkout.session.completed': {
      const customerEmail = data.customer_email || data.customer_details?.email;
      const customerId = data.customer;
      const subscriptionId = data.subscription;
      console.log('[stripe-webhook] New subscription activated:', { customerEmail, customerId, subscriptionId });
      // TODO Phase 2: Update clients table, set subscriptionStatus = Active
      break;
    }

    case 'invoice.paid': {
      const customerId = data.customer;
      console.log('[stripe-webhook] Invoice paid - extending access:', { customerId });
      // TODO Phase 2: Extend paidThroughDate by 30 days
      break;
    }

    case 'invoice.payment_failed': {
      const customerId = data.customer;
      console.log('[stripe-webhook] Payment failed - Past Due:', { customerId });
      // TODO Phase 2: Set subscriptionStatus = Past Due
      break;
    }

    case 'customer.subscription.updated': {
      const customerId = data.customer;
      const cancelAtPeriodEnd = data.cancel_at_period_end;
      console.log('[stripe-webhook] Subscription updated:', { customerId, cancelAtPeriodEnd });
      // TODO Phase 2: If cancelAtPeriodEnd, set status = Cancel Scheduled
      break;
    }

    case 'customer.subscription.deleted': {
      const customerId = data.customer;
      console.log('[stripe-webhook] Subscription deleted - expiring access:', { customerId });
      // TODO Phase 2: Set subscriptionStatus = Expired, reviewLinkStatus = Inactive
      break;
    }

    default:
      console.log('[stripe-webhook] Unhandled event type: ' + event.type);
  }

  // Always return 200 so Stripe does not retry
  return res.status(200).json({ received: true, type: event.type });
};
