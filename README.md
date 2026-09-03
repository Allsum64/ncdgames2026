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

Any static file server works, e.g. (pick one):

```
npx serve .
# or, if you have Node but not `serve`:
node -e "require('http').createServer((q,r)=>require('fs').readFile('.'+(q.url==='/'?'/index.html':q.url),(e,d)=>e?(r.writeHead(404),r.end()):(r.writeHead(200),r.end(d)))).listen(8080)"
```

then open the printed `localhost` URL. (Opening `index.html` directly via
`file://` will not work — the browser blocks the Supabase client's requests
from a `file://` origin in some browsers, so serve it over HTTP.) In VS Code,
the **Live Server** extension does the same thing with a right-click →
"Open with Live Server" on `index.html`.

## 3. How to test it end-to-end

Once `config.js` has real Supabase credentials (step 1) and you have an admin
account, run through this once to confirm everything is wired up:

1. **Register tab** — fill out and submit the form as a fake team. You should
   see a "registered — pending approval" toast. In the Supabase dashboard →
   **Table Editor → teams**, confirm the row appeared with
   `approval_status = Pending` and `payment_paid = false` — even if you try
   to edit those fields in the form's dev tools, the database trigger resets
   them, so this is the guardrail to check.
2. **Admin Login** (top-right of the header) — sign in with the account you
   created in Supabase → Authentication → Users.
3. **Admin Directory tab** — your test team should now be visible (it isn't
   visible to the public). Open it, set **Approval Status** to `Approved`,
   click **Save Changes**, then reopen it: an **Invoice Number** should now
   be filled in automatically, with a **Print Invoice** button next to it.
   Click it — a new tab opens a formatted invoice and triggers the browser
   print dialog; choose "Save as PDF" as the destination to confirm it
   generates a clean PDF.
4. Back in the detail panel, set **Payment Received** to `Yes`, fill in
   amount/processed by/date, **Save Changes**, reopen it — a **Receipt
   Number** appears with its own **Print Receipt** button. Test that too.
5. **Fixtures tab** — with 2+ teams approved in the same sporting
   code/category/electorate, pick that pool and click **Generate Schedule**.
   Enter a score on one fixture and confirm it flips to "Played".
6. **Standings tab** — switch to the same pool and confirm the played match
   shows up in the table with the right points.
7. **Governor's Cup tab** — confirm the top-4 card for that pool reflects the
   same standings.
8. Log out (top-right) and confirm the **Admin Directory** tab now shows
   "Admin login required" instead of the team list, and that **Fixtures**
   still shows the schedule (read-only, no score inputs) — this is the
   public/admin split working correctly.

## 4. Deploy

This is a fully static site (Supabase is called directly from the browser —
no server-side code), so either of these works equally well:

**Vercel (recommended)** — get preview URLs on every push, easiest custom
domains:
1. [vercel.com](https://vercel.com) → **Add New → Project** → import the
   `ncdgames2026` GitHub repo.
2. Framework preset: **Other** (no build command, no output directory needed
   — it's already static). Deploy.
3. Every push to `main` auto-deploys; every other branch/PR gets its own
   preview URL, which is handy for testing changes before they go live.

**GitHub Pages** — simplest, zero third-party sign-up:
1. Repo → **Settings → Pages** → Source: `Deploy from a branch` → Branch:
   `main` / `(root)` → Save.
2. Live at `https://<username>.github.io/<repo>/` within a few minutes.

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

## Invoices & receipts

No email provider — invoices and receipts are generated as printable
documents instead:

- Setting a team's **Approval Status** to `Approved` auto-generates a
  sequential invoice number (`INV-2026-0001`, ...) via a Postgres function
  (`next_invoice_number()` in `schema.sql`), so numbering stays consistent
  even with multiple admins working at once.
- Ticking **Payment Received** auto-generates a receipt number the same way.
- Both show a **Print Invoice** / **Print Receipt** button in the Admin
  Directory once generated — it opens a formatted one-page document in a new
  tab and triggers the browser's print dialog; choose **Save as PDF** to get
  a downloadable file, or print it directly for someone paying in person.

`ncd-games-manager.html` and `ncdgamesbase44-build-spec.md` are earlier
prototypes (a no-backend browser-storage demo, and a staged-prompt spec for
building the same app in Base44) kept for reference — `index.html` is the
live app.
