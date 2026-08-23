# MediBridge API

Base URL: `http://localhost:5000/api`

Every endpoint below is implemented and covered by the test suite (`npm test`).
If an endpoint changes, this document changes with it.

---

## Contents

1. [Conventions](#1-conventions)
2. [Authentication](#2-authentication--apiauth)
3. [Organizations](#3-organizations--apiorganizations)
4. [Admin](#4-admin--apiadmin)
5. [Medicines](#5-medicines--apimedicines)
6. [Equipment](#6-equipment--apiequipment)
7. [Inventory](#7-inventory--apiinventory)
8. [Emergency search](#8-emergency-search--apisearch)
9. [Reservations](#9-reservations--apireservations)
10. [Orders](#10-orders--apiorders)
11. [Deliveries](#11-deliveries--apideliveries)
12. [Notifications](#12-notifications--apinotifications)
13. [AI](#13-ai--apiai)
14. [Health](#14-health--apihealth)
15. [Error codes](#15-error-codes)

---

## 1. Conventions

### Response envelope

Every response uses one of two shapes.

**Success**

```json
{
  "success": true,
  "data": {},
  "meta": { "limit": 50, "offset": 0, "count": 12 }
}
```

`meta` appears on list endpoints and carries paging information.

**Error**

```json
{
  "success": false,
  "error": {
    "code": "INVENTORY_NOT_AVAILABLE",
    "message": "Requested quantity is not available.",
    "details": []
  }
}
```

`details` is present on validation errors and carries `{ field, message }` per
problem. Stack traces are never returned in production.

### Authentication

Send the JWT from register/login on every protected request:

```http
Authorization: Bearer <token>
```

The token carries the user id, role and organisation id, but the server
re-reads the profile and organisation on every request — so a verification or
role change takes effect immediately, without the user signing in again.

### Roles

| Role | Who it is |
|---|---|
| `HOSPITAL` | Buys supplies. Searches, reserves, orders, confirms delivery. |
| `SUPPLIER` | Sells supplies (pharmacies, medical stores, distributors). Holds inventory, accepts and dispatches orders. |
| `DELIVERY` | Courier. Belongs to no organisation; is assigned per delivery. |
| `ADMIN` | Platform operator. Verifies organisations, reads the audit trail. |

### Verification gate

Most trading endpoints require the caller's organisation to be `VERIFIED`.
An unverified caller gets `403 ORGANIZATION_NOT_VERIFIED`. Admins are exempt.

### Paging

List endpoints accept `?limit=` and `?offset=`. Defaults are noted per endpoint.

---

## 2. Authentication — `/api/auth`

### `POST /api/auth/register`

Public. Creates a user, and optionally the organisation they belong to. A new
organisation always starts `PENDING`.

**Body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `email` | string | yes | Must be unique. |
| `password` | string | yes | Minimum 8 characters. |
| `fullName` | string | yes | |
| `phone` | string | no | |
| `role` | enum | yes | `HOSPITAL`, `SUPPLIER` or `DELIVERY`. `ADMIN` is not accepted here. |
| `organizationId` | string | conditional | Join an existing organisation. |
| `organization` | object | conditional | Register a new one. See below. |

`HOSPITAL` and `SUPPLIER` must supply exactly one of `organizationId` or
`organization`. `DELIVERY` may supply neither.

`organization`: `{ name, type, registrationNumber, licenseNumber?, phone?, email?, address?, latitude?, longitude? }`
where `type` is `HOSPITAL`, `PHARMACY` or `SUPPLIER`.

> Set `latitude` and `longitude`. Distance, ETA and ranking all depend on them;
> an organisation without coordinates can still trade but ranks poorly.

**Response `201`**

```json
{
  "success": true,
  "data": {
    "token": "eyJhbGciOi...",
    "profile": { "id": "...", "email": "...", "role": "HOSPITAL", "organization_id": "..." },
    "organization": { "id": "...", "name": "...", "verificationStatus": "PENDING" }
  }
}
```

**Errors** `400 VALIDATION_ERROR`, `409 EMAIL_IN_USE`, `409 CONFLICT` (registration number already used), `403 FORBIDDEN` (attempted `ADMIN`).

---

### `POST /api/auth/login`

Public. Body: `{ email, password }`.

**Response `200`** — same shape as register.

**Errors** `401 INVALID_CREDENTIALS`. The message is identical for an unknown
email and a wrong password, deliberately.

---

### `GET /api/auth/me`

Authenticated. Returns `{ profile, organization }` for the caller.

---

### `PATCH /api/auth/me`

Authenticated. Body: `{ fullName?, phone? }`. Nothing else is editable here.

---

### `POST /api/auth/change-password`

Authenticated. Body: `{ currentPassword, newPassword }` (minimum 8 characters).

**Errors** `400 INVALID_CREDENTIALS` when the current password is wrong.

---

## 3. Organizations — `/api/organizations`

All routes require authentication.

### Projections

Two shapes are returned depending on who is asking:

- **Public** (any signed-in user): `id`, `name`, `type`, `phone`, `address`,
  `latitude`, `longitude`, `verificationStatus`, `createdAt`.
- **Detailed** (own organisation members and admins): the above plus `email`,
  `registrationNumber`, `licenseNumber`, `verificationNotes`, `verifiedAt`,
  `verifiedBy`, `reliabilityScore`, `updatedAt`.

### `POST /api/organizations`

Creates an organisation and links the caller to it. Only for a user who does
not already belong to one.

**Body** — same as the `organization` object in register.

**Response `201`** `{ organization, profile }`.

**Errors** `409 CONFLICT` (caller already has an organisation, or the
registration number is taken).

---

### `GET /api/organizations`

Query: `type`, `verificationStatus`, `search`, `limit` (default 50), `offset`.

Returns an array, each entry in the projection the caller is entitled to.

---

### `GET /api/organizations/:id`

Returns one organisation, in the caller's projection.

**Errors** `404 NOT_FOUND`.

---

### `PATCH /api/organizations/:id`

Own organisation, or admin. Body: `{ name?, licenseNumber?, phone?, email?, address?, latitude?, longitude? }`.

`registrationNumber` and `verificationStatus` are **not** editable here — that
would defeat the verification workflow.

**Errors** `403 FORBIDDEN` (another organisation), `404 NOT_FOUND`.

---

### `POST /api/organizations/:id/documents`

Submit a supporting document for verification. Own organisation, or admin.

**Body**

| Field | Type | Required |
|---|---|---|
| `documentType` | string | yes |
| `fileUrl` | URL | yes |
| `documentNumber` | string | no |
| `issuedBy` | string | no |
| `expiresOn` | ISO date | no |
| `notes` | string | no |

**Response `201`** — the stored document row.

---

### `GET /api/organizations/:id/documents`

Own organisation, or admin, only.

**Errors** `403 FORBIDDEN` for anyone else.

---

## 4. Admin — `/api/admin`

Every route requires the `ADMIN` role. Non-admins get `403 FORBIDDEN`.

### `GET /api/admin/verifications`

The verification queue.

Query: `status` (any verification status, or `ALL`; default `PENDING`), `type`,
`search`, `limit`, `offset`.

Returns organisations in the detailed projection.

---

### `GET /api/admin/verifications/:id`

Everything needed to make a decision.

```json
{
  "success": true,
  "data": {
    "organization": { "...": "detailed projection" },
    "documents": [ { "documentType": "DRUG_LICENSE", "fileUrl": "..." } ],
    "members": [ { "id": "...", "fullName": "...", "email": "...", "role": "SUPPLIER" } ]
  }
}
```

---

### `PATCH /api/admin/verifications/:id`

Record the decision.

**Body** `{ "status": "VERIFIED" | "REJECTED" | "SUSPENDED" | "PENDING", "notes": "optional" }`

Approving sets `verifiedAt`/`verifiedBy`, notifies every member of the
organisation and writes an audit entry.

> This records a human reviewer's judgement. MediBridge does **not** check any
> licence against a government register, and no response here should be
> presented as if it had.

**Errors** `409 CONFLICT` (already in that status), `404 NOT_FOUND`.

---

### `POST /api/admin/users`

Create any user, including another `ADMIN`. This is the only route that can
mint an admin.

**Body** — as register, but `role` may be any of the four.

---

### `GET /api/admin/audit-logs`

Query: `organizationId`, `userId`, `action`, `entityType`, `entityId`, `limit`, `offset`.

Newest first. Credential-shaped values are redacted from `metadata` before
storage.

---

## 5. Medicines — `/api/medicines`

Reading requires authentication. Writing requires `SUPPLIER`, `HOSPITAL` or
`ADMIN` **and** a verified organisation.

### `GET /api/medicines`

Query: `search` (matches name, generic name, manufacturer, category),
`category`, `manufacturer`, `limit` (default 50), `offset`.

```http
GET /api/medicines?search=adrenaline
```

**Response `200`** — array of medicine rows:

```json
{
  "id": "...",
  "name": "Adrenor 1mg/ml",
  "generic_name": "Adrenaline (Epinephrine)",
  "manufacturer": "Cipla",
  "category": "Emergency",
  "strength": "1mg/ml",
  "form": "Injection",
  "requires_prescription": true
}
```

### `GET /api/medicines/:id`

### `POST /api/medicines`

Body: `{ name (required), genericName?, manufacturer?, category?, description?, strength?, form?, requiresPrescription? }`.

The catalogue is shared across the whole network, so a duplicate name +
manufacturer is rejected with `409 CONFLICT` and the existing id in
`error.details.existingId`.

### `PATCH /api/medicines/:id`

Same fields, all optional.

---

## 6. Equipment — `/api/equipment`

Identical to medicines, with equipment fields.

- `GET /api/equipment` — query `search`, `category`, `manufacturer`, `limit`, `offset`
- `GET /api/equipment/:id`
- `POST /api/equipment` — `{ name (required), category?, manufacturer?, model?, description? }`
- `PATCH /api/equipment/:id`

Quantity, condition, price and availability for equipment live in
[inventory](#7-inventory--apiinventory), not here.

---

## 7. Inventory — `/api/inventory`

What each organisation physically holds. Writing requires `SUPPLIER`,
`HOSPITAL` or `ADMIN` and a verified organisation.

### Availability

```text
availableQuantity = quantity - reservedQuantity
```

It can never go negative. Total `quantity` does not drop when stock is
reserved — only when an order is **dispatched**, because until then the goods
are still on the shelf.

### Freshness

Every inventory response carries how recently the figure was updated:

```json
{
  "lastUpdated": "2026-08-22T12:30:00.000Z",
  "stockFreshness": "FRESH",
  "minutesSinceUpdate": 4
}
```

| Value | Age | Configured by |
|---|---|---|
| `FRESH` | under 30 minutes | `FRESHNESS_FRESH_MINUTES` |
| `RECENT` | 30 minutes to 6 hours | `FRESHNESS_RECENT_MINUTES` |
| `STALE` | over 6 hours | anything beyond the above |

### `GET /api/inventory`

Query: `organizationId` (defaults to the caller's own), `itemType`,
`medicineId`, `equipmentId`, `includeExpired` (default `false`),
`inStockOnly`, `limit` (default 100), `offset`.

Reading **another** organisation's inventory is allowed if that organisation is
verified, but returns a reduced projection without `batchNumber`,
`reservedQuantity` or `lowStockThreshold`.

**Errors** `403 ORGANIZATION_NOT_VERIFIED` when the target organisation is not verified.

### `GET /api/inventory/expiring-soon`

Query: `organizationId` (own, or any for admins), `withinDays` (default 30).

**Errors** `403 FORBIDDEN` for another organisation.

### `GET /api/inventory/:id`

### `POST /api/inventory`

| Field | Type | Required | Notes |
|---|---|---|---|
| `itemType` | enum | yes | `MEDICINE` or `EQUIPMENT` |
| `medicineId` | string | for `MEDICINE` | Must exist in the catalogue. |
| `equipmentId` | string | for `EQUIPMENT` | Must exist in the catalogue. |
| `quantity` | integer ≥ 0 | yes | |
| `price` | number ≥ 0 | no | Per unit. |
| `batchNumber` | string | no | |
| `unit` | string | no | Defaults to `unit` / `item`. |
| `expiryDate` | ISO date | no | Expired batches are hidden from search. |
| `storageRequirement` | string | no | e.g. `COLD_CHAIN_2_8C` |
| `condition` | enum | no | Equipment only: `NEW`, `GOOD`, `REFURBISHED`, `NEEDS_SERVICE`. |
| `lowStockThreshold` | integer ≥ 0 | no | Default 10; triggers a `LOW_STOCK` notification. |

The item is always created for the caller's own organisation.

**Errors** `404 NOT_FOUND` (unknown catalogue id), `400 VALIDATION_ERROR`, `403 ORGANIZATION_NOT_VERIFIED`.

### `PATCH /api/inventory/:id`

Own organisation only. Any field above except `itemType`, `medicineId`,
`equipmentId`.

**Errors** `409 INVENTORY_NOT_AVAILABLE` when the new `quantity` would fall
below what is already reserved. `403 FORBIDDEN` for another organisation's row.

### `DELETE /api/inventory/:id`

Own organisation only.

**Errors** `409 INVENTORY_NOT_AVAILABLE` when the batch has live reservations.

---

## 8. Emergency search — `/api/search`

The core feature. Requires a verified organisation.

### `GET /api/search/suppliers`

```http
GET /api/search/suppliers?medicineId=123&quantity=20&maximumEtaMinutes=30&priority=CRITICAL
```

| Query | Type | Notes |
|---|---|---|
| `medicineId` | string | One of these three is required. |
| `equipmentId` | string | Set `itemType=EQUIPMENT`. |
| `medicineName` | string | Resolved against the catalogue. |
| `quantity` | integer ≥ 1 | Default 1. |
| `priority` | enum | `CRITICAL`, `URGENT`, `NORMAL`. |
| `maximumEtaMinutes` | integer | Sets `meetsDeadline` and gates `recommended`. |
| `maxDistanceKm` | number | Hard filter. |
| `latitude`, `longitude` | number | Override the origin (e.g. an ambulance's position). Defaults to the caller organisation's coordinates. |
| `limit` | integer | Default 20. |
| `notifySuppliers` | `true` | Also push an `EMERGENCY_REQUEST` notification to the recommended suppliers. |

**What the backend does**

1. Resolves the catalogue item.
2. Finds every inventory batch of it.
3. Drops expired batches, batches with nothing available, and the caller's own stock.
4. Drops every organisation that is not `VERIFIED`.
5. Allocates batches soonest-expiry-first and drops anyone who cannot cover the quantity.
6. Computes distance (Haversine) and ETA.
7. Computes stock freshness.
8. Reads the supplier's reliability score.
9. Ranks the candidates.
10. Returns them, best first.

**Response `200`**

```json
{
  "success": true,
  "data": {
    "query": {
      "itemType": "MEDICINE",
      "itemId": "...",
      "itemName": "Adrenor 1mg/ml",
      "quantity": 20,
      "priority": "CRITICAL",
      "maximumEtaMinutes": 30,
      "origin": { "latitude": 12.9716, "longitude": 77.5946 }
    },
    "results": [
      {
        "supplierId": "123",
        "supplierName": "MedPlus",
        "supplierType": "PHARMACY",
        "verified": true,
        "address": "100 Feet Road, Indiranagar",
        "phone": "+918041234567",
        "latitude": 12.9784,
        "longitude": 77.6008,
        "stock": 45,
        "requestedQuantity": 20,
        "distanceKm": 1.4,
        "estimatedMinutes": 12,
        "stockFreshness": "FRESH",
        "lastUpdated": "2026-08-22T12:30:00.000Z",
        "reliabilityScore": 97,
        "unitPrice": 240,
        "estimatedTotalPrice": 4800,
        "allocation": [
          { "inventoryId": "...", "quantity": 20, "unitPrice": 240, "expiryDate": "2027-01-14" }
        ],
        "recommendationScore": 90,
        "recommended": true,
        "meetsDeadline": true,
        "scoreBreakdown": {
          "eta": 1, "distance": 1, "stock": 0.98, "reliability": 0.97, "price": 0.8,
          "weights": { "eta": 0.4, "distance": 0.25, "stock": 0.2, "reliability": 0.1, "price": 0.05 }
        }
      }
    ],
    "meta": { "candidatesConsidered": 13, "returned": 13, "originResolved": true, "distanceAvailable": true }
  }
}
```

`allocation` is the exact list to send to `POST /api/reservations` — the
frontend never has to work out which batch to take.

### Ranking

Five weighted components, each normalised to 0..1 against the other candidates
in the same search, all configurable in `.env`:

| Component | Default weight | Meaning |
|---|---|---|
| ETA | 40% | How soon it can arrive. |
| Distance | 25% | How close it is. |
| Stock | 20% | How comfortably it covers the request, **discounted by freshness**. |
| Reliability | 10% | Share of its finished orders that were delivered rather than cancelled. |
| Price | 5% | Unit price against the other candidates. |

`recommendationScore` is 0–100. `recommended` marks the best option and anything
within 5 points of it, provided it meets `maximumEtaMinutes`.

> This is a **logistics** recommendation about who can get supplies to you
> fastest and most reliably. It is not a clinical judgement and has not been
> medically validated.

Scores are comparable within one search only — normalisation is relative to the
candidate set.

### `POST /api/search/emergency`

The same search with the parameters in a JSON body instead of the query string.
Add `"notifySuppliers": true` to broadcast.

---

## 9. Reservations — `/api/reservations`

A short-lived hold so a hospital can finish placing an order without another
hospital taking the same box off the shelf. Requires a verified organisation.

Holds expire after `RESERVATION_TTL_MINUTES` (default **10 minutes**), swept
every 30 seconds and also checked on every read and write.

### `POST /api/reservations`

`HOSPITAL` or `ADMIN`.

**Body** — either a single batch:

```json
{ "inventoryId": "...", "quantity": 20, "notes": "optional" }
```

or the allocation from a search result:

```json
{ "allocation": [ { "inventoryId": "...", "quantity": 15 }, { "inventoryId": "...", "quantity": 5 } ] }
```

A multi-batch hold is all-or-nothing: if any line cannot be filled, the lines
already taken are released and the whole request fails.

**Response `201`**

```json
{
  "success": true,
  "data": {
    "groupId": "...",
    "expiresAt": "2026-08-22T12:40:00.000Z",
    "expiresInMinutes": 10,
    "reservations": [
      { "id": "...", "inventoryId": "...", "quantity": 20, "status": "ACTIVE", "expiresAt": "..." }
    ]
  }
}
```

**Errors**

- `409 INVENTORY_NOT_AVAILABLE` — not enough free stock. `error.details` carries `{ inventoryId, requested, available }`.
- `400 VALIDATION_ERROR` — reserving from your own organisation, or a malformed line.
- `404 NOT_FOUND` — unknown `inventoryId`.

> Concurrency: the reserve is a single atomic operation (a Postgres function
> under Supabase). Ten simultaneous 30-unit requests against a 100-unit batch
> produce exactly three successes and seven `409`s — never an oversell.

### `GET /api/reservations`

Query: `status` (`ACTIVE`, `CONSUMED`, `RELEASED`, `EXPIRED`), `limit`, `offset`.

Scope depends on the caller: a hospital sees the holds it placed, a supplier
sees the holds against its own stock, an admin sees everything.

### `DELETE /api/reservations/:id`

Releases one hold and returns the stock immediately. Allowed for the reserving
organisation, the supplying organisation, or an admin.

**Errors** `409 CONFLICT` (already released, consumed or expired), `403 FORBIDDEN`.

### `DELETE /api/reservations/group/:groupId`

Releases every active hold in the group — what "cancel my hold" means to a user.

---

## 10. Orders — `/api/orders`

Requires a verified organisation.

### Statuses

```text
PENDING → ACCEPTED → PREPARING → DISPATCHED → OUT_FOR_DELIVERY → DELIVERED
```

`CANCELLED` is reachable from any non-final state. `DELIVERED` and `CANCELLED`
are final. Anything else — `DELIVERED → PREPARING`, `PENDING → DELIVERED` — is
rejected with `409 INVALID_STATUS_TRANSITION`.

### Who may set what

| Target status | Allowed roles |
|---|---|
| `ACCEPTED`, `PREPARING`, `DISPATCHED` | `SUPPLIER` (the selling one) |
| `OUT_FOR_DELIVERY` | `SUPPLIER`, `DELIVERY` |
| `DELIVERED` | `DELIVERY`, `HOSPITAL`, `SUPPLIER` |
| `CANCELLED` | `HOSPITAL`, `SUPPLIER` (either party) |

`ADMIN` may make any legal transition. Being the right role is not enough — it
must also be your order.

### `POST /api/orders`

`HOSPITAL` or `ADMIN`.

**Body** — spend an existing hold:

```json
{ "reservationGroupId": "...", "priority": "CRITICAL", "deliveryAddress": "Emergency Ward", "requiredByMinutes": 30 }
```

or `{ "reservationIds": ["..."] }`, or hand over the lines directly and let the
API reserve them for you:

```json
{ "items": [ { "inventoryId": "...", "quantity": 20 } ], "priority": "CRITICAL" }
```

| Field | Type | Notes |
|---|---|---|
| `priority` | enum | `CRITICAL`, `URGENT`, `NORMAL` (default). |
| `deliveryAddress` | string | Defaults to the hospital's registered address. |
| `deliveryLatitude`, `deliveryLongitude` | number | Default to the hospital's coordinates. |
| `requiredByMinutes` | integer | Informational deadline. |
| `currency` | 3-letter string | Default `INR`. |
| `notes` | string | |

All items must come from **one supplier**; a multi-supplier basket is several
orders.

**Response `201`**

```json
{
  "id": "...",
  "reference": "MB-260822-A4F1",
  "hospitalId": "...",
  "supplierId": "...",
  "priority": "CRITICAL",
  "status": "PENDING",
  "totalAmount": 4800,
  "currency": "INR",
  "deliveryAddress": "Emergency Ward",
  "statusHistory": [ { "status": "PENDING", "at": "...", "by": "..." } ],
  "items": [
    { "id": "...", "inventoryId": "...", "name": "Adrenor 1mg/ml", "quantity": 20, "unitPrice": 240, "lineTotal": 4800 }
  ]
}
```

Item names and prices are snapshotted at order time.

**Errors** `409 RESERVATION_EXPIRED`, `409 INVENTORY_NOT_AVAILABLE`, `400 VALIDATION_ERROR` (mixed suppliers, or neither reservations nor items).

### `GET /api/orders`

Query: `status`, `priority`, `limit`, `offset` (plus `organizationId` /
`supplierId` for admins).

Scope: a hospital sees its own purchases, a supplier its own sales, a courier
the jobs assigned to them, an admin everything.

### `GET /api/orders/:id`

Returns the order with `items` and its `delivery` (or `null`).

**Errors** `403 FORBIDDEN` for anyone outside the two parties, the assigned
courier and admins. `404 NOT_FOUND`.

### `PATCH /api/orders/:id/status`

**Body** `{ "status": "ACCEPTED", "reason": "optional", "note": "optional" }`

**Side effects**

- `DISPATCHED` — the reserved units leave the shelf: `quantity` and
  `reservedQuantity` both drop.
- `CANCELLED` **before** dispatch — the reservations are released and the stock
  becomes available again.
- `CANCELLED` **after** dispatch — the goods have physically left, so stock is
  not restored. A human handles the return.
- `DELIVERED` — the supplier's reliability score is recomputed.

Every transition appends to `statusHistory`, notifies the other party and
writes an audit entry.

**Errors** `409 INVALID_STATUS_TRANSITION` (with `{ from, to, allowed }` in
`details`), `403 FORBIDDEN`, `400 VALIDATION_ERROR`.

---

## 11. Deliveries — `/api/deliveries`

Authenticated. Per-record access: the assigned courier, either trading party,
or an admin.

### Statuses

```text
ASSIGNED → PICKED_UP → IN_TRANSIT → DELIVERED
```

`FAILED` is reachable from any non-final state. Delivery status drives the
order forward: `PICKED_UP` dispatches it, `IN_TRANSIT` sends it out for
delivery, `DELIVERED` completes it. The order's own state machine still
validates every move.

### `POST /api/deliveries`

`SUPPLIER` (the selling one) or `ADMIN`. The order must be past `PENDING`.

**Body**

| Field | Type | Required |
|---|---|---|
| `orderId` | string | yes |
| `deliveryPartnerId` | string | no — must be a `DELIVERY` profile |
| `estimatedArrival` | ISO datetime | no |
| `vehicleType`, `vehicleNumber`, `contactPhone`, `notes` | string | no |
| `currentLatitude`, `currentLongitude` | number | no |

The destination is taken from the order's delivery coordinates.

**Errors** `409 INVALID_STATUS_TRANSITION` (order still `PENDING` or
`CANCELLED`), `409 CONFLICT` (the order already has a delivery), `400` (the
assigned profile is not a courier), `403 FORBIDDEN`.

### `GET /api/deliveries`

Query: `status`, `limit`, `offset`. A courier sees only their own jobs.

### `GET /api/deliveries/:id`

### `GET /api/deliveries/by-order/:orderId`

Returns the delivery for an order, or `null`.

### `PATCH /api/deliveries/:id/status`

Body: `{ "status": "PICKED_UP", "note": "optional" }`.

**Errors** `409 INVALID_STATUS_TRANSITION`, `403 FORBIDDEN`.

### `PATCH /api/deliveries/:id/location`

**Only the assigned courier** (or an admin). Body:
`{ "latitude": 12.98, "longitude": 77.60 }`.

Recomputes `distanceRemainingKm` and `estimatedArrival` from the new position.

**Errors** `403 FORBIDDEN` for anyone else, `400 VALIDATION_ERROR` for
out-of-range coordinates.

---

## 12. Notifications — `/api/notifications`

Authenticated. Personal to the recipient — a verified organisation is *not*
required, because a pending organisation still needs to be told it was approved.

### Types

`VERIFICATION_APPROVED`, `VERIFICATION_REJECTED`, `VERIFICATION_SUSPENDED`,
`ORDER_CREATED`, `ORDER_ACCEPTED`, `ORDER_DISPATCHED`, `ORDER_DELIVERED`,
`ORDER_CANCELLED`, `EMERGENCY_REQUEST`, `LOW_STOCK`, `EXPIRING_SOON`.

### `GET /api/notifications`

Query: `unreadOnly`, `limit` (default 50), `offset`.

`meta.unreadCount` carries the badge number.

```json
{
  "id": "...",
  "type": "ORDER_DISPATCHED",
  "title": "Order dispatched",
  "message": "Order MB-260822-A4F1 is now dispatched.",
  "metadata": { "orderId": "...", "reference": "MB-260822-A4F1" },
  "read_at": null,
  "created_at": "..."
}
```

### `PATCH /api/notifications/:id/read`

**Errors** `403 FORBIDDEN` — a notification belongs to one user only.

### `PATCH /api/notifications/read-all`

Returns `{ "updated": 7 }`.

---

## 13. AI — `/api/ai`

Requires a verified organisation.

> The parser extracts **intent** — a quantity, a deadline, an urgency — and
> resolves the medicine against the real catalogue. It never invents a
> supplier, a stock level, a price or an availability. Every factual figure in
> a search response comes from the database.
>
> It is a deterministic rule-based extractor: no API key, no external call, and
> it cannot hallucinate a product that does not exist.

### `POST /api/ai/chat`

The assistant the frontend talks to. One endpoint, two providers behind it.

**Body** `{ "message": "Do we have adrenaline?" }`

**Response `200`**

```json
{
  "success": true,
  "response": "Yes — Adrenor 1mg/ml (Adrenaline), 160 units available.",
  "provider": "local"
}
```

The answer normally comes from the **primary**: the MediBridge FastAPI service
in front of the self-hosted LLM (`AI_SERVICE_URL`), which has live tool access
to the database. It is given `AI_PRIMARY_TIMEOUT_MS` (30s) to answer, because a
slow answer is still the right answer.

Only when the primary genuinely fails — unreachable, `5xx`, timeout, an
inference exception, or an empty/unparseable body — does the request fall
through to the **fallback**, Google Gemini (`GEMINI_API_KEY`, server-side
only). The fallback has no tool access, so it is first handed a structured
block of real rows read from the catalogue and inventory tables, and is
instructed to state only figures that appear in that block. When no rows back
the question it says it cannot verify live inventory rather than inventing one.

A `4xx` from the primary is passed straight back — a rejected request is not an
outage, and asking a second model would only hide the bug.

`provider` is `"local"` or `"gemini_fallback"`. It is metadata for logs and
support; the frontend does not surface it, and the response shape is identical
either way.

**Response `503`** — both providers failed. Exactly one attempt is made per
provider, so the path is always primary → fallback → error, never a loop:

```json
{ "success": false, "message": "MediBridge AI is temporarily unavailable. Please try again shortly." }
```

### `POST /api/ai/parse-request`

**Body** `{ "text": "We urgently need 20 adrenaline injections within 30 minutes." }`

**Response `200`**

```json
{
  "input": "We urgently need 20 adrenaline injections within 30 minutes.",
  "medicine": "Adrenor 1mg/ml",
  "medicineId": "...",
  "genericName": "Adrenaline (Epinephrine)",
  "quantity": 20,
  "priority": "CRITICAL",
  "maximumEtaMinutes": 30,
  "confidence": "HIGH",
  "unresolved": [],
  "alternatives": [ { "id": "...", "name": "Adrenor 0.5mg/ml", "matchedTokens": 1 } ],
  "interpretedFrom": { "tokens": ["adrenaline"], "deadlinePhrase": "within 30 minutes" }
}
```

`confidence` is `HIGH` (medicine and quantity found), `MEDIUM` (medicine only)
or `LOW`. Anything below `HIGH` should be confirmed by the user before
ordering. `unresolved` names what could not be extracted; `medicine` and
`medicineId` are `null` when nothing in the catalogue matches.

### `POST /api/ai/emergency-search`

Parse, then run the ordinary supplier search with the result.

**Body** `{ "text": "...", "limit": 10, "notifySuppliers": false }`

**Response `200`** — `{ parsed, query, results, meta }`, where `results` is
identical to [`/api/search/suppliers`](#8-emergency-search--apisearch).

**Errors** `400 VALIDATION_ERROR` when no catalogue medicine matches — the API
refuses to search blindly rather than guessing.

### `GET /api/ai/shortage-forecast`

Query: `organizationId` (own, or any for admins), `windowDays` (default 30),
`horizonDays` (default 7).

```json
{
  "organizationId": "...",
  "windowDays": 30,
  "method": "Moving average of delivered order volume. A rough logistics projection, not a clinical forecast.",
  "items": [
    {
      "medicineId": "...",
      "medicineName": "Adrenor 1mg/ml",
      "availableQuantity": 34,
      "unitsShippedInWindow": 360,
      "averageDailyUsage": 12,
      "predictedDaysRemaining": 2,
      "risk": "CRITICAL",
      "basis": "Moving average over the last 30 days of delivered orders."
    }
  ]
}
```

`risk` is `CRITICAL` (≤2 days), `AT_RISK` (within the horizon), `HEALTHY`, or
`NO_RECENT_USAGE` when there is no delivered volume to project from — reported
honestly rather than as infinite cover.

**Errors** `403 FORBIDDEN` for another organisation.

---

## 14. Health — `/api/health`

Public, no token.

```json
{
  "status": "ok",
  "service": "MediBridge API",
  "environment": "development",
  "uptimeSeconds": 142,
  "database": { "driver": "supabase", "reachable": true }
}
```

---

## 15. Error codes

| Code | HTTP | Meaning |
|---|---|---|
| `VALIDATION_ERROR` | 400 | Request failed validation. `details` lists the fields. |
| `UNAUTHENTICATED` | 401 | Missing, malformed or expired token. |
| `INVALID_CREDENTIALS` | 401 / 400 | Wrong email or password. |
| `FORBIDDEN` | 403 | Authenticated, but not allowed to do this. |
| `ORGANIZATION_NOT_VERIFIED` | 403 | The caller's or target organisation is not `VERIFIED`. |
| `NOT_FOUND` | 404 | No such resource, or no such route. |
| `CONFLICT` | 409 | Duplicate, or an action that contradicts current state. |
| `EMAIL_IN_USE` | 409 | That email is already registered. |
| `INVENTORY_NOT_AVAILABLE` | 409 | Not enough free stock for the request. |
| `RESERVATION_EXPIRED` | 409 | The hold ran out before it was used. |
| `INVALID_STATUS_TRANSITION` | 409 | Illegal order or delivery status move. |
| `DATABASE_ERROR` | 500 | The database rejected the operation. |
| `INTERNAL_ERROR` | 500 | Unexpected failure. Details are logged server-side only. |

---

## Frontend integration notes

- **Store the token** from register/login and send it as `Authorization: Bearer <token>` on every request.
- **Handle `403 ORGANIZATION_NOT_VERIFIED` globally.** A brand new account will hit it everywhere until an admin approves the organisation; show a "pending verification" state rather than an error toast.
- **Use `allocation` from a search result verbatim** when reserving. Do not compute batches in the UI.
- **Reservations expire in 10 minutes.** Show `expiresAt` as a countdown, and handle `409 RESERVATION_EXPIRED` by sending the user back to search.
- **Drive order buttons from the status table**, not from role alone: what a user may do next depends on the order's current status as well as their role.
- **`stockFreshness` is worth surfacing.** "45 in stock, counted 4 minutes ago" is a materially different claim from the same number counted yesterday.
- **Never present `recommendationScore` as medical advice.** It ranks logistics.
