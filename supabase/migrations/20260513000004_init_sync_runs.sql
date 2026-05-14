-- supabase/migrations/20260513000004_init_sync_runs.sql

create table sync_runs (
  id              uuid primary key default gen_random_uuid(),
  distro_id       uuid not null references distros(id),
  started_at      timestamptz not null default now(),
  finished_at     timestamptz,
  status          text not null check (status in ('running', 'success', 'partial', 'error')),
  orders_seen     int not null default 0,
  orders_changed  int not null default 0,
  error_message   text,
  screenshot_url  text
);

create index sync_runs_distro_started_idx on sync_runs(distro_id, started_at desc);
create index sync_runs_status_idx on sync_runs(status);
