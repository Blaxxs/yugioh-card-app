create table if not exists public.inventory_transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id) on delete cascade,
  type text not null check (type in ('purchase', 'sale')),
  quantity integer not null check (quantity > 0),
  unit_price numeric(12, 2),
  occurred_at timestamptz not null default now(),
  canceled_at timestamptz,
  memo text,
  created_at timestamptz not null default now()
);

alter table public.inventory_transactions enable row level security;
drop policy if exists "Users manage their inventory transactions" on public.inventory_transactions;
create policy "Users manage their inventory transactions"
  on public.inventory_transactions for all using (auth.uid() = user_id) with check (auth.uid() = user_id);