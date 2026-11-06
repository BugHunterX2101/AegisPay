-- 0001_init: all application tables, check constraints and unique keys.
-- Source of truth: docs/spec Technical Design Document §Data design.
-- Money is bigint minor units + char(3) currency. Timestamps are timestamptz.

create table mandate (
  id uuid not null,
  version int not null check (version >= 1),
  status text not null check (status in ('ACTIVE','PAUSED','CLOSED')),
  spec jsonb not null,
  quantity int not null check (quantity > 0),
  unit_ceiling_minor bigint not null check (unit_ceiling_minor >= 0),
  budget_minor bigint not null check (budget_minor >= 0),
  currency char(3) not null check (currency = 'USD'),
  deliver_by date not null,
  min_rating numeric(2,1) check (min_rating between 0 and 5),
  allowed_domains text[],
  approval_threshold_minor bigint not null check (approval_threshold_minor >= 0),
  expires_at timestamptz not null,
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  created_by text not null,
  created_at timestamptz not null default now(),
  primary key (id, version)
);

create table catalog_snapshot (
  id uuid primary key,
  query_hash char(64),
  response jsonb not null,
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  fetched_at timestamptz not null
);

create table proposal (
  id uuid primary key,
  mandate_id uuid not null,
  mandate_version int not null,
  snapshot_id uuid references catalog_snapshot (id),
  product_id text,
  offer_url text,
  domain text,
  title text,
  unit_price_minor bigint check (unit_price_minor >= 0),
  quantity int,
  shipping_minor bigint check (shipping_minor >= 0),
  tax_minor bigint check (tax_minor >= 0),
  eta date,
  rating numeric(2,1),
  in_stock boolean,
  rationale text,
  gate_pass boolean,
  gate_results jsonb,
  decision_sha256 char(64) check (decision_sha256 ~ '^[0-9a-f]{64}$'),
  created_at timestamptz not null default now(),
  foreign key (mandate_id, mandate_version) references mandate (id, version)
);

create table purchase_order (
  id uuid primary key,
  proposal_id uuid not null unique references proposal (id),
  state text not null check (state in (
    'GATED','REJECTED','AWAITING_APPROVAL','CANCELLED','HELD','IN_TRANSIT','DELIVERED',
    'SETTLED','FAILED','VOIDED','DISPUTED','EVIDENCE_SUBMITTED','RESOLVED_WON','RESOLVED_LOST','REFUNDED')),
  amount_minor bigint not null check (amount_minor >= 0),
  currency char(3) not null check (currency = 'USD'),
  paypal_order_id text unique,
  authorization_id text,
  authorization_history text[] not null default '{}',
  capture_id text unique,
  auth_created_at timestamptz,
  honor_ends_at timestamptz,
  auth_expires_at timestamptz,
  approved_by text,
  approved_at timestamptz,
  payer_id text,
  row_version int not null default 0,
  updated_at timestamptz not null default now()
);

create table fulfillment (
  order_id uuid primary key references purchase_order (id),
  carrier text not null,
  tracking_number text not null,
  shipped_at timestamptz,
  delivered_at timestamptz,
  source text not null default 'SIMULATED',
  pushed_to_paypal_at timestamptz
);

-- No FKs from webhook_event / audit_event: they reference rows by id inside payloads so they can
-- never block a delete-and-reseed of demo data.
create table webhook_event (
  event_id text primary key,                       -- PayPal event id: the idempotency key
  event_type text not null,
  raw_body bytea not null,                         -- exact bytes received; signatures are over these
  headers jsonb not null,
  received_at timestamptz not null default now(),
  verified text check (verified in ('POSTBACK','OFFLINE','FAILED')),
  processed_at timestamptz,
  error text
);

create table dispute (
  paypal_dispute_id text primary key,
  order_id uuid references purchase_order (id),
  reason text,
  status text,
  life_cycle_stage text,
  seller_response_due timestamptz,
  links jsonb,
  outcome text,
  updated_at timestamptz
);

create table evidence_bundle (
  id uuid primary key,
  dispute_id text references dispute (paypal_dispute_id),
  plan jsonb not null,
  input_json jsonb not null,
  files jsonb not null,                            -- [{name, mime, sha256, bytes_base64}]
  sha256 char(64) not null check (sha256 ~ '^[0-9a-f]{64}$'),
  reviewed_by text,
  submitted_at timestamptz,
  paypal_response jsonb
);

create table audit_event (
  seq bigserial primary key,
  ts timestamptz not null default clock_timestamp(),
  actor text not null,
  type text not null,
  entity text,
  entity_id text,
  payload jsonb not null,
  paypal_request_id text,
  paypal_debug_id text,
  prev_hash char(64) not null check (prev_hash ~ '^[0-9a-f]{64}$'),
  hash char(64) not null check (hash ~ '^[0-9a-f]{64}$')
);
