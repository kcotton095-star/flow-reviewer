// api/cron/upsell-check.js
// Runs every 15 min via cron-job.org

const { createClient } = require('@supabase/supabase-js');
const { Resend } = require('resend');
const sendUpsellOffer = require('../_send-upsell-offer');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);
const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async (req, res) => {
  const secret = req.headers['x-cron-secret'];
  if (secret !== process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    const { data: clients, error } = await supabase
      .from('clients').select('*')
      .eq('offer_status', 'Queued').lt('onboarded_at', twoHoursAgo);
    if (error) throw error;
    let processed = 0;
    for (const client of clients || []) {
      try {
        await sendUpsellOffer({ client, resend });
        await supabase.from('clients')
          .update({ offer_status: 'Sent', offer_sent_at: new Date().toISOString() })
          .eq('id', client.id);
        await resend.emails.send({
          from: 'Flow Bookkeeping Services <hello@flowbookkeepingservices.com>',
          to: 'Karencotton26@yahoo.com',
          subject: 'Upsell offer sent to ' + client.name,
          html: '<p>Upsell email sent to <strong>' + client.name + '</strong> (' + client.email + ').</p>'
        });
        processed++;
      } catch (e) { console.error('client error', e); }
    }
    return res.status(200).json({ ok: true, processed });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
