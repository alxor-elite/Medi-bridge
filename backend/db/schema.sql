-- ===========================================================================
-- MediBridge - PostgreSQL / Supabase schema
--
-- Run this once in the Supabase SQL editor (or `psql`) before starting the API
-- with DB_DRIVER=supabase. It is idempotent: re-running it is safe.
--
-- Access control note
-- -------------------
-- The API connects with the service role key, which bypasses row level
-- security, and enforces every access rule in its middleware and services.
-- RLS is still enabled on every table so that anything connecting with the
-- anon key (a stray frontend query, a leaked URL) gets nothing by default.
-- ===========================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Enumerated types
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (select 1 from pg_type where typname = 'user_role') then
    create type user_role as enum ('HOSPITAL', 'SUPPLIER', 'DELIVERY', 'ADMIN');
  end if;

  if not exists (select 1 from pg_type where typname = 'organization_type') then
    create type organization_type as enum ('HOSPITAL', 'PHARMACY', 'SUPPLIER');
  end if;

  if not exists (select 1 from pg_type where typname = 'verification_status') then
    create type verification_status as enum ('PENDING', 'VERIFIED', 'REJECTED', 'SUSPENDED');
  end if;

  if not exists (select 1 from pg_type where typname = 'order_status') then
    create type order_status as enum (
      'PENDING', 'ACCEPTED', 'PREPARING', 'DISPATCHED',
      'OUT_FOR_DELIVERY', 'DELIVERED', 'CANCELLED'
    );
  end if;

  if not exists (select 1 from pg_type where typname = 'order_priority') then
    create type order_priority as enum ('CRITICAL', 'URGENT', 'NORMAL');
  end if;

  if not exists (select 1 from pg_type where typname = 'reservation_status') then
    create type reservation_status as enum ('ACTIVE', 'CONSUMED', 'RELEASED', 'EXPIRED');
  end if;

  if not exists (select 1 from pg_type where typname = 'delivery_status') then
    create type delivery_status as enum ('ASSIGNED', 'PICKED_UP', 'IN_TRANSIT', 'DELIVERED', 'FAILED');
  end if;

  if not exists (select 1 from pg_type where typname = 'inventory_item_type') then
    create type inventory_item_type as enum ('MEDICINE', 'EQUIPMENT');
  end if;

  if not exists (select 1 from pg_type where typname = 'equipment_condition') then
    create type equipment_condition as enum ('NEW', 'GOOD', 'REFURBISHED', 'NEEDS_SERVICE');
  end if;
end
$$;

-- ---------------------------------------------------------------------------
-- Organizations
-- ---------------------------------------------------------------------------
create table if not exists organizations (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  type                organization_type not null,
  registration_number text not null unique,
  license_number      text,
  phone               text,
  email               text,
  address             text,
  latitude            double precision check (latitude between -90 and 90),
  longitude           double precision check (longitude between -180 and 180),
  verification_status verification_status not null default 'PENDING',
  verification_notes  text,
  verified_at         timestamptz,
  verified_by         uuid,
  -- Delivery track record, 0-100. Neutral 75 until an organisation has history.
  reliability_score   integer not null default 75 check (reliability_score between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists organizations_status_idx on organizations (verification_status);
create index if not exists organizations_type_idx   on organizations (type);
create index if not exists organizations_geo_idx    on organizations (latitude, longitude);

-- ---------------------------------------------------------------------------
-- Profiles
-- ---------------------------------------------------------------------------
create table if not exists profiles (
  id              uuid primary key default gen_random_uuid(),
  email           text not null unique,
  -- bcrypt hash. Never selected into any API response.
  password_hash   text not null,
  full_name       text not null,
  phone           text,
  role            user_role not null,
  organization_id uuid references organizations (id) on delete set null,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists profiles_organization_idx on profiles (organization_id);
create index if not exists profiles_role_idx         on profiles (role);

alter table organizations
  drop constraint if exists organizations_verified_by_fkey;
alter table organizations
  add constraint organizations_verified_by_fkey
  foreign key (verified_by) references profiles (id) on delete set null;

-- ---------------------------------------------------------------------------
-- Verification documents
-- ---------------------------------------------------------------------------
create table if not exists verification_documents (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references organizations (id) on delete cascade,
  document_type   text not null,
  document_number text,
  file_url        text not null,
  issued_by       text,
  expires_on      date,
  uploaded_by     uuid references profiles (id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists verification_documents_org_idx on verification_documents (organization_id);

-- ---------------------------------------------------------------------------
-- Catalogue: medicines and equipment
-- ---------------------------------------------------------------------------
create table if not exists medicines (
  id                    uuid primary key default gen_random_uuid(),
  name                  text not null,
  generic_name          text,
  manufacturer          text,
  category              text,
  description           text,
  strength              text,
  form                  text,
  requires_prescription boolean not null default false,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists medicines_name_idx     on medicines (lower(name));
create index if not exists medicines_generic_idx  on medicines (lower(generic_name));
create index if not exists medicines_category_idx on medicines (category);

create table if not exists equipment (
  id           uuid primary key default gen_random_uuid(),
  name         text not null,
  category     text,
  manufacturer text,
  model        text,
  description  text,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists equipment_name_idx     on equipment (lower(name));
create index if not exists equipment_category_idx on equipment (category);

-- ---------------------------------------------------------------------------
-- Inventory
--
-- available_quantity = quantity - reserved_quantity, and the check constraint
-- below makes it impossible for that to go negative even if a bug slips past
-- the application layer.
-- ---------------------------------------------------------------------------
create table if not exists inventory (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references organizations (id) on delete cascade,
  item_type           inventory_item_type not null,
  medicine_id         uuid references medicines (id) on delete restrict,
  equipment_id        uuid references equipment (id) on delete restrict,
  batch_number        text,
  quantity            integer not null default 0 check (quantity >= 0),
  reserved_quantity   integer not null default 0 check (reserved_quantity >= 0),
  unit                text not null default 'unit',
  price               numeric(12, 2) check (price is null or price >= 0),
  expiry_date         date,
  storage_requirement text,
  condition           equipment_condition,
  low_stock_threshold integer not null default 10 check (low_stock_threshold >= 0),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint inventory_never_oversold check (reserved_quantity <= quantity),
  constraint inventory_catalog_link check (
    (item_type = 'MEDICINE'  and medicine_id is not null and equipment_id is null) or
    (item_type = 'EQUIPMENT' and equipment_id is not null and medicine_id is null)
  )
);

create index if not exists inventory_org_idx       on inventory (organization_id);
create index if not exists inventory_medicine_idx  on inventory (medicine_id);
create index if not exists inventory_equipment_idx on inventory (equipment_id);
create index if not exists inventory_expiry_idx    on inventory (expiry_date);
create index if not exists inventory_updated_idx   on inventory (updated_at desc);

-- ---------------------------------------------------------------------------
-- Orders
-- ---------------------------------------------------------------------------
create table if not exists orders (
  id                  uuid primary key default gen_random_uuid(),
  reference           text not null unique,
  hospital_id         uuid not null references organizations (id) on delete restrict,
  supplier_id         uuid not null references organizations (id) on delete restrict,
  created_by          uuid references profiles (id) on delete set null,
  priority            order_priority not null default 'NORMAL',
  status              order_status not null default 'PENDING',
  total_amount        numeric(12, 2) check (total_amount is null or total_amount >= 0),
  currency            text not null default 'INR',
  delivery_address    text,
  delivery_latitude   double precision,
  delivery_longitude  double precision,
  required_by_minutes integer,
  notes               text,
  cancelled_reason    text,
  -- Append-only list of {status, at, by, note}. Cheap audit for the timeline UI.
  status_history      jsonb not null default '[]'::jsonb,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),

  constraint orders_two_parties check (hospital_id <> supplier_id)
);

create index if not exists orders_hospital_idx on orders (hospital_id);
create index if not exists orders_supplier_idx on orders (supplier_id);
create index if not exists orders_status_idx   on orders (status);
create index if not exists orders_created_idx  on orders (created_at desc);

create table if not exists order_items (
  id           uuid primary key default gen_random_uuid(),
  order_id     uuid not null references orders (id) on delete cascade,
  inventory_id uuid references inventory (id) on delete set null,
  item_type    inventory_item_type not null,
  medicine_id  uuid references medicines (id) on delete set null,
  equipment_id uuid references equipment (id) on delete set null,
  -- Name and price are snapshotted: the catalogue may change after the order.
  item_name    text not null,
  quantity     integer not null check (quantity > 0),
  unit_price   numeric(12, 2) check (unit_price is null or unit_price >= 0),
  line_total   numeric(12, 2) check (line_total is null or line_total >= 0),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index if not exists order_items_order_idx on order_items (order_id);

-- ---------------------------------------------------------------------------
-- Reservations
-- ---------------------------------------------------------------------------
create table if not exists reservations (
  id              uuid primary key default gen_random_uuid(),
  -- One search can reserve several batches; they share a group id so the whole
  -- hold can be released or spent together.
  group_id        uuid not null,
  inventory_id    uuid not null references inventory (id) on delete cascade,
  organization_id uuid not null references organizations (id) on delete cascade,
  supplier_id     uuid not null references organizations (id) on delete cascade,
  profile_id      uuid references profiles (id) on delete set null,
  quantity        integer not null check (quantity > 0),
  status          reservation_status not null default 'ACTIVE',
  expires_at      timestamptz not null,
  order_id        uuid references orders (id) on delete set null,
  notes           text,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists reservations_group_idx     on reservations (group_id);
create index if not exists reservations_inventory_idx on reservations (inventory_id);
create index if not exists reservations_org_idx       on reservations (organization_id);
create index if not exists reservations_order_idx     on reservations (order_id);
-- The sweeper's query: active holds that are past their expiry.
create index if not exists reservations_sweep_idx     on reservations (status, expires_at);

-- ---------------------------------------------------------------------------
-- Deliveries
-- ---------------------------------------------------------------------------
create table if not exists deliveries (
  id                    uuid primary key default gen_random_uuid(),
  order_id              uuid not null unique references orders (id) on delete cascade,
  delivery_partner_id   uuid references profiles (id) on delete set null,
  status                delivery_status not null default 'ASSIGNED',
  current_latitude      double precision,
  current_longitude     double precision,
  destination_latitude  double precision,
  destination_longitude double precision,
  distance_remaining_km numeric(10, 2),
  estimated_arrival     timestamptz,
  vehicle_type          text,
  vehicle_number        text,
  contact_phone         text,
  notes                 text,
  location_updated_at   timestamptz,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create index if not exists deliveries_partner_idx on deliveries (delivery_partner_id);
create index if not exists deliveries_status_idx  on deliveries (status);

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------
create table if not exists notifications (
  id              uuid primary key default gen_random_uuid(),
  profile_id      uuid not null references profiles (id) on delete cascade,
  organization_id uuid references organizations (id) on delete cascade,
  type            text not null,
  title           text not null,
  message         text not null,
  metadata        jsonb,
  read_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists notifications_profile_idx on notifications (profile_id, created_at desc);
create index if not exists notifications_unread_idx  on notifications (profile_id) where read_at is null;

-- ---------------------------------------------------------------------------
-- Audit logs
-- ---------------------------------------------------------------------------
create table if not exists audit_logs (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references profiles (id) on delete set null,
  organization_id uuid references organizations (id) on delete set null,
  action          text not null,
  entity_type     text,
  entity_id       text,
  -- Credentials are scrubbed by the API before they ever reach this column.
  metadata        jsonb,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create index if not exists audit_logs_org_idx    on audit_logs (organization_id, created_at desc);
create index if not exists audit_logs_action_idx on audit_logs (action);
create index if not exists audit_logs_entity_idx on audit_logs (entity_type, entity_id);

-- ===========================================================================
-- Atomic stock movements
--
-- These exist so a read-check-write cannot be interleaved. Doing the same in
-- JavaScript would let two hospitals both read "1 left" and both reserve it.
-- Each function does its check inside the UPDATE's WHERE clause, which runs
-- under a row lock, and returns zero rows when the check fails.
-- ===========================================================================

create or replace function reserve_inventory(p_inventory_id uuid, p_quantity integer)
returns setof inventory
language sql
as $$
  update inventory
     set reserved_quantity = reserved_quantity + p_quantity,
         updated_at        = now()
   where id = p_inventory_id
     and p_quantity > 0
     -- The whole point: only succeed if the stock is actually free right now.
     and quantity - reserved_quantity >= p_quantity
  returning *;
$$;

create or replace function release_inventory(p_inventory_id uuid, p_quantity integer)
returns setof inventory
language sql
as $$
  update inventory
     set reserved_quantity = greatest(0, reserved_quantity - p_quantity),
         updated_at        = now()
   where id = p_inventory_id
  returning *;
$$;

-- Dispatch: the units leave both the reserved pool and the shelf, so
-- available (quantity - reserved) is unchanged.
create or replace function consume_inventory(p_inventory_id uuid, p_quantity integer)
returns setof inventory
language sql
as $$
  update inventory
     set quantity          = greatest(0, quantity - p_quantity),
         reserved_quantity = greatest(0, reserved_quantity - p_quantity),
         updated_at        = now()
   where id = p_inventory_id
  returning *;
$$;

-- ===========================================================================
-- Row level security
--
-- Deny by default. The API uses the service role key, which bypasses these
-- policies; anything else (anon key, a browser) gets nothing until a policy is
-- added deliberately.
-- ===========================================================================
alter table organizations          enable row level security;
alter table profiles               enable row level security;
alter table verification_documents enable row level security;
alter table medicines              enable row level security;
alter table equipment              enable row level security;
alter table inventory              enable row level security;
alter table orders                 enable row level security;
alter table order_items            enable row level security;
alter table reservations           enable row level security;
alter table deliveries             enable row level security;
alter table notifications          enable row level security;
alter table audit_logs             enable row level security;
