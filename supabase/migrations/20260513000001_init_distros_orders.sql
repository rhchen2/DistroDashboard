-- supabase/migrations/20260513000001_init_distros_orders.sql

create extension if not exists "pgcrypto";

create table distros (
  id            uuid primary key default gen_random_uuid(),
  slug          text unique not null,
  display_name  text not null,
  portal_url    text,
  created_at    timestamptz not null default now()
);

create table orders (
  id                uuid primary key default gen_random_uuid(),
  distro_id         uuid not null references distros(id),
  distro_order_id   text not null,
  placed_at         date,
  status            text not null check (status in (
    'open', 'invoiced', 'partial_shipped', 'shipped', 'delivered', 'cancelled'
  )),
  expected_release  date,
  subtotal_cents    int,
  tax_cents         int,
  shipping_cents    int,
  total_cents       int,
  raw_payload       jsonb,
  first_seen_at     timestamptz not null default now(),
  last_seen_at      timestamptz not null default now(),
  unique (distro_id, distro_order_id)
);

create index orders_status_idx on orders(status);
create index orders_placed_at_idx on orders(placed_at desc);
create index orders_distro_id_idx on orders(distro_id);
