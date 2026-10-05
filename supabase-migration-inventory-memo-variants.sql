begin;

alter table public.inventory_items
  add column if not exists memo_key text
    generated always as (coalesce(btrim(memo), '')) stored;

alter table public.inventory_items
  drop constraint if exists inventory_items_user_variant_key;

alter table public.inventory_items
  add constraint inventory_items_user_variant_key
    unique (user_id, card_id, set_code, rarity_code, memo_key);

commit;