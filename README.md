# MediBridge

A real-time emergency medical supply network connecting verified hospitals,
pharmacies, medical stores and suppliers.

> A verified hospital can search for a critical medicine, discover nearby
> verified organisations with sufficient real-time inventory, compare them by
> availability, distance, ETA and reliability, reserve stock, create an
> emergency order, and track that order until delivery.

---

## Repository layout

```text
Medi-bridge/
├── backend/     Node.js + Express + Supabase API
├── frontend/    Web client (built separately)
└── README.md
```

| Area | Status | Docs |
|---|---|---|
| Backend API | Working MVP, 99 passing tests | [`backend/README.md`](./backend/README.md) |
| API contract | Complete | [`backend/API.md`](./backend/API.md) |
| Database schema | Complete | [`backend/db/schema.sql`](./backend/db/schema.sql) |
| Frontend | Separate workstream | — |

---

## Running the backend

No Supabase credentials are needed to try it — the API can run against an
in-process database seeded with demo data:

```bash
cd backend
npm install
DB_DRIVER=memory SEED_ON_START=true npm run dev
```

PowerShell:

```powershell
cd backend
npm install
$env:DB_DRIVER="memory"; $env:SEED_ON_START="true"; npm run dev
```

Health check: <http://localhost:5000/api/health>

Demo accounts (all share the password `MediBridge#2026`):

- `admin@medibridge.dev`
- `hospital1@medibridge.dev`
- `pharmacy1@medibridge.dev`
- `supplier1@medibridge.dev`
- `courier1@medibridge.dev`

For a real Supabase deployment, see
[the backend README](./backend/README.md#running-against-supabase).

---

## For the frontend

[`backend/API.md`](./backend/API.md) documents every endpoint: method, URL,
auth requirement, request body, query parameters, response shape and possible
errors. It also has an integration notes section covering the things that most
often trip up a client — the verification gate, reservation expiry, and driving
order buttons from status rather than role.

Endpoint groups:

```text
/api/auth           /api/organizations   /api/medicines    /api/equipment
/api/inventory      /api/search          /api/reservations /api/orders
/api/deliveries     /api/notifications   /api/admin        /api/ai
/api/health
```

---

## What the backend does

- **Verification** — organisations register as `PENDING` and must be approved by
  an admin before they can trade. Unverified organisations never appear in
  search results. This is a human review workflow, not a check against any
  government licence register.
- **Live inventory** — every stock figure is returned with how recently it was
  counted (`FRESH` / `RECENT` / `STALE`), and stale figures rank lower.
- **Emergency search** — finds verified organisations that can actually cover a
  requested quantity, computes distance and ETA, and ranks them on a transparent
  weighted score whose breakdown is returned with every result.
- **Reservations** — atomic stock holds that expire after 10 minutes, so two
  hospitals can never be promised the same box.
- **Orders and delivery** — a validated status machine from `PENDING` through to
  `DELIVERED`, with stock leaving the shelf at dispatch and courier position
  tracking.
- **Notifications and audit** — in-app alerts for both parties and an
  append-only trail of who did what.

Ranking is a **logistics** recommendation about who can supply fastest and most
reliably. It is not a clinical judgement and has not been medically validated.

No real patient data is used anywhere in this project, including the demo seed.
