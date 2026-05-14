-- supabase/migrations/20260513000003_init_payments_shipments.sql

create table order_payments (
  id              uuid primary key default gen_random_uuid(),
  order_id        uuid not null references orders(id) on delete cascade,
  kind            text not null check (kind in ('deposit', 'balance', 'full', 'adjustment')),
  expected_date   date,
  expected_cents  int,
  actual_date     date,
  actual_cents    int,
  source          text not null check (source in ('scraped', 'inferred', 'manual'))
);

create index order_payments_order_idx on order_payments(order_id);
create index order_payments_expected_date_idx on order_payments(expected_date)
  where actual_date is null;
create index order_payments_actual_date_idx on order_payments(actual_date)
  where actual_date is not null;

create table shipments (
  id          uuid primary key default gen_random_uuid(),
  order_id    uuid not null references orders(id) on delete cascade,
  shipped_at  date,
  tracking    text,
  carrier     text,
  items       jsonb
);

create index shipments_order_idx on shipments(order_id);
create index shipments_shipped_at_idx on shipments(shipped_at desc);
