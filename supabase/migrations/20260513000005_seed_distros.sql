-- supabase/migrations/20260513000005_seed_distros.sql

insert into distros (slug, display_name, portal_url)
values ('gts', 'GTS Distribution', 'https://www.gtsdistribution.com/')
on conflict (slug) do nothing;
