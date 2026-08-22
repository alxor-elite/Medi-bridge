# MediBridge — Backend

Real-time emergency medical supply network. A verified hospital can search for a
critical medicine, find nearby verified organisations with sufficient live
inventory, compare them by availability / distance / ETA / reliability, reserve
stock, place an emergency order, and track it until delivery.

This directory is the API only. The frontend lives in `../frontend` and is built
separately; the contract between them is [`API.md`](./API.md).

---

## Quick start

You do **not** need Supabase credentials to run or demo this.

```bash
cd backend
npm install

# Run with an in-process database, seeded with demo data at boot
DB_DRIVER=memory SEED_ON_START=true npm run dev
```

On Windows PowerShell:

```powershell
$env:DB_DRIVER="memory"; $env:SEED_ON_START="true"; npm run dev
```

Then:

```bash
curl http://localhost:5000/api/health
```

The seed prints the demo accounts. They all share one password:

| Account | Email | Password |
|---|---|---|
| Admin | `admin@medibridge.dev` | `MediBridge#2026` |
| Hospital | `hospital1@medibridge.dev` | `MediBridge#2026` |
| Pharmacy (sells stock) | `pharmacy1@medibridge.dev` | `MediBridge#2026` |
| Distributor (sells stock) | `supplier1@medibridge.dev` | `MediBridge#2026` |
| Courier | `courier1@medibridge.dev` | `MediBridge#2026` |

The demo network has 20 hospitals, 30 pharmacies, 10 suppliers, 112 medicines,
50 equipment items, ~1,800 inventory batches and 40 historical orders, all
scattered around Bengaluru. A few organisations are deliberately left
unverified so you can see that they never appear in search results.

---

## Running against Supabase

1. Create a Supabase project.
2. Run [`db/schema.sql`](./db/schema.sql) in the SQL editor. It is idempotent.
3. Copy `.env.example` to `.env` and fill in:

```env
SUPABASE_URL=https://xxxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...
JWT_SECRET=<openssl rand -hex 32>
DB_DRIVER=supabase
```

4. Seed and start:

```bash
npm run seed
npm start
```

The service role key is used by the API process only. It bypasses row level
security, so **never** send it to the frontend. Every access rule in this
codebase is enforced in middleware and services; RLS is enabled and deny-by-
default so a stray anon-key query gets nothing.

---

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Start with nodemon. |
| `npm start` | Start normally. |
| `npm run seed` | Load demo data (`--force` to add on top of existing data). |
| `npm test` | Run the test suite (99 tests, no external services needed). |

---

## Architecture

```text
Route  →  Controller  →  Service  →  db facade  →  driver  →  Postgres / memory
```

- **Routes** declare the path, the auth gates and the express-validator rules.
- **Controllers** translate HTTP to service calls. No business rules.
- **Services** hold every rule: ownership, state machines, stock arithmetic.
- **`src/db`** is a small facade with two interchangeable drivers.

```text
src/
├── config/      constants (every enum and state machine) and env validation
├── db/          driver facade + supabase and memory drivers
├── middleware/  auth, role gates, validation, centralised error handling
├── routes/      the API surface
├── controllers/ HTTP glue
├── services/    the business rules
├── utils/       geo, freshness, ranking, security, response envelopes
└── app.js       express app (exported without listening, so tests can drive it)
```

### The two drivers

`DB_DRIVER=supabase` is the real database. `DB_DRIVER=memory` is an in-process
store implementing the identical driver interface, used for local development
and the whole test suite. No service knows which one is active, so the tests
exercise the real routes, middleware and services — nothing is stubbed.
`env.js` refuses to boot the memory driver in production.

---

## The parts worth knowing about

### Stock can never be oversold

`available = quantity - reserved_quantity`, and it can never go negative.

Reserving is a **single atomic operation**, not a read-then-write: under
Supabase it is a Postgres function whose check lives in the `UPDATE ... WHERE`
clause (see `reserve_inventory` in `db/schema.sql`); in memory it is a mutex.
Ten simultaneous 30-unit requests against a 100-unit batch produce exactly three
successes and seven refusals. That case is a test.

A multi-batch reservation is all-or-nothing — a failed line releases the lines
already taken.

### Stock leaves the shelf at dispatch, not at order time

Reserving moves units from available into reserved; the total is unchanged,
because the goods are still physically there. `DISPATCHED` is what decrements
the total. Cancelling before dispatch returns the stock; cancelling after
dispatch does not, because inventing units back onto a shelf would be a lie.

### Reservations expire

Default 10 minutes (`RESERVATION_TTL_MINUTES`), swept every 30 seconds and also
checked on every reservation read and write, so an abandoned search cannot
freeze supply.

### Verification is the whole promise

Organisations start `PENDING`. Unverified organisations are filtered out of
every search and blocked from trading endpoints. Verification is a **human
admin decision** recorded through `/api/admin/verifications` — MediBridge does
not check licences against any government register and does not claim to.

### Ranking is transparent

Five weighted components (ETA 40%, distance 25%, stock 20%, reliability 10%,
price 5%), all configurable in `.env`, each normalised against the other
candidates in the same search. Every response includes `scoreBreakdown` with
the weights used, so the UI can explain a ranking. It is a **logistics**
recommendation, not a clinical one.

### Freshness is reported, not assumed

Every inventory figure carries how long ago it was updated — `FRESH` (<30 min),
`RECENT` (<6 h), `STALE` — and stale stock is discounted in ranking. "45 in
stock, counted 4 minutes ago" is a different claim from the same number counted
yesterday.

### The AI never invents inventory

The emergency parser extracts intent (quantity, deadline, urgency) and resolves
the medicine against the real catalogue. It cannot name a product that is not
in the database, and every supplier, price and stock figure comes from the
normal search path. It is deterministic and rule-based: no API key, no external
call, nothing to hallucinate with.

---

## Testing

```bash
npm test
```

99 tests across nine files, all against the real app over HTTP:

| File | Covers |
|---|---|
| `auth.test.js` | Registration, login, token handling, role gates. |
| `organization.test.js` | Verification workflow, private-field projections, document access. |
| `inventory.test.js` | Ownership, freshness classification, the non-negative invariant. |
| `search.test.js` | Verified-only filtering, availability, distance, ranking order. |
| `reservation.test.js` | Concurrency, all-or-nothing holds, expiry. |
| `order.test.js` | The status state machine and who may drive it. |
| `delivery.test.js` | Delivery transitions and per-record access. |
| `ai.test.js` | Parsing, refusal to invent, shortage forecast. |
| `acceptance.test.js` | The full brief §32 flow, HTTP only, end to end. |

`acceptance.test.js` is the one to run if you only run one — it walks
registration → verification → catalogue → stock → search → reserve → order →
accept → prepare → dispatch → deliver, and asserts the stock arithmetic,
notifications and audit trail along the way.

---

## Configuration

Everything tunable lives in `.env` (see `.env.example`):

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | 5000 | |
| `DB_DRIVER` | `supabase` | `supabase` or `memory`. |
| `SEED_ON_START` | `false` | Load demo data at boot if the database is empty. |
| `JWT_SECRET` | — | Required in production; min 32 chars. |
| `JWT_EXPIRES_IN` | `7d` | |
| `BCRYPT_SALT_ROUNDS` | 10 | |
| `CLIENT_URL` | `http://localhost:5173` | Comma-separated CORS allow-list. |
| `FRESHNESS_FRESH_MINUTES` | 30 | |
| `FRESHNESS_RECENT_MINUTES` | 360 | |
| `RESERVATION_TTL_MINUTES` | 10 | |
| `RANK_WEIGHT_*` | .40/.25/.20/.10/.05 | Must sum to 1; validated at boot. |
| `AVERAGE_SPEED_KMH` | 28 | Used for the straight-line ETA. |
| `DISPATCH_OVERHEAD_MINUTES` | 8 | Picking and handover time. |

Misconfiguration fails at boot with a readable message, not on the first
request.

---

## Known limitations

Honest list, for whoever picks this up next.

- **Distance is straight-line (Haversine), not road distance.** ETA is
  `distance / average speed + overhead`. `src/utils/geo.js` is the single place
  to swap in a routing provider; nothing that calls it needs to change.
- **Verification is a mock workflow.** A human admin reviews uploaded document
  links. No government register is contacted.
- **Reliability is a simple delivered/finished ratio** over a supplier's orders,
  and only after it has at least three finished orders. New organisations sit at
  a neutral 75.
- **Multi-batch reservations are not one database transaction.** They use a
  compensating rollback: a failed line releases the lines already taken. Under
  Supabase this could be tightened into a single Postgres function.
- **Notifications are in-app only** — rows the frontend polls. No SMS or email.
- **Delivery tracking is push-based**, from the courier calling
  `PATCH /api/deliveries/:id/location`. There is no websocket channel yet.
- **The shortage forecast is a moving average**, not a trained model, and says
  so in its own response.
