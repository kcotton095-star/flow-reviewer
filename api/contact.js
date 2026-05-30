const { Resend } = require('resend');

const KAREN_EMAIL = 'Karencotton26@yahoo.com';
const FROM_EMAIL = process.env.FROM_EMAIL || 'hello@flowbookkeepingservices.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', 'https://www.flowbookkeepingservices.com');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, business_type, monthly_transactions, message } = req.body || {};
  if (!name || !email) return res.status(400).json({ error: 'Name and email are required' });

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);

    // Notify Karen
    await resend.emails.send({
      from: `Flow Website <${FROM_EMAIL}>`,
      to: [KAREN_EMAIL],
      replyTo: email,
      subject: `New consultation request: ${name}`,
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
        <h2 style="color:#0d9488;margin-top:0;">New Consultation Request</h2>
        <p><strong>Name:</strong> ${name}</p>
        <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
        <p><strong>Business type:</strong> ${business_type || '—'}</p>
        <p><strong>Monthly transactions:</strong> ${monthly_transactions || '—'}</p>
        <p><strong>Message:</strong><br>${(message || '—').replace(/\n/g, '<br>')}</p>
      </div>`
    });

    // Auto-reply to submitter
    await resend.emails.send({
      from: `Karen at Flow Bookkeeping <${FROM_EMAIL}>`,
      to: [email],
      subject: 'Got your consultation request — Flow Bookkeeping Services',
      html: `<div style="font-family:sans-serif;max-width:520px;margin:0 auto;padding:24px;">
        <h2 style="color:#0d9488;margin-top:0;">Thanks, ${name}!</h2>
        <p>I received your consultation request and will follow up within one business day.</p>
        <p>Feel free to reply to this email with any questions in the meantime.</p>
        <p style="margin-top:32px;">— Karen<br><a href="https://www.flowbookkeepingservices.com">Flow Bookkeeping Services</a></p>
      </div>`
    });

    return res.status(200).json({ success: true, message: 'Request received!' });
  } catch (err) {
    console.error('[contact] Email failed:', err.message);
    return res.status(500).json({ error: 'Failed to send' });
  }
};
