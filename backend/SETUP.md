# MediBridge Backend — Setup, step by step

Follow this top to bottom. Every step ends with a way to check it worked before
you move on.

Commands are written for **Windows PowerShell** (what you're on). If you prefer
Git Bash, the same commands work with `export VAR=value` instead of `$env:VAR="value"`.

---

## Contents

- [Step 0 — Check your machine is ready](#step-0--check-your-machine-is-ready)
- [Step 1 — Run it right now, with no Supabase](#step-1--run-it-right-now-with-no-supabase)
- [Step 2 — Create a Supabase project](#step-2--create-a-supabase-project)
- [Step 3 — Create the database tables](#step-3--create-the-database-tables)
- [Step 4 — Copy your Supabase credentials](#step-4--copy-your-supabase-credentials)
- [Step 5 — Create your .env file](#step-5--create-your-env-file)
- [Step 6 — Start the API against Supabase](#step-6--start-the-api-against-supabase)
- [Step 7 — Load the demo data](#step-7--load-the-demo-data)
- [Step 8 — Prove the whole flow works](#step-8--prove-the-whole-flow-works)
- [Step 9 — Hand over to the frontend developer](#step-9--hand-over-to-the-frontend-developer)
- [Step 10 — Deploy (optional)](#step-10--deploy-optional)
- [Troubleshooting](#troubleshooting)
- [Final checklist](#final-checklist)

---

## Step 0 — Check your machine is ready

Open PowerShell in the project folder:

```powershell
cd C:\Users\ADMIN\Medi-bridge\backend
node --version
npm --version
```

**You need Node 18 or newer.** If `node --version` prints v18 / v20 / v22 / v24,
you're fine.

Install the dependencies (they're already installed, but this is safe to re-run):

```powershell
npm install
```

**Check it worked:**

```powershell
npm test
```

You should see `pass 99` and `fail 0`. If that works, the entire backend is
functioning — before Supabase is even involved.

---

## Step 1 — Run it right now, with no Supabase

Do this before touching Supabase, so you know the difference between "my code is
broken" and "my Supabase config is wrong."

```powershell
$env:DB_DRIVER="memory"; $env:SEED_ON_START="true"; npm run dev
```

You should see:

```text
[medibridge] SEED_ON_START is set - loading demo data...
[medibridge] seeded 60 organisations, 112 medicines, 1799 inventory rows.
[medibridge] API listening on http://localhost:5000
```

**Check it worked** — open a *second* PowerShell window:

```powershell
curl.exe http://localhost:5000/api/health
```

You should get `{"status":"ok","service":"MediBridge API",...}`.

Stop the server with `Ctrl+C` when you're done looking.

> **What just happened:** the API ran against an in-memory database. Everything
> works, but the data vanishes when you stop the server. That's fine for a demo
> and for tests. Supabase is what makes it permanent — that's Steps 2–7.

---

## Step 2 — Create a Supabase project

1. Go to <https://supabase.com> and sign in (GitHub login is quickest).
2. Click **New project**.
3. Fill in:
   - **Name:** `medibridge`
   - **Database Password:** click *Generate a password* and **save it somewhere**.
     You won't need it for this backend, but you'll want it if you ever connect
     with `psql` or a GUI.
   - **Region:** pick the one closest to you (e.g. `South Asia (Mumbai)`).
4. Click **Create new project**.

Setup takes 1–2 minutes. Wait until the dashboard stops saying "Setting up
project".

**Check it worked:** you can see the project dashboard with a sidebar containing
*Table Editor*, *SQL Editor*, *Authentication*, *Settings*.

---

## Step 3 — Create the database tables

This is the step people skip, and then nothing works.

1. In the Supabase sidebar, click **SQL Editor**.
2. Click **New query**.
3. Open the file `backend/db/schema.sql` in VS Code.
4. **Select all of it** (`Ctrl+A`) and **copy** (`Ctrl+C`).
5. **Paste** it into the Supabase SQL editor.
6. Click **Run** (or press `Ctrl+Enter`).

You should see **"Success. No rows returned"**.

> The file is safe to run more than once — every statement uses
> `create ... if not exists` or `create or replace`. If you're unsure whether it
> ran, just run it again.

**Check it worked:**

- Click **Table Editor** in the sidebar. You should see 12 tables:
  `audit_logs`, `deliveries`, `equipment`, `inventory`, `medicines`,
  `notifications`, `order_items`, `orders`, `organizations`, `profiles`,
  `reservations`, `verification_documents`.
- Go back to **SQL Editor**, new query, and run this to confirm the atomic stock
  functions exist:

  ```sql
  select routine_name
  from information_schema.routines
  where routine_name in ('reserve_inventory', 'release_inventory', 'consume_inventory');
  ```

  You should get **3 rows**. These are what stop two hospitals from being
  promised the same box of medicine. If they're missing, re-run `schema.sql`.

---

## Step 4 — Copy your Supabase credentials

In the Supabase sidebar, click the **gear icon (Project Settings)**, then
**API Keys** (on older projects this page is just called **API**).

You need **two** values:

### 4a. Project URL

Under **Project URL** (sometimes under *Settings → General* or *Settings → Data API*).
It looks like:

```text
https://abcdefghijklmnop.supabase.co
```

Copy it.

### 4b. The service role key

On the API Keys page you'll see two keys. Depending on how new your project is,
they're named either:

| Older naming | Newer naming | Use it? |
|---|---|---|
| `anon` `public` | `publishable` | ❌ Not needed by this backend |
| `service_role` `secret` | `secret` | ✅ **This is the one you need** |

Click **Reveal** / the eye icon next to the **service_role / secret** key and
copy it. It's a long string.

> ### ⚠️ Two things about this key
>
> 1. **It bypasses all database security.** Anyone holding it has full read and
>    write access to your database. Never put it in frontend code, never paste it
>    into a chat or a screenshot, never commit it.
> 2. **Never give it to the frontend developer.** The frontend talks to *your
>    API*, not to Supabase directly. It only ever needs
>    `http://localhost:5000/api` and a login token.
>
> If you ever leak it, go to the same page and click **Reset** / **Roll** to
> generate a new one.

### About `SUPABASE_ANON_KEY`

You'll see `SUPABASE_ANON_KEY=` in `.env.example`. **You can leave it blank.**
This backend never uses it — it's there only because a future feature might.
The API needs `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`, nothing else.

---

## Step 5 — Create your .env file

First generate a JWT secret. This signs your users' login tokens — it must be
long and random, and it is *not* a Supabase value:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

Copy the 64-character string it prints.

Now create the file:

```powershell
Copy-Item .env.example .env
notepad .env
```

Fill in these four lines (leave everything else as it is):

```env
DB_DRIVER=supabase

SUPABASE_URL=https://abcdefghijklmnop.supabase.co
SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=paste-your-service-role-key-here

JWT_SECRET=paste-the-64-character-string-here
```

Save and close Notepad.

**Check it worked:**

```powershell
git check-ignore -v .env
```

This must print `.gitignore:7:.env  .env`. That confirms git will **never**
commit your secrets. If it prints nothing, stop and fix `.gitignore` before
going further.

> **Common mistakes:** no quotes around values, no spaces around the `=`, and
> make sure the whole key pasted on one line — long keys sometimes wrap.

---

## Step 6 — Start the API against Supabase

```powershell
npm run dev
```

You should see:

```text
[medibridge] API listening on http://localhost:5000
[medibridge] environment: development | database driver: supabase
```

The important part is **`database driver: supabase`**. If it says `memory`, your
`.env` isn't being read — check the file is named exactly `.env` (not
`.env.txt`, which Notepad sometimes does) and is in the `backend` folder.

**Check it worked** — in a second PowerShell window:

```powershell
curl.exe http://localhost:5000/api/health
```

Look for `"reachable":true`:

```json
{"status":"ok","service":"MediBridge API","database":{"driver":"supabase","reachable":true}}
```

If `reachable` is `false`, the message next to it tells you what's wrong. See
[Troubleshooting](#troubleshooting).

---

## Step 7 — Load the demo data

Leave the server running. In your **second** PowerShell window:

```powershell
cd C:\Users\ADMIN\Medi-bridge\backend
npm run seed
```

This takes 30–90 seconds against Supabase (it's writing about 4,000 rows over
the network). You should see:

```text
  medicines            112
  equipment            50
  organizations        60 (20 hospitals, 30 pharmacies, 10 suppliers)
  profiles             69
  documents            120
  inventory            1799
  orders               40

[seed] done. Demo accounts (all share one password):
  password: MediBridge#2026
  admin:    admin@medibridge.dev
  hospital: hospital1@medibridge.dev
  pharmacy: pharmacy1@medibridge.dev
  supplier: supplier1@medibridge.dev
  courier:  courier1@medibridge.dev
```

**Check it worked:** in Supabase → **Table Editor** → `organizations`. You
should see 60 rows with real-looking names, coordinates and a mix of `VERIFIED`
and `PENDING` statuses.

> **If it says "The database already holds N organisation(s)"** — that's a
> safety guard so you don't double-seed by accident. Either you already ran it,
> or you want to add more anyway with `npm run seed -- --force`.
>
> **To start completely fresh:** run this in the Supabase SQL editor, then seed
> again:
>
> ```sql
> truncate table audit_logs, notifications, deliveries, reservations,
>   order_items, orders, inventory, verification_documents,
>   profiles, organizations, medicines, equipment restart identity cascade;
> ```

---

## Step 8 — Prove the whole flow works

This is the demo. Run it in your second PowerShell window with the server still
running.

> **Use `Invoke-RestMethod`, not `curl`.** Windows PowerShell 5.1 mangles
> arguments passed to `curl.exe` when they contain both quotes and spaces — your
> JSON arrives truncated and the API rightly rejects it. `Invoke-RestMethod` is
> PowerShell's own HTTP client and has no such problem. (In Git Bash, plain
> `curl` works fine.)

### 8a. Log in as a hospital

```powershell
$base = "http://localhost:5000/api"

$body  = @{ email = "hospital1@medibridge.dev"; password = "MediBridge#2026" } | ConvertTo-Json
$login = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body $body

$auth = @{ Authorization = "Bearer $($login.data.token)" }
$login.data.organization.name
```

You should see a hospital name printed, e.g. `Aster Central Hospital`. If you get
an error, the seed probably didn't run.

### 8b. Find a medicine

```powershell
$med   = Invoke-RestMethod -Uri "$base/medicines?search=adrenaline&limit=1" -Headers $auth
$medId = $med.data[0].id
$med.data[0].name
```

### 8c. Run an emergency supplier search — the core feature

```powershell
$search = Invoke-RestMethod -Headers $auth `
  -Uri "$base/search/suppliers?medicineId=$medId&quantity=10&maximumEtaMinutes=45"

$search.data.results | Select-Object -First 5 supplierName, stock, distanceKm,
  estimatedMinutes, stockFreshness, reliabilityScore, recommendationScore, recommended |
  Format-Table
```

You should get a ranked table like:

```text
supplierName              stock distanceKm estimatedMinutes stockFreshness reliabilityScore recommendationScore recommended
------------              ----- ---------- ---------------- -------------- ---------------- ------------------- -----------
Pinnacle Pharma Trading     325       2.09               12 RECENT                       79                  90        True
Prime Care Chemists         171       2.16               13 STALE                        80                  82       False
```

**That is MediBridge working:** real inventory, real distances, ETAs, stock
freshness, reliability, and a transparent ranking — with unverified
organisations filtered out automatically.

### 8d. Try the AI parser

```powershell
$ask = @{ text = "We urgently need 20 adrenaline injections within 30 minutes." } | ConvertTo-Json

$parsed = Invoke-RestMethod -Uri "$base/ai/parse-request" -Method Post -Headers $auth `
  -ContentType "application/json" -Body $ask

$parsed.data | Select-Object medicine, quantity, priority, maximumEtaMinutes, confidence
```

Expect `quantity: 20`, `priority: CRITICAL`, `maximumEtaMinutes: 30`,
`confidence: HIGH`, and a real medicine name from your catalogue.

### 8e. Log in as the admin

```powershell
$adminBody  = @{ email = "admin@medibridge.dev"; password = "MediBridge#2026" } | ConvertTo-Json
$admin      = Invoke-RestMethod -Uri "$base/auth/login" -Method Post -ContentType "application/json" -Body $adminBody
$adminAuth  = @{ Authorization = "Bearer $($admin.data.token)" }

$queue = Invoke-RestMethod -Uri "$base/admin/verifications?status=PENDING" -Headers $adminAuth
$queue.data | Select-Object name, type, verificationStatus | Format-Table
```

You'll see the organisations waiting for approval — the verification queue your
admin UI will render.

**If all five of these work, your backend is done and connected.**

---

## Step 9 — Hand over to the frontend developer

Send them exactly this:

> - **API base URL:** `http://localhost:5000/api`
> - **Full endpoint documentation:** `backend/API.md` — every route, request
>   body, response shape and error code, plus an integration-notes section at
>   the bottom.
> - **Demo logins:** password `MediBridge#2026`, accounts
>   `admin@medibridge.dev`, `hospital1@medibridge.dev`,
>   `pharmacy1@medibridge.dev`, `supplier1@medibridge.dev`,
>   `courier1@medibridge.dev`
> - **How auth works:** call `POST /api/auth/login`, store `data.token`, then
>   send `Authorization: Bearer <token>` on every request.

**If their dev server runs on a port other than 5173**, add it to your `.env`
or their requests will be blocked by CORS:

```env
CLIENT_URL=http://localhost:5173,http://localhost:3000
```

Restart the API after changing it.

**They do not need**: your Supabase URL, your service role key, or a Supabase
account. They talk only to your API.

---

## Step 10 — Deploy (optional)

Only worth doing if you need the frontend to reach the API from another machine
during judging. [Render](https://render.com) has a free tier and works well.

1. Push your code to GitHub (`.env` will not be included — that's correct).
2. On Render: **New → Web Service**, connect the repo.
3. Settings:
   - **Root Directory:** `backend`
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
4. Add environment variables (Render's *Environment* tab) — **type them in
   there, never commit them**:

   ```text
   NODE_ENV=production
   DB_DRIVER=supabase
   SUPABASE_URL=https://....supabase.co
   SUPABASE_SERVICE_ROLE_KEY=...
   JWT_SECRET=<your 64-character secret>
   CLIENT_URL=https://your-frontend-url.vercel.app
   ```

5. Deploy, then check `https://your-api.onrender.com/api/health`.

> In production the API refuses to start if `JWT_SECRET` is missing or shorter
> than 32 characters, or if `DB_DRIVER=memory`. That's deliberate — it fails
> loudly at boot instead of silently doing something unsafe.

---

## Troubleshooting

| What you see | What it means | Fix |
|---|---|---|
| `database driver: memory` when you expected supabase | `.env` isn't being read | Check the file is `backend\.env` exactly — Notepad may have saved `.env.txt`. Run `Get-ChildItem -Force .env` to see the real name. |
| `SUPABASE_URL is required when DB_DRIVER=supabase` | Blank or missing value | Fill it in `.env`, no quotes, no trailing spaces. |
| `"reachable": false` on `/api/health` | API can't talk to Supabase | Wrong URL or key. Re-copy both from Settings → API Keys. Make sure you copied the **service_role / secret** key, not the anon/publishable one. |
| `relation "medicines" does not exist` | Step 3 wasn't run | Run `db/schema.sql` in the Supabase SQL editor. |
| `Could not find the function public.reserve_inventory` | Schema ran only partly | Re-run the whole of `db/schema.sql`. |
| `[seed] The database already holds 60 organisation(s)` | Seed guard | Expected. Use `npm run seed -- --force`, or truncate first (SQL in Step 7). |
| Seed fails partway with a payload error | Very large batch | Already handled — inserts are chunked at 500 rows. If it still fails, your network dropped; truncate and re-run. |
| `403 ORGANIZATION_NOT_VERIFIED` | Working as designed | That account's organisation isn't approved yet. Use `hospital1@`, `pharmacy1@` or `supplier1@` (always verified), or approve it via `PATCH /api/admin/verifications/:id` as admin. |
| `401 UNAUTHENTICATED` | Missing or stale token | Log in again and send `Authorization: Bearer <token>`. |
| Frontend gets a CORS error | Their origin isn't allow-listed | Add it to `CLIENT_URL` in `.env` (comma-separated) and restart. |
| `Supplier ranking weights must add up to 1` | You edited a `RANK_WEIGHT_*` | The five weights must total exactly 1.0. |
| Port 5000 already in use | Something else is on it | `$env:PORT="5001"; npm run dev` |
| `400 VALIDATION_ERROR: The request body is not valid JSON` when using `curl.exe` in PowerShell | PowerShell 5.1 splits `curl.exe` arguments that contain both quotes and spaces, so only part of your JSON is sent | Use `Invoke-RestMethod` as shown in Step 8, or run the `curl` command from Git Bash instead. |

---

## Final checklist

- [ ] `npm test` → 99 passing
- [ ] Supabase project created
- [ ] `db/schema.sql` run → 12 tables + 3 functions exist
- [ ] `.env` created with `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `JWT_SECRET`
- [ ] `git check-ignore -v .env` confirms it's ignored
- [ ] `npm run dev` shows `database driver: supabase`
- [ ] `/api/health` shows `"reachable": true`
- [ ] `npm run seed` completed
- [ ] Supplier search (Step 8c) returns a ranked list
- [ ] Frontend developer has `API.md`, the base URL and the demo logins
- [ ] Service role key has **not** been shared, committed or screenshotted

---

## Quick reference

```powershell
# Run against Supabase (needs .env)
npm run dev

# Run with no Supabase at all, demo data included
$env:DB_DRIVER="memory"; $env:SEED_ON_START="true"; npm run dev

# Load demo data into Supabase
npm run seed
npm run seed -- --force    # add on top of existing data

# Run the tests (never touches Supabase)
npm test

# Generate a JWT secret
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

| File | What it's for |
|---|---|
| `SETUP.md` | This guide |
| `README.md` | How the backend works and why |
| `API.md` | Every endpoint — give this to the frontend developer |
| `db/schema.sql` | Run once in Supabase |
| `.env.example` | Template — copy to `.env` and fill in |
| `.env` | Your real secrets. Never committed. |
