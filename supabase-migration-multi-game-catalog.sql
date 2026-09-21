-- Run once after supabase-migration-card-catalog.sql to support multiple card games
-- (yugioh, pokemon, onepiece) sharing the same catalog and search-cache tables.
-- Safe to run even if supabase-migration-card-catalog.sql was skipped: creates the
-- table first if it does not exist yet.
create table if not exists public.card_catalog (
  card_id text primary key,
  name text not null,
  search_name text not null,
  data jsonb not null,
  detail_loaded boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.card_catalog add column if not exists game text not null default 'yugioh';

alter table public.card_catalog drop constraint if exists card_catalog_pkey;
alter table public.card_catalog add constraint card_catalog_pkey primary key (game, card_id);

create index if not exists card_catalog_game_search_name_idx
  on public.card_catalog (game, search_name);

alter table public.card_catalog enable row level security;

drop policy if exists "Anyone can read card catalog" on public.card_catalog;
create policy "Anyone can read card catalog"
  on public.card_catalog for select using (true);

create table if not exists public.card_search_cache (
  query_key text primary key,
  results jsonb not null default '[]'::jsonb,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists card_search_cache_expires_at_idx
  on public.card_search_cache (expires_at);

alter table public.card_search_cache enable row level security;

drop policy if exists "Anyone can read card search cache" on public.card_search_cache;
create policy "Anyone can read card search cache"
  on public.card_search_cache for select using (true);
