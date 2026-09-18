import {
  createDetailUrl,
  createSearchUrl,
  normalizeSearchTerm,
  parseCardDetail,
  parseSearchResults,
} from "./_lib/official-card-parser.js";
import { getSupabaseAdmin } from "./_lib/supabase-admin.js";

const DETAIL_CACHE_DAYS = 30;
const SEARCH_CACHE_DAYS = 1;
let lastExpiredCacheCleanup = 0;

const fetchOfficialHtml = async (url) => {
  const upstream = await fetch(url, {
    headers: {
      Accept: "text/html",
      "Accept-Language": "ko-KR,ko;q=0.9",
      "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
    },
  });
  if (!upstream.ok) throw new Error(`공식 카드 DB 요청 실패 (${upstream.status})`);
  return upstream.text();
};

const isFresh = (timestamp) => Date.now() - new Date(timestamp).getTime() < DETAIL_CACHE_DAYS * 24 * 60 * 60 * 1000;

const setResponseCache = (response) => {
  response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
};

async function getCardDetail(cardId, database) {
  let staleCard = null;
  if (database) {
    const { data } = await database
      .from("card_catalog")
      .select("data, detail_loaded, updated_at")
      .eq("card_id", cardId)
      .maybeSingle();
    staleCard = data?.detail_loaded ? data.data : null;
    if (staleCard && isFresh(data.updated_at)) return { data: staleCard, cache: "HIT" };
  }

  try {
    const html = await fetchOfficialHtml(createDetailUrl(cardId));
    const card = parseCardDetail(html, cardId, staleCard?.name, staleCard?.card_images?.[0]?.image_url_small);
    if (database) {
      await database
        .from("card_catalog")
        .upsert({
          card_id: cardId,
          name: card.name,
          search_name: normalizeSearchTerm(card.name),
          data: card,
          detail_loaded: true,
          updated_at: new Date().toISOString(),
        });
    }
    return { data: card, cache: database ? "MISS" : "BYPASS" };
  } catch (error) {
    if (staleCard) return { data: staleCard, cache: "STALE" };
    throw error;
  }
}

async function searchCards(query, database) {
  const queryKey = normalizeSearchTerm(query);
  if (database) {
    if (Date.now() - lastExpiredCacheCleanup > 60 * 60 * 1000) {
      lastExpiredCacheCleanup = Date.now();
      await database.from("card_search_cache").delete().lt("expires_at", new Date().toISOString());
    }
    const { data } = await database
      .from("card_search_cache")
      .select("results, expires_at")
      .eq("query_key", queryKey)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return { data: data.results, cache: "HIT" };
  }

  let html = await fetchOfficialHtml(createSearchUrl(query));
  let cards = parseSearchResults(html, query);
  if (!cards.length && queryKey.length > 1) {
    html = await fetchOfficialHtml(createSearchUrl(queryKey.slice(0, 2)));
    cards = parseSearchResults(html, query);
  }

  if (database) {
    if (cards.length) {
      await database.from("card_catalog").upsert(
        cards.map((card) => ({
          card_id: card.cardId,
          name: card.name,
          search_name: normalizeSearchTerm(card.name),
          data: card,
          detail_loaded: false,
        })),
        { onConflict: "card_id", ignoreDuplicates: true },
      );
    }
    const expiresAt = new Date(Date.now() + SEARCH_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await database.from("card_search_cache").upsert({ query_key: queryKey, results: cards, expires_at: expiresAt });
  }
  return { data: cards, cache: database ? "MISS" : "BYPASS" };
}

export default async function handler(request, response) {
  if (request.method !== "GET") return response.status(405).json({ error: "GET 요청만 지원합니다." });
  const requestUrl = new URL(request.url, `https://${request.headers.host}`);
  const cardId = requestUrl.searchParams.get("id")?.trim();
  const query = requestUrl.searchParams.get("q")?.trim();
  if (!cardId && !query) return response.status(400).json({ error: "id 또는 q가 필요합니다." });
  if (cardId && !/^\d+$/.test(cardId)) return response.status(400).json({ error: "잘못된 카드 ID입니다." });
  if (query && query.length > 80) return response.status(400).json({ error: "검색어가 너무 깁니다." });

  try {
    const result = cardId
      ? await getCardDetail(cardId, getSupabaseAdmin())
      : await searchCards(query, getSupabaseAdmin());
    setResponseCache(response);
    response.setHeader("X-Card-Cache", result.cache);
    return response.status(200).json(result.data);
  } catch (error) {
    return response.status(502).json({ error: error.message || "카드 데이터를 불러오지 못했습니다." });
  }
}
