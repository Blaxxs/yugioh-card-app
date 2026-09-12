create table public.inventory_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  card_name text not null,
  rarity text,
  condition text,
  quantity integer not null default 0 check (quantity >= 0),
  purchase_price numeric(12, 2),
  sale_price numeric(12, 2),
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index inventory_items_user_card_idx on public.inventory_items(user_id, card_id);

create table public.favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  card_id text not null,
  card_name text not null,
  card_snapshot jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (user_id, card_id)
);

create table public.decks (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default now()
);

create table public.deck_cards (
  deck_id uuid not null references public.decks(id) on delete cascade,
  card_id text not null,
  card_name text not null,
  quantity integer not null default 1 check (quantity > 0),
  primary key (deck_id, card_id)
);

create table public.sales (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  total_price numeric(12, 2),
  memo text,
  sold_at timestamptz not null default now()
);

create table public.sale_items (
  sale_id uuid not null references public.sales(id) on delete cascade,
  inventory_item_id uuid not null references public.inventory_items(id),
  quantity integer not null check (quantity > 0),
  price numeric(12, 2),
  primary key (sale_id, inventory_item_id)
);

alter table public.inventory_items enable row level security;
alter table public.favorites enable row level security;
alter table public.decks enable row level security;
alter table public.deck_cards enable row level security;
alter table public.sales enable row level security;
alter table public.sale_items enable row level security;

create policy "Users manage their inventory"
  on public.inventory_items for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their favorites"
  on public.favorites for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their decks"
  on public.decks for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage cards in their decks"
  on public.deck_cards for all using (
    exists (select 1 from public.decks where decks.id = deck_cards.deck_id and decks.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.decks where decks.id = deck_cards.deck_id and decks.user_id = auth.uid())
  );

create policy "Users manage their sales"
  on public.sales for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "Users manage their sale items"
  on public.sale_items for all using (
    exists (select 1 from public.sales where sales.id = sale_items.sale_id and sales.user_id = auth.uid())
  ) with check (
    exists (select 1 from public.sales where sales.id = sale_items.sale_id and sales.user_id = auth.uid())
  );

create or replace function public.sell_inventory_item(
  p_inventory_item_id uuid,
  p_quantity integer,
  p_price numeric default null,
  p_memo text default null
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_sale_id uuid;
begin
  if p_quantity <= 0 then
    raise exception '판매 수량은 1 이상이어야 합니다.';
  end if;

  update public.inventory_items
  set quantity = quantity - p_quantity, updated_at = now()
  where id = p_inventory_item_id
    and user_id = auth.uid()
    and quantity >= p_quantity;

  if not found then
    raise exception '재고가 부족하거나 접근 권한이 없습니다.';
  end if;

  insert into public.sales (user_id, total_price, memo)
  values (auth.uid(), p_price * p_quantity, p_memo)
  returning id into v_sale_id;

  insert into public.sale_items (sale_id, inventory_item_id, quantity, price)
  values (v_sale_id, p_inventory_item_id, p_quantity, p_price);

  return v_sale_id;
end;
$$;
