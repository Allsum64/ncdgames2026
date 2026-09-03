# NCD Games 2026 — Base44 Build Spec

Base44 builds best from staged prompts rather than one giant one — each stage below
is a chunk you paste in, review, then move to the next. This avoids the "AI fixes
bugs it introduced" credit spiral reviewers mention, and lets you confirm the data
model before automation gets layered on top of it.

---

## 1. Data model (entities)

**Team**
| Field | Type | Notes |
|---|---|---|
| clubName | text | required |
| sportingCode | select | Rugby League, Rugby 7s, Touch Footy, Volleyball, Basketball, Soccer, Netball |
| category | select | Men, Women |
| electorate | select | Moresby North-East, Moresby North-West, Moresby South |
| community | text | ward/settlement |
| teamColors | text | |
| motto | text | optional |
| managerGivenName / managerSurname / managerGender / managerPhone / managerEmail / managerAddress / managerOccupation | text | managerEmail required |
| captainGivenName / captainSurname / captainPhone / captainEmail | text | |
| coachName / coachPhone / assistantCoachName / assistantCoachPhone / trainerName / trainerPhone / doctorName / doctorPhone | text | |
| approvalStatus | select | Pending (default), Approved, Rejected |
| approvalComments | text | |
| poolZone | text | |
| teamIdNumber | text | |
| paymentPaid | boolean | default false |
| paymentAmount | number | default 500 |
| paymentProcessedBy | text | |
| paymentDateReceived | date | |
| invoiceNumber | text | set by automation, not user-entered |
| invoiceIssuedAt | datetime | set by automation |
| receiptNumber | text | set by automation |
| receiptIssuedAt | datetime | set by automation |

**Player**
| Field | Type | Notes |
|---|---|---|
| team | reference → Team | |
| fullName | text | required |
| dob | date | |
| contact | text | |
| position | text | |

**Fixture**
| Field | Type | Notes |
|---|---|---|
| sportingCode / category / electorate | select | defines the pool |
| round | number | |
| matchDate | date | |
| teamA / teamB | reference → Team | |
| scoreA / scoreB | number | nullable until played |
| played | boolean | default false |

Keep invoice/receipt as fields on Team rather than separate entities unless you expect
multiple invoices per team (e.g. partial payments) — one team, one fee, one of each is
enough for this competition.

---

## 2. Roles & access rules

- **Public (no login)**: can *create* Team + Player records (the registration form
  itself), and can *read* Fixture + read-only Team fields needed for public
  standings (clubName, sportingCode, category, electorate — not manager contact
  details or payment info). Cannot read other teams' registration data or edit
  anything.
- **Admin** (Base44 built-in auth, role = admin/staff): full read/write on Team,
  Player, Fixture. Only admins can change `approvalStatus`, `paymentPaid`, generate
  fixtures, or edit scores.

Set this up as Base44 entity security rules: Team → create: public, read: admin
(+ a restricted public view for standings), update/delete: admin only. Fixture →
read: public, write: admin only.

---

## 3. Screens

1. **Register** (public) — the form, creates one Team + its Players in one submit.
2. **Admin Dashboard** (auth required) — filterable team list, approve/reject,
   payment entry, invoice/receipt actions.
3. **Team Detail** (auth) — full record + invoice/receipt history + "Resend email"
   buttons.
4. **Fixtures & Standings** (public) — read-only schedule and league table per pool.
5. **Governor's Cup Qualifiers** (public) — top 4 per pool.

---

## 4. Backend automation (this is what solves the email problem)

Base44 backend functions can run on entity events and call its built-in email
integration directly — no mailto workaround needed.

**On Team update, when `approvalStatus` changes to `Approved` and `invoiceNumber`
is empty:**
1. Generate `invoiceNumber` sequentially, e.g. `INV-2026-0001`.
2. Set `invoiceIssuedAt` = now.
3. Send an email to `managerEmail`: invoice number, K500 due, where to pay
   (NCDC Sports Office, Level 1, City Hall), team details.

**On Team update, when `paymentPaid` becomes `true` and `receiptNumber` is empty:**
1. Generate `receiptNumber` sequentially, e.g. `RCT-2026-0001`.
2. Set `receiptIssuedAt` = now.
3. Send a receipt email to `managerEmail`: receipt number, amount paid, date
   received, processed by.

**Fixture generation function** — input: sportingCode + category + electorate.
Pulls all Approved teams matching that pool, runs a round-robin pairing, and
creates Fixture records with dates spread across Thursdays/Fridays from
10 Sept to 13 Nov 2026.

**Standings** — a function (or a frontend aggregation query) that reads all played
Fixtures for a pool and computes played/won/drawn/lost/for/against/points
(win = 3, draw = 1, loss = 0), sorted by points then goal difference.

---

## 5. Staged prompts

### Stage 1 — paste this first
```
Build an app called "NCD Games 2026 Competition Manager" for a community sports
tournament in Port Moresby, Papua New Guinea, run across 7 sporting codes
(Rugby League, Rugby 7s, Touch Footy, Volleyball, Basketball, Soccer, Netball),
2 categories (Men, Women), and 3 electorates (Moresby North-East,
Moresby North-West, Moresby South).

Create these entities:
- Team: clubName, sportingCode, category, electorate, community, teamColors,
  motto, managerGivenName, managerSurname, managerGender, managerPhone,
  managerEmail, managerAddress, managerOccupation, captainGivenName,
  captainSurname, captainPhone, captainEmail, coachName, coachPhone,
  assistantCoachName, assistantCoachPhone, trainerName, trainerPhone,
  doctorName, doctorPhone, approvalStatus (Pending/Approved/Rejected, default
  Pending), approvalComments, poolZone, teamIdNumber, paymentPaid (boolean,
  default false), paymentAmount (number, default 500), paymentProcessedBy,
  paymentDateReceived, invoiceNumber, invoiceIssuedAt, receiptNumber,
  receiptIssuedAt.
- Player: reference to Team, fullName, dob, contact, position.
- Fixture: sportingCode, category, electorate, round, matchDate, reference
  teamA, reference teamB, scoreA, scoreB, played (boolean).

Build a public registration page where anyone (no login required) can register a
team: team info, manager, captain, up to 25 players, and officials, matching a
standard sports registration form. On submit, create the Team record and its
Player records. Public users should not be able to see other teams' data.

Add an authenticated admin area (require login, admin role) with a dashboard
listing all teams, filterable by sporting code, category, electorate, and
approval status, with a detail view to edit approvalStatus, paymentPaid,
paymentAmount, paymentProcessedBy, paymentDateReceived, poolZone, and
teamIdNumber.
```

### Stage 2 — after Stage 1 works, paste this
```
Add a backend function that triggers when a Team's approvalStatus is updated to
"Approved" and invoiceNumber is empty: generate invoiceNumber as
"INV-2026-" + a zero-padded sequential number, set invoiceIssuedAt to now, and
send an email to the team's managerEmail with the invoice number, amount due
(K500), and payment instructions (pay at the NCDC Sports Office, Level 1, City
Hall, quoting the invoice number).

Add a second backend function that triggers when paymentPaid is updated to true
and receiptNumber is empty: generate receiptNumber as "RCT-2026-" + a
zero-padded sequential number, set receiptIssuedAt to now, and send a receipt
email to managerEmail confirming the amount paid, date received, and processed
by.

On the admin Team Detail page, show the invoice and receipt numbers/dates once
generated, with a "Resend invoice email" / "Resend receipt email" button that
re-sends the same email on demand.
```

### Stage 3 — fixtures
```
Add a backend function "generateFixtures" that takes sportingCode, category, and
electorate, fetches all Teams with that combination and approvalStatus =
Approved, and if there are 2 or more, generates a round-robin schedule (every
team plays every other team once) using the circle method, assigning byes for
odd numbers. Spread the rounds across match days that fall on Thursdays or
Fridays between 10 September 2026 and 13 November 2026 inclusive, cycling back
to the start of the date list if there are more rounds than available match
days. Create one Fixture record per match.

On the admin Fixtures page, let an admin pick a sporting code + category +
electorate combination and click "Generate Schedule" to run this function.
Show the generated fixtures grouped by round with editable score fields; when
both scores are entered, mark played = true.
```

### Stage 4 — standings & public pages
```
Add a public (no login) Fixtures & Standings page. For a selected sporting code
+ category + electorate, show:
1. The fixture schedule with dates and scores (read-only).
2. A standings table computed from played fixtures: played, won, drawn, lost,
   for, against, difference, points (win = 3, draw = 1, loss = 0), sorted by
   points then difference.

Add a "Governor's Cup Qualifiers" public page showing, for every combination of
sporting code + category + electorate that has approved teams, the current top
4 teams by standings, since the top 4 per pool advance to the NCD Governor's
Cup (15 December 2026 – 15 January 2027).
```

---

## 6. Notes before you start

- Base44's database and backend live inside its own managed environment — if you
  later want to move off Base44, only the frontend exports cleanly; the backend
  and data model would need rebuilding elsewhere. Worth knowing going in, not a
  blocker for this use case.
- Confirm in Base44's email integration settings what "from" address will be used
  for invoice/receipt emails, and consider adding SPF/DKIM if you want it to look
  official rather than land in spam.
- If you want a downloadable PDF invoice/receipt rather than just an email body,
  check Base44's current file-generation capabilities when you get to Stage 2 —
  that capability set changes fairly often, so worth checking their docs at that
  point rather than assuming.
