# NCD Games 2026 — Competition Manager

A static web app for running the NCD Games 2026 community sports tournament
(Port Moresby): public team registration, an admin approval/payment
dashboard, fixture generation, standings, and Governor's Cup qualifiers.
Backed by [Supabase](https://supabase.com) (Postgres + Auth). No build step —
plain HTML/CSS/JS, deployable straight to GitHub Pages.

Branding (logo, sporting codes, electorates, fee structure, form sections)
was pulled from `Poster.jpg` and `NCD GAMES 2026 TEAM REGISTRATION FORM_FINAL_210826.pdf`
in this repo — the registration form on the Register tab mirrors that PDF's
Sections A–E exactly, and the admin directory mirrors Sections F–G.

## 1. Set up Supabase

1. Create a free project at [supabase.com](https://supabase.com).
2. Dashboard → **SQL Editor** → New query → paste the contents of
   [`supabase/schema.sql`](supabase/schema.sql) → Run. This creates the
   `teams`, `players`, and `fixtures` tables plus row-level security
   policies (see "Access model" below).
3. Dashboard → **Project Settings → API** → copy the **Project URL** and the
   **anon public** key.
4. Open [`assets/js/config.js`](assets/js/config.js) and paste them in:
   ```js
   window.NCD_CONFIG = {
     SUPABASE_URL: "https://xxxxxxxx.supabase.co",
     SUPABASE_ANON_KEY: "eyJ..."
   };
   ```
5. Dashboard → **Authentication → Users → Add user** → create an email +
   password login for each admin / sports-office staff member. There is no
   public sign-up in this app — admin accounts are created by hand in the
   Supabase dashboard only.

## 2. Run it locally

Any static file server works, e.g.:

```
npx serve .
```

then open the printed `localhost` URL. (Opening `index.html` directly via
`file://` will not work — the browser blocks the Supabase client's requests
from a `file://` origin in some browsers, so serve it over HTTP.)

## 3. Deploy on GitHub Pages

1. Push this repo to GitHub (see below).
2. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch:
   `main` / `(root)` → Save.
3. Your site will be live at `https://<username>.github.io/<repo>/` within a
   few minutes.

## Access model

- **Public (no login)** can submit the registration form (creates a `teams`
  row + its `players` rows) and read `fixtures` (schedule, standings,
  Governor's Cup). Public visitors cannot read the `teams` or `players`
  tables at all — manager contact details, payment info, and other clubs'
  rosters stay private. A database trigger also forces every publicly
  submitted team to `approval_status = 'Pending'` and `payment_paid = false`
  regardless of what the client sends, and caps rosters at 25 players.
- **Admin** (any Supabase Auth user — sign in via the "Admin Login" button in
  the header) gets full read/write on `teams`, `players`, and `fixtures`:
  the Admin Directory tab, payment/approval editing, fixture generation, and
  score entry.

## Project structure

```
index.html                  the app shell
assets/css/styles.css       all styling
assets/js/config.js         your Supabase URL + anon key (edit this)
assets/js/app.js            app logic (tabs, forms, fixtures, standings)
assets/img/logo.png         logo extracted from the registration form PDF
assets/img/logo-transparent.png   same logo, white background keyed out
supabase/schema.sql         tables, RLS policies, triggers — run this once
```

## Not yet automated

Invoice/receipt emails on approval and payment are not wired up yet — the
admin directory lets you record `invoice_number`/`receipt_number` manually.
To automate them, add a [Supabase Edge Function](https://supabase.com/docs/guides/functions)
triggered by a `teams` row update (via a Database Webhook) that generates the
next sequential number and sends mail through a provider like Resend or
SendGrid using `manager_email`.

`ncd-games-manager.html` and `ncdgamesbase44-build-spec.md` are earlier
prototypes (a no-backend browser-storage demo, and a staged-prompt spec for
building the same app in Base44) kept for reference — `index.html` is the
live app.
