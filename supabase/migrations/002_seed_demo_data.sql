-- ============================================================
-- Flow Reviewer — Demo Data Seed
-- Migration 002: Inserts the 5 demo clients from demo-data.json
-- Safe to skip in production — only needed for local/staging.
-- ============================================================

INSERT INTO clients (
  name, email, phone, sector,
  financial_cents_id,
  onboarding_status, onboarding_completed_at,
  offer_eligible, offer_status, offer_sent_at, offer_channel, activation_source,
  stripe_customer_id, stripe_subscription_id,
  subscription_status, monthly_amount,
  billing_start_date, paid_through_date, cancel_scheduled_at, cancellation_date,
  review_link_status, review_link_url,
  business_name, business_slug, business_tone, google_review_url, private_feedback_email
) VALUES

-- 1. Acme Plumbing — Active subscriber
(
  'Acme Plumbing', 'owner@acmeplumbing.com', '+1-555-111-2222', 'Plumbing',
  'fc_12345',
  'Completed', '2026-05-20T00:00:00Z',
  TRUE, 'Sent', '2026-05-20T00:00:00Z', 'Email', 'Post-onboarding upsell',
  'cus_Acme001', 'sub_Acme001',
  'Active', 49,
  '2026-05-21', '2026-06-21', NULL, NULL,
  'Active', '/review/acme-plumbing',
  'Acme Plumbing', 'acme-plumbing', 'Helpful',
  'https://google.com/review/acme', 'feedback@acmeplumbing.com'
),

-- 2. Summit HVAC — Cancel scheduled
(
  'Summit HVAC', 'ops@summithvac.com', '+1-555-222-3333', 'HVAC',
  'fc_22345',
  'Completed', '2026-05-16T00:00:00Z',
  TRUE, 'Sent', '2026-05-17T00:00:00Z', 'SMS', 'Post-onboarding upsell',
  'cus_Hvac002', 'sub_Hvac002',
  'Cancel Scheduled', 49,
  '2026-04-18', '2026-05-30', '2026-05-23', NULL,
  'Active until end of term', '/review/summit-hvac',
  'Summit HVAC', 'summit-hvac', 'Warm',
  'https://google.com/review/summit', 'owner@summithvac.com'
),

-- 3. Harbor Electric — Past due
(
  'Harbor Electric', 'admin@harborelectric.com', '+1-555-444-0000', 'Electrical',
  'fc_32345',
  'Completed', '2026-05-10T00:00:00Z',
  TRUE, 'Sent', '2026-05-11T00:00:00Z', 'Both', 'Post-onboarding upsell',
  'cus_Elec003', 'sub_Elec003',
  'Past Due', 49,
  '2026-04-12', '2026-05-26', NULL, NULL,
  'Grace period', '/review/harbor-electric',
  'Harbor Electric', 'harbor-electric', 'Direct',
  'https://google.com/review/harbor', 'service@harborelectric.com'
),

-- 4. Blue Tide Roofing — Expired
(
  'Blue Tide Roofing', 'billing@bluetideroofing.com', '+1-555-777-1212', 'Roofing',
  'fc_42345',
  'Completed', '2026-04-03T00:00:00Z',
  TRUE, 'Sent', '2026-04-04T00:00:00Z', 'Email', 'Post-onboarding upsell',
  'cus_Roof004', 'sub_Roof004',
  'Expired', 49,
  '2026-03-05', '2026-05-01', '2026-04-25', '2026-05-01',
  'Inactive', '/review/blue-tide-roofing',
  'Blue Tide Roofing', 'blue-tide-roofing', 'Helpful',
  'https://google.com/review/bluetide', 'service@bluetideroofing.com'
),

-- 5. Palmetto Landscaping — Not yet subscribed
(
  'Palmetto Landscaping', 'team@palmettolandscaping.com', '+1-555-888-0001', 'Landscaping',
  'fc_52345',
  'Completed', '2026-05-24T00:00:00Z',
  TRUE, 'Queued', NULL, 'Email', NULL,
  NULL, NULL,
  'Not Subscribed', 49,
  NULL, NULL, NULL, NULL,
  'Not active', '/review/palmetto-landscaping',
  'Palmetto Landscaping', 'palmetto-landscaping', 'Warm',
  'https://google.com/review/palmetto', 'hello@palmettolandscaping.com'
)

ON CONFLICT (email) DO NOTHING;
