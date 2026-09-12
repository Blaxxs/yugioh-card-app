create table if not exists public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  card_name text not null,
  card_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create unique index if not exists inventory_items_user_card_idx
  on public.inventory_items(user_id, card_id);

alter table public.inventory_items
  add column if not exists card_snapshot jsonb not null default '{}'::jsonb;

alter table public.favorites enable row level security;

drop policy if exists "Users manage their favorites" on public.favorites;
create policy "Users manage their favorites"
  on public.favorites for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
