// api/cron/upsell-check.js
// Called every 15 min by cron-job.org
// Finds clients with offer_status="Queued" onboarded 2+ hours ago, sends upsell email

const { getDb } = require('../_db');
const { sendUpsellOffer } = require('../_send-upsell-offer');

module.exports = async (req, res) => {
  // Auth check
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  try {
    const db = getDb();
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: clients, error } = await db
      .from('clients')
      .select('*')
      .eq('offer_status', 'Queued')
      .lt('onboarded_at', twoHoursAgo);

    if (error) throw error;
    let processed = 0;

    for (const client of clients || []) {
      try {
        await sendUpsellOffer({ client });

        await db
          .from('clients')
          .update({ offer_status: 'Sent', offer_sent_at: new Date().toISOString() })
          .eq('id', client.id);

        const { Resend } = require('resend');
        const resend = new Resend(process.env.RESEND_API_KEY);
        await resend.emails.send({
          from: 'Flow Bookkeeping Services <hello@flowbookkeepingservices.com>',
          to: 'Karencotton26@yahoo.com',
          subject: 'Upsell offer sent to ' + client.name,
          html: '<p>Upsell email sent to <strong>' + client.name + '</strong> (' + client.email + ').</p>'
        });

        processed++;
      } catch (e) {
        console.error('[upsell-check] Error processing client', client.id, e.message);
      }
    }

    return res.status(200).json({ ok: true, processed });
  } catch (err) {
    console.error('[upsell-check] Fatal error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
