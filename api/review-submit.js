/**
 * Flow Reviewer — Review Submit API
 * POST /api/review-submit
 *
 * Receives a star rating + comment from the review page.
 * - 4-5 stars: redirects to Google (returns googleUrl in response)
 * - 1-3 stars: emails the private feedback to the business owner via Resend
 */

const { getDb, logWebhookEvent } = require('./_db');
const { Resend }                  = require('resend');

module.exports = async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { slug, rating, comment, reviewerName } = req.body || {};

  if (!slug || !rating) {
    return res.status(400).json({ error: 'Missing slug or rating' });
  }

  const stars = parseInt(rating, 10);
  if (isNaN(stars) || stars < 1 || stars > 5) {
    return res.status(400).json({ error: 'Rating must be 1–5' });
  }

  const db = getDb();

  const { data: client, error } = await db
    .from('clients')
    .select('business_name, business_slug, business_tone, google_review_url, private_feedback_email, review_link_status')
    .eq('business_slug', slug)
    .single();

  if (error || !client) {
    return res.status(404).json({ error: 'Review page not found' });
  }

  const activeStatuses = ['Active', 'Grace period', 'Active until end of term'];
  if (!activeStatuses.includes(client.review_link_status)) {
    return res.status(403).json({ error: 'Review link is not currently active' });
  }

  // ── High rating — send to Google ─────────────────────────────────────────
  if (stars >= 4) {
    await logWebhookEvent(db, 'review.positive', null, 'Processed',
      `${stars}-star review from ${reviewerName || 'anonymous'} → Google`, { slug, stars });
    return res.status(200).json({
      action:    'redirect',
      googleUrl: client.google_review_url,
      message:   'Thank you! Redirecting to Google...',
    });
  }

  // ── Low rating — capture privately ───────────────────────────────────────
  const apiKey = process.env.RESEND_API_KEY;
  if (apiKey && client.private_feedback_email) {
    const resend = new Resend(apiKey);
    const from   = process.env.FROM_EMAIL || 'Flow Reviewer <noreply@flowbookkeeping.com>';

    await resend.emails.send({
      from,
      to:      client.private_feedback_email,
      subject: `${stars}⭐ Private feedback received — ${client.business_name}`,
      text: [
        `New private feedback for ${client.business_name}`,
        `Rating:   ${stars}/5`,
        `Name:     ${reviewerName || 'Anonymous'}`,
        `Comment:  ${comment || '(no comment left)'}`,
        ``,
        `This feedback was captured privately and not posted publicly.`,
      ].join('\n'),
    });
  }

  await logWebhookEvent(db, 'review.private', null, 'Processed',
    `${stars}-star private feedback from ${reviewerName || 'anonymous'}`, { slug, stars });

  return res.status(200).json({
    action:  'thankyou',
    message: 'Thank you for your feedback. We\'ll be in touch.',
  });
};
