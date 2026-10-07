create table if not exists public.japanese_search_dictionary (
  game text not null check (game in ('yugioh', 'pokemon', 'onepiece')),
  target text not null check (target in ('card', 'release')),
  normalized_query text not null,
  japanese_terms jsonb not null check (jsonb_typeof(japanese_terms) = 'array'),
  source text not null default 'curated' check (source in ('curated', 'gemini', 'correction')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (game, target, normalized_query)
);

alter table public.japanese_search_dictionary
  drop constraint if exists japanese_search_dictionary_source_check;
alter table public.japanese_search_dictionary
  add constraint japanese_search_dictionary_source_check check (source in ('curated', 'gemini', 'correction'));

alter table public.japanese_search_dictionary enable row level security;
revoke all on table public.japanese_search_dictionary from anon, authenticated;
grant all on table public.japanese_search_dictionary to service_role;

insert into public.japanese_search_dictionary (game, target, normalized_query, japanese_terms, source)
values
  ('yugioh', 'card', '블랙', '["ブラック"]'::jsonb, 'curated'),
  ('yugioh', 'card', '블랙매지션', '["ブラック・マジシャン"]'::jsonb, 'curated'),
  ('yugioh', 'card', '푸른눈의백룡', '["青眼の白龍"]'::jsonb, 'curated'),
  ('yugioh', 'card', '붉은눈', '["真紅眼の黒竜"]'::jsonb, 'curated'),
  ('yugioh', 'card', '블랙매지션걸', '["ブラック・マジシャン・ガール"]'::jsonb, 'curated'),
  ('yugioh', 'card', '섬도희', '["閃刀姫"]'::jsonb, 'curated'),
  ('yugioh', 'card', '스톰', '["ストーム"]'::jsonb, 'curated'),
  ('pokemon', 'card', '피카츄', '["ピカチュウ"]'::jsonb, 'curated'),
  ('pokemon', 'card', '빛나', '["ヒカリ"]'::jsonb, 'curated'),
  ('pokemon', 'card', '리자몽', '["リザードン"]'::jsonb, 'curated'),
  ('pokemon', 'card', '뮤', '["ミュウ"]'::jsonb, 'curated'),
  ('pokemon', 'card', '뮤츠', '["ミュウツー"]'::jsonb, 'curated'),
  ('pokemon', 'card', '이브이', '["イーブイ"]'::jsonb, 'curated'),
  ('pokemon', 'card', '따라큐', '["ミミッキュ"]'::jsonb, 'curated'),
  ('pokemon', 'card', '스톰', '["ストーム"]'::jsonb, 'curated'),
  ('onepiece', 'card', '루피', '["ルフィ"]'::jsonb, 'curated'),
  ('onepiece', 'card', '몽키d루피', '["モンキー・D・ルフィ", "ルフィ"]'::jsonb, 'curated'),
  ('onepiece', 'card', '우타', '["ウタ"]'::jsonb, 'curated'),
  ('onepiece', 'card', '나미', '["ナミ"]'::jsonb, 'curated'),
  ('onepiece', 'card', '조로', '["ゾロ", "ロロノア・ゾロ"]'::jsonb, 'curated'),
  ('onepiece', 'card', '상디', '["サンジ"]'::jsonb, 'curated'),
  ('onepiece', 'card', '에이스', '["エース"]'::jsonb, 'curated'),
  ('onepiece', 'card', '스톰', '["ストーム"]'::jsonb, 'curated'),
  ('yugioh', 'release', '스톰', '["ストーム"]'::jsonb, 'curated'),
  ('yugioh', 'release', '리미티드', '["LIMITED PACK GX"]'::jsonb, 'curated'),
  ('yugioh', 'release', '리미티드팩', '["LIMITED PACK GX"]'::jsonb, 'curated'),
  ('yugioh', 'release', '리미티드팩gx', '["LIMITED PACK GX"]'::jsonb, 'curated'),
  ('pokemon', 'release', '스톰', '["ストーム"]'::jsonb, 'curated'),
  ('pokemon', 'release', '메가드림', '["MEGAドリームex", "メガドリーム"]'::jsonb, 'curated'),
  ('onepiece', 'release', '스톰', '["ストーム"]'::jsonb, 'curated')
on conflict (game, target, normalized_query) do nothing;