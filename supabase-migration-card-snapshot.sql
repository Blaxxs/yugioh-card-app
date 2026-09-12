alter table public.inventory_items
  add column if not exists card_snapshot jsonb not null default '{}'::jsonb;