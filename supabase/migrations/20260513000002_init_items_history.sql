-- supabase/migrations/20260513000002_init_items_history.sql

create table order_items (
  id                uuid primary key default gen_random_uuid(),
  order_id          uuid not null references orders(id) on delete cascade,
  sku               text,
  product_name      text not null,
  qty               int not null check (qty > 0),
  unit_cost_cents   int not null check (unit_cost_cents >= 0),
  line_total_cents  int not null,
  release_date      date,
  status            text check (status is null or status in (
    'pending', 'shipped', 'cancelled', 'substituted'
  ))
);

create index order_items_order_id_idx on order_items(order_id);
create index order_items_release_date_idx on order_items(release_date);

create table order_item_history (
  id              bigserial primary key,
  order_item_id   uuid not null references order_items(id) on delete cascade,
  observed_at     timestamptz not null default now(),
  unit_cost_cents int not null,
  qty             int not null
);

create index order_item_history_item_idx on order_item_history(order_item_id, observed_at desc);

-- Trigger: append history row when price or qty changes on UPDATE.
-- INSERT does not trigger history (the initial value is the baseline).
create or replace function record_order_item_history() returns trigger
language plpgsql as $$
begin
  if (new.unit_cost_cents is distinct from old.unit_cost_cents)
     or (new.qty is distinct from old.qty) then
    insert into order_item_history (order_item_id, unit_cost_cents, qty)
    values (new.id, new.unit_cost_cents, new.qty);
  end if;
  return new;
end;
$$;

create trigger order_items_history_trg
  after update on order_items
  for each row execute function record_order_item_history();
