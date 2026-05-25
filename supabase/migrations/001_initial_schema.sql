-- ============================================================
-- Flow Reviewer — Initial Schema
-- Migration 001: clients + webhook_events tables
-- Run against your Supabase project via the SQL editor or CLI:
--   supabase db push  (if using Supabase CLI)
-- ============================================================

-- ── clients ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS clients (
  id                      UUID PRIMARY KEY DEFAULT gen_random_uuid(),

  -- Identity
  name                    TEXT NOT NULL,
  email                   TEXT NOT NULL UNIQUE,
  phone                   TEXT,
  sector                  TEXT,

  -- Financial Cents
  financial_cents_id      TEXT UNIQUE,

  -- Onboarding
  onboarding_status       TEXT NOT NULL DEFAULT 'Pending',
  onboarding_completed_at TIMESTAMPTZ,

  -- Upsell offer
  offer_eligible          BOOLEAN NOT NULL DEFAULT FALSE,
  offer_status            TEXT NOT NULL DEFAULT 'Not sent',  -- Queued | Sent | Converted
  offer_sent_at           TIMESTAMPTZ,
  offer_channel           TEXT,                              -- Email | SMS | Both
  activation_source       TEXT,

  -- Stripe billing
  stripe_customer_id      TEXT UNIQUE,
  stripe_subscription_id  TEXT UNIQUE,
  subscription_status     TEXT NOT NULL DEFAULT 'Not Subscribed',
  -- Statuses: Not Subscribed | Active | Past Due | Cancel Scheduled | Expired
  monthly_amount          INTEGER NOT NULL DEFAULT 49,       -- in USD
  billing_start_date      DATE,
  paid_through_date       DATE,
  cancel_scheduled_at     DATE,
  cancellation_date       DATE,

  -- Review link
  review_link_status      TEXT NOT NULL DEFAULT 'Not active',
  -- Statuses: Not active | Active | Grace period | Active until end of term | Inactive
  review_link_url         TEXT,

  -- Business setup (for the review page)
  business_name           TEXT,
  business_slug           TEXT UNIQUE,
  business_tone           TEXT DEFAULT 'Helpful',            -- Helpful | Warm | Direct | Professional
  google_review_url       TEXT,
  private_feedback_email  TEXT,

  -- Timestamps
  created_at              TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at              TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at on any row change
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER clients_updated_at
  BEFORE UPDATE ON clients
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Indexes for the most common lookups
CREATE INDEX IF NOT EXISTS idx_clients_email            ON clients (email);
CREATE INDEX IF NOT EXISTS idx_clients_financial_cents  ON clients (financial_cents_id);
CREATE INDEX IF NOT EXISTS idx_clients_stripe_customer  ON clients (stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_clients_slug             ON clients (business_slug);
CREATE INDEX IF NOT EXISTS idx_clients_sub_status       ON clients (subscription_status);


-- ── webhook_events ────────────────────────────────────────────
-- Audit log of every inbound webhook (Financial Cents + Stripe)
CREATE TABLE IF NOT EXISTS webhook_events (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type   TEXT NOT NULL,          -- e.g. financial_cents.onboarding_completed
  client_email TEXT,
  payload      JSONB,                  -- full raw body for debugging
  status       TEXT NOT NULL DEFAULT 'Processed',   -- Processed | Failed | Ignored
  note         TEXT,                   -- human-readable outcome
  processed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_webhook_events_client ON webhook_events (client_email);
CREATE INDEX IF NOT EXISTS idx_webhook_events_type   ON webhook_events (event_type);
CREATE INDEX IF NOT EXISTS idx_webhook_events_time   ON webhook_events (processed_at DESC);


-- ── Row Level Security (stub — tighten before going to production) ──
ALTER TABLE clients       ENABLE ROW LEVEL SECURITY;
ALTER TABLE webhook_events ENABLE ROW LEVEL SECURITY;

-- Service-role key (used by your API) bypasses RLS automatically.
-- Add policies here if you expose these tables to authenticated users
-- via the Supabase JS client in a frontend.
-- Example (read-only for authenticated users):
-- CREATE POLICY "Authenticated users can read clients"
--   ON clients FOR SELECT TO authenticated USING (true);
