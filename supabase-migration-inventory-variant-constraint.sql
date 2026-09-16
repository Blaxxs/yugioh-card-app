-- Run once after supabase-migration-inventory-variants.sql.
-- This replaces the expression index with a constraint usable by Supabase upsert.
alter table public.inventory_items
  alter column set_code set default '',
  alter column rarity_code set default '';

update public.inventory_items
set set_code = coalesce(set_code, ''),
    rarity_code = coalesce(rarity_code, '');

alter table public.inventory_items
  alter column set_code set not null,
  alter column rarity_code set not null;

drop index if exists public.inventory_items_user_variant_idx;

alter table public.inventory_items
  drop constraint if exists inventory_items_user_variant_key;

alter table public.inventory_items
  add constraint inventory_items_user_variant_key unique (user_id, card_id, set_code, rarity_code);