# Flow Reviewer — Deployment Checklist

Use this checklist the first time you deploy (or after any major update). Work top to bottom — each section depends on the one above it.

---

## 1. Prerequisites — Accounts

- [ ] **Supabase** account exists at supabase.com → project created (free tier is fine)
- [ ] **Resend** account exists at resend.com → domain `flowbookkeeping.com` verified
- [ ] **Stripe** account exists → test mode confirmed before going live
- [ ] **Vercel** account exists → project already connected to your GitHub repo
- [ ] **Zapier** account exists → connected to Financial Cents

---

## 2. Supabase — Database Setup

### 2a. Run migrations

1. In Supabase, open **SQL Editor**
2. Paste the full contents of `supabase/migrations/001_initial_schema.sql`
3. Click **Run** — confirm no errors
4. *(Optional)* Paste `supabase/migrations/002_seed_demo_data.sql` and Run to load 5 test clients

### 2b. Collect credentials

Go to **Settings → API** and copy:

| What | Where to find it |
|---|---|
| Project URL | "Project URL" field, e.g. `https://xxxx.supabase.co` |
| Service role key | Under "Project API keys" → `service_role` (not `anon`) |

> ⚠️ The service role key bypasses Row Level Security. Keep it secret — never put it in frontend code.

### 2c. Confirm tables exist

In **Table Editor**, verify these tables are present:
- [ ] `clients`
- [ ] `webhook_events`

---

## 3. Resend — Email Setup

1. Log in to resend.com → **Domains** → verify `flowbookkeeping.com` (add the DNS records shown)
2. Go to **API Keys** → create a new key with "Sending access"
3. Copy the API key — you'll need it in Step 5

**Test send (optional but recommended):**
```
curl -X POST https://api.resend.com/emails \
  -H "Authorization: Bearer YOUR_API_KEY" \
  -H "Content-Type: application/json" \
  -d '{"from":"test@flowbookkeeping.com","to":"karencotton26@yahoo.com","subject":"Test","text":"Works!"}'
```
Confirm delivery before continuing.

---

## 4. Stripe — Payment Link

1. In Stripe, go to **Payment Links** → **Create payment link**
2. Set up the $49/month recurring product (Flow Reviewer subscription)
3. Copy the payment link URL (looks like `https://buy.stripe.com/xxxxx`)
4. Under **Webhooks** → **Add endpoint**:
   - URL: `https://YOUR-VERCEL-URL.vercel.app/api/stripe-webhook`
   - Events to listen for:
     - [ ] `checkout.session.completed`
     - [ ] `invoice.paid`
     - [ ] `invoice.payment_failed`
     - [ ] `customer.subscription.updated`
     - [ ] `customer.subscription.deleted`
5. Copy the **Webhook signing secret** (starts with `whsec_`) — you'll need it in Step 5

---

## 5. Vercel — Environment Variables

Go to your Vercel project → **Settings → Environment Variables** and add all of these:

| Variable name | Value | Where to get it |
|---|---|---|
| `FLOW_REVIEWER_SHARED_SECRET` | `flow-reviewer-secret-2026-xK9mPq7bNrT3vL5s` | Already set — confirm it's there |
| `SUPABASE_URL` | `https://xxxx.supabase.co` | Supabase → Settings → API |
| `SUPABASE_SERVICE_KEY` | `eyJhbGciOi...` | Supabase → Settings → API → service_role |
| `RESEND_API_KEY` | `re_xxxx` | Resend → API Keys |
| `FROM_EMAIL` | `Flow Bookkeeping Services <karen@flowbookkeeping.com>` | Type this in |
| `SITE_URL` | `https://flow-reviewer-hh88.vercel.app` | Your Vercel project URL |
| `STRIPE_PAYMENT_LINK` | `https://buy.stripe.com/xxxxx` | Stripe → Payment Links |

> **Note:** If you change any env var, you must **Redeploy** from the Vercel dashboard for it to take effect.

---

## 6. Deploy

### 6a. Push code to GitHub

```bash
cd flow-reviewer
git add .
git commit -m "Phase 2: Supabase DB, Resend email, review pages, dashboard"
git push
```

Vercel will auto-deploy on push. Watch the **Deployments** tab — the build should complete in ~60 seconds.

### 6b. Confirm build passes

In Vercel → **Deployments**, confirm:
- [ ] Build status: **Ready** (not Error)
- [ ] No build errors in the log

### 6c. Install dependencies

Vercel reads `package.json` automatically. Confirm these packages are installed by checking the build log for:
- [ ] `@supabase/supabase-js`
- [ ] `resend`

---

## 7. Zapier — Connect Financial Cents

> This connects Financial Cents onboarding events to your `/api/onboarding-trigger` webhook.

1. In Zapier, open your **Flow Reviewer — FC Onboarding** zap (or create it):
   - **Trigger**: Financial Cents → Client Created/Updated
   - **Action**: Webhooks by Zapier → POST

2. Configure the POST action:
   - **URL**: `https://YOUR-VERCEL-URL.vercel.app/api/onboarding-trigger`
   - **Payload type**: JSON
   - **Data** (map FC fields using the `/` picker):
     | Field | FC value |
     |---|---|
     | `client_name` | Client Full Name |
     | `client_email` | Client Email |
     | `client_phone` | Client Phone |
     | `financial_cents_client_id` | Client ID |
     | `event_type` | `onboarding_completed` *(type directly)* |
   - **Headers**:
     | Key | Value |
     |---|---|
     | `x-flow-reviewer-secret` | `flow-reviewer-secret-2026-xK9mPq7bNrT3vL5s` |

3. **Test the step** → confirm 200 response
4. **Publish** the zap
5. **Rename** the zap to: `Flow Reviewer — FC Onboarding Trigger`

---

## 8. End-to-End Testing

Work through these in order. Each one validates the next.

### 8a. Dashboard loads

1. Open `https://YOUR-VERCEL-URL.vercel.app`
2. Enter the shared secret: `flow-reviewer-secret-2026-xK9mPq7bNrT3vL5s`
3. - [ ] Dashboard loads showing Overview, Clients, Event log tabs
4. If seed data was run: - [ ] 5 demo clients appear on Clients tab with correct status badges

### 8b. Review page loads (with seed data)

1. Open `https://YOUR-VERCEL-URL.vercel.app/review/acme-plumbing`
2. - [ ] Page loads (not error state) — shows "How did we do, Acme Plumbing?"
3. Click 5 stars → - [ ] Comment box appears with "Share on Google" button
4. Click 2 stars → - [ ] Comment box appears with "Submit feedback" button

### 8c. Positive review redirects to Google

1. On the review page, click 5 stars → click "Share on Google"
2. - [ ] Brief "You're being taken to Google…" screen appears
3. - [ ] Browser redirects to Google (or the demo Google URL if placeholder)
4. In Supabase → `webhook_events`: - [ ] Row inserted with `event_type = review.positive`

### 8d. Negative review sends email

1. On the review page, click 2 stars → type a comment → click "Submit feedback"
2. - [ ] Thank-you screen appears
3. - [ ] Email arrives at the `private_feedback_email` address (check demo data or update it)
4. In Supabase → `webhook_events`: - [ ] Row inserted with `event_type = review.private`

### 8e. Onboarding trigger creates a new client

1. Trigger the Zapier zap with a test payload (use Zapier's "Test step" with a real or dummy FC client)
2. - [ ] Zapier shows 200 OK
3. In Supabase → `clients`: - [ ] New row appears with correct slug
4. In your inbox: - [ ] Upsell offer email arrives with the client's review link
5. Open `https://YOUR-VERCEL-URL.vercel.app/review/[new-slug]`
6. - [ ] Review page loads for the new client

### 8f. Stripe checkout activates subscription

1. In Stripe → **Payment Links** → open your link → use a test card (`4242 4242 4242 4242`)
2. - [ ] `checkout.session.completed` webhook fires
3. In Supabase → `clients`: - [ ] `subscription_status = Active`, `review_link_status = Active`, `offer_status = Converted`
4. In dashboard Clients tab: - [ ] Client shows green "Active" badge

---

## 9. Go-Live

Once all tests pass, switch from test mode to live:

- [ ] In Stripe, toggle off **Test mode** and copy the live webhook signing secret
- [ ] Update `STRIPE_PAYMENT_LINK` in Vercel to the live payment link URL
- [ ] Send yourself a real test onboarding via Financial Cents
- [ ] Confirm upsell email arrives and review page is live
- [ ] Share `https://YOUR-VERCEL-URL.vercel.app/review/[slug]` with a real client

---

## 10. Ongoing Operations

| Task | How |
|---|---|
| View new clients | Dashboard → Clients tab |
| Monitor webhook activity | Dashboard → Event log tab |
| See a client's review page | Dashboard → Clients tab → click /review/slug link |
| Expired review link | Supabase → update `review_link_status` if needed |
| Add a client manually | Supabase → `clients` table → insert row |
| Check if email delivered | Resend dashboard → Emails |
| Debug a failed webhook | Supabase → `webhook_events` → filter by status = Failed |

---

*Generated for Flow Bookkeeping Services — Flow Reviewer v1.0*
