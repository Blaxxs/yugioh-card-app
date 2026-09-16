-- Run once in the Supabase SQL Editor before enabling rarity-specific inventory.
alter table public.inventory_items
  add column if not exists set_code text,
  add column if not exists rarity_code text;

drop index if exists public.inventory_items_user_card_idx;

create unique index if not exists inventory_items_user_variant_idx
  on public.inventory_items (user_id, card_id, coalesce(set_code, ''), coalesce(rarity_code, ''));

create index if not exists inventory_items_user_updated_idx
  on public.inventory_items (user_id, updated_at desc);