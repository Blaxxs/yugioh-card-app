import {
  createDetailUrl,
  createSearchUrl,
  normalizeSearchTerm,
  parseCardDetail,
  parseSearchResults,
} from "./_lib/official-card-parser.js";
import * as pokemonKr from "./_lib/pokemon-kr-parser.js";
import * as onePieceKr from "./_lib/onepiece-kr-parser.js";
import * as pokemonJa from "./_lib/pokemon-ja-parser.js";
import * as onePieceJa from "./_lib/onepiece-ja-parser.js";
import { translateJapaneseSearchTerms } from "./_lib/japanese-search-translator.js";
import { getSupabaseAdmin } from "./_lib/supabase-admin.js";

const DETAIL_CACHE_DAYS = 30;
const SEARCH_CACHE_DAYS = 1;
const RELEASE_CACHE_DAYS = 7;

// Each external game exposes the same shape so api routing stays game-agnostic.
const EXTERNAL_GAMES = {
  pokemon: {
    ko: {
      search: (term, offset, filters) => pokemonKr.searchCards(term, offset, filters),
      detail: (id, fallbackName) => pokemonKr.fetchCardDetail(id, fallbackName),
      releaseList: () => pokemonKr.fetchSets(),
      releaseCards: (packId, offset) => pokemonKr.searchCards(packId, offset),
    },
    ja: {
      search: (term, offset, filters) => pokemonJa.searchCards(term, offset, filters),
      detail: (id) => pokemonJa.fetchCardDetail(id),
      releaseList: () => pokemonJa.fetchSets(),
      releaseCards: (packId, offset) => pokemonJa.fetchSetCards(packId, offset),
    },
    // Pokémon search only returns thumbnails; hydrate real names/packs before caching.
    hydrateSearchResults: true,
  },
  onepiece: {
    ko: {
      search: (term, page, filters) => onePieceKr.searchCards(term, page, filters),
      detail: (id) => onePieceKr.fetchCardById(id),
      releaseList: () => onePieceKr.fetchSets(),
      releaseCards: (packId, page) => onePieceKr.fetchSetCards(packId, page),
    },
    ja: {
      search: (term, _page, filters) => onePieceJa.searchCards(term, filters),
      detail: (id) => onePieceJa.fetchCardById(id),
      releaseList: () => onePieceJa.fetchSets(),
      releaseCards: (packId) => onePieceJa.fetchSetCards(packId),
    },
    hydrateSearchResults: false,
  },
};
let lastExpiredCacheCleanup = 0;

const normalizeExternalPage = (result, game, offset) => {
  if (!Array.isArray(result) && Array.isArray(result?.cards)) {
    const nextOffset = Number(result.nextOffset);
    return { cards: result.cards, nextOffset: Number.isFinite(nextOffset) && nextOffset > offset ? nextOffset : null };
  }
  const cards = Array.isArray(result) ? result : [];
  return { cards, nextOffset: game === "pokemon" && cards.length ? offset + cards.length : null };
};

async function mapWithConcurrency(items, concurrency, mapItem) {
  const results = new Array(items.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await mapItem(items[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, items.length) }, worker));
  return results;
}

const pageCacheKey = (baseKey, offset) => (offset ? `${baseKey}:offset:${offset}` : baseKey);

const matchesJapaneseCardName = (game, cardName, term) => {
  const name = normalizeSearchTerm(cardName);
  const candidate = normalizeSearchTerm(term);
  if (!name || !candidate) return false;
  if (game === "onepiece") return true;
  if (game === "pokemon") return name === candidate || name.startsWith(candidate);
  return name.includes(candidate);
};

const fetchOfficialHtml = async (url, language = "ko") => {
  const upstream = await fetch(url, {
    headers: {
      Accept: "text/html",
      "Accept-Language": language === "ja" ? "ja-JP,ja;q=0.9" : "ko-KR,ko;q=0.9",
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

const proxyOfficialCardImages = (card) => ({
  ...card,
  card_images: (card.card_images || []).map((image) => {
    const source = image.image_url_small;
    if (!source || source.startsWith("/official-ygo/")) return image;
    try {
      const url = new URL(source, "https://www.db.yugioh-card.com");
      return url.origin === "https://www.db.yugioh-card.com"
        ? { ...image, image_url_small: `/official-ygo${url.pathname}${url.search}` }
        : image;
    } catch {
      return image;
    }
  }),
});

async function getExternalCardDetail(game, cardId, database, language) {
  const source = EXTERNAL_GAMES[game][language];
  if (database && language === "ko") {
    const { data } = await database
      .from("card_catalog")
      .select("data, updated_at")
      .eq("game", game)
      .eq("card_id", cardId)
      .maybeSingle();
    if (data && isFresh(data.updated_at)) return { data: data.data, cache: "HIT" };
  }
  const card = await source.detail(cardId);
  if (!card) throw new Error("카드를 찾을 수 없습니다.");
  if (database && language === "ko") {
    await database
      .from("card_catalog")
      .upsert({
        game,
        card_id: cardId,
        name: card.name,
        search_name: normalizeSearchTerm(card.name),
        data: card,
        detail_loaded: true,
        updated_at: new Date().toISOString(),
      });
  }
  return { data: card, cache: database ? "MISS" : "BYPASS" };
}

async function getExternalSearch(game, query, database, offset = 0, language = "ko", filters = {}) {
  const cacheVersion = game === "onepiece" ? "v13" : game === "pokemon" ? "v10" : "v4";
  const filterKey = JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
  const cacheScope = `${game}:${language}:${cacheVersion}:${normalizeSearchTerm(query)}:${filterKey}`;
  const queryKey = pageCacheKey(cacheScope, offset);
  if (database) {
    const { data } = await database
      .from("card_search_cache")
      .select("results, expires_at")
      .eq("query_key", queryKey)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      const page = normalizeExternalPage(data.results, game, offset);
      return { data: page.cards, nextOffset: page.nextOffset, cache: "HIT" };
    }
  }
  const config = EXTERNAL_GAMES[game];
  const koreanJapaneseQuery = language === "ja" && /[\uac00-\ud7a3]/i.test(query);
  const translatedTerms = koreanJapaneseQuery ? await translateJapaneseSearchTerms(game, query) : [];
  let searchPages;
  if (translatedTerms.length) {
    searchPages = await mapWithConcurrency(translatedTerms.slice(0, 2), 2, async (term) => {
      try {
        return normalizeExternalPage(await config[language].search(term, offset, filters), game, offset);
      } catch {
        return { cards: [], nextOffset: null };
      }
    });
  } else if (koreanJapaneseQuery) {
    searchPages = [{ cards: [], nextOffset: null }];
  } else {
    searchPages = [normalizeExternalPage(await config[language].search(query, offset, filters), game, offset)];
  }
  const keyForCard = (card) => (game === "onepiece" ? card.cardId.toUpperCase() : card.cardId);
  let cards = [...new Map(searchPages.flatMap((page) => page.cards).map((card) => [keyForCard(card), card])).values()];
  let nextOffset =
    searchPages
      .map((page) => page.nextOffset)
      .filter((value) => value != null)
      .sort((a, b) => b - a)[0] ?? null;
  if (translatedTerms.length) {
    cards = cards.filter((card) => translatedTerms.some((term) => matchesJapaneseCardName(game, card.name, term)));
    const getMatchRank = (card) => {
      const name = normalizeSearchTerm(card.name);
      return Math.min(
        ...translatedTerms.map((term, index) => {
          const candidate = normalizeSearchTerm(term);
          if (name === candidate) return index * 3;
          if (name.includes(candidate)) return index * 3 + 1;
          return 100;
        }),
      );
    };
    cards.sort((left, right) => getMatchRank(left) - getMatchRank(right));
  }
  if (config.hydrateSearchResults && language === "ko" && cards.length) {
    const previews = cards.slice(0, 24);
    const detailed = await Promise.all(
      previews.map((card) => config[language].detail(card.cardId, card.name).catch(() => card)),
    );
    cards = detailed;
  }
  if (database) {
    if (cards.length && language === "ko") {
      await database.from("card_catalog").upsert(
        cards.map((card) => ({
          game,
          card_id: card.cardId,
          name: card.name,
          search_name: normalizeSearchTerm(card.name),
          data: card,
          detail_loaded: card.isDetailLoaded,
        })),
        { onConflict: "game,card_id", ignoreDuplicates: true },
      );
    }
    const expiresAt = new Date(Date.now() + SEARCH_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await database
      .from("card_search_cache")
      .upsert({ query_key: queryKey, results: { cards, nextOffset }, expires_at: expiresAt });
  }
  return { data: cards, nextOffset, cache: database ? "MISS" : "BYPASS" };
}

async function getExternalReleaseList(game, database, language) {
  const queryKey = `${game}:${language}:releases`;
  if (database) {
    const { data } = await database
      .from("card_search_cache")
      .select("results, expires_at")
      .eq("query_key", queryKey)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return { data: data.results, cache: "HIT" };
  }
  const releases = await EXTERNAL_GAMES[game][language].releaseList();
  if (database) {
    const expiresAt = new Date(Date.now() + RELEASE_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await database.from("card_search_cache").upsert({ query_key: queryKey, results: releases, expires_at: expiresAt });
  }
  return { data: releases, cache: database ? "MISS" : "BYPASS" };
}

async function getExternalReleaseCards(game, setId, database, offset = 0, language) {
  const cacheScope =
    game === "onepiece"
      ? `${game}:${language}:v3:set:${setId}`
      : game === "pokemon"
        ? `${game}:${language}:v6:set:${setId}`
        : `${game}:${language}:set:${setId}`;
  const queryKey = pageCacheKey(cacheScope, offset);
  if (database) {
    const { data } = await database
      .from("card_search_cache")
      .select("results, expires_at")
      .eq("query_key", queryKey)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      const page = normalizeExternalPage(data.results, game, offset);
      return { data: page.cards, nextOffset: page.nextOffset, cache: "HIT" };
    }
  }
  const page = normalizeExternalPage(await EXTERNAL_GAMES[game][language].releaseCards(setId, offset), game, offset);
  if (database) {
    const expiresAt = new Date(Date.now() + RELEASE_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await database
      .from("card_search_cache")
      .upsert({
        query_key: queryKey,
        results: { cards: page.cards, nextOffset: page.nextOffset },
        expires_at: expiresAt,
      });
  }
  return { data: page.cards, nextOffset: page.nextOffset, cache: database ? "MISS" : "BYPASS" };
}

async function getCardDetail(cardId, database, language) {
  let staleCard = null;
  if (database && language === "ko") {
    const { data } = await database
      .from("card_catalog")
      .select("data, detail_loaded, updated_at")
      .eq("game", "yugioh")
      .eq("card_id", cardId)
      .maybeSingle();
    staleCard = data?.detail_loaded ? data.data : null;
    if (staleCard && isFresh(data.updated_at)) return { data: proxyOfficialCardImages(staleCard), cache: "HIT" };
  }

  try {
    const html = await fetchOfficialHtml(createDetailUrl(cardId, language), language);
    const card = parseCardDetail(html, cardId, staleCard?.name, staleCard?.card_images?.[0]?.image_url_small, language);
    if (database && language === "ko") {
      await database
        .from("card_catalog")
        .upsert({
          game: "yugioh",
          card_id: cardId,
          name: card.name,
          search_name: normalizeSearchTerm(card.name),
          data: card,
          detail_loaded: true,
          updated_at: new Date().toISOString(),
        });
    }
    return { data: proxyOfficialCardImages(card), cache: database ? "MISS" : "BYPASS" };
  } catch (error) {
    if (staleCard) return { data: proxyOfficialCardImages(staleCard), cache: "STALE" };
    throw error;
  }
}

async function searchCards(query, database, language, filters = {}) {
  const normalizedTerm = normalizeSearchTerm(query);
  const filterKey = JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
  const queryKey = `yugioh:v8:${language}:${normalizedTerm}:${filterKey}`;
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

  const koreanJapaneseQuery = language === "ja" && /[\uac00-\ud7a3]/i.test(query);
  const translatedTerms = koreanJapaneseQuery ? await translateJapaneseSearchTerms("yugioh", query) : [];
  let cards = [];
  if (translatedTerms.length) {
    const translatedResults = await mapWithConcurrency(translatedTerms, 3, async (term) => {
      const translatedHtml = await fetchOfficialHtml(createSearchUrl(term, language, filters), language).catch(
        () => "",
      );
      return translatedHtml ? parseSearchResults(translatedHtml, term) : [];
    });
    cards = [...new Map(translatedResults.flat().map((card) => [card.cardId, card])).values()];
  }
  if (!cards.length && !koreanJapaneseQuery) {
    const html = await fetchOfficialHtml(createSearchUrl(query, language, filters), language);
    cards = parseSearchResults(html, query);
  }
  if (!cards.length && !koreanJapaneseQuery && normalizedTerm.length > 1) {
    const fallbackHtml = await fetchOfficialHtml(
      createSearchUrl(normalizedTerm.slice(0, 2), language, filters),
      language,
    );
    cards = parseSearchResults(fallbackHtml, query);
  }

  if (database) {
    if (cards.length && language === "ko") {
      await database.from("card_catalog").upsert(
        cards.map((card) => ({
          game: "yugioh",
          card_id: card.cardId,
          name: card.name,
          search_name: normalizeSearchTerm(card.name),
          data: card,
          detail_loaded: false,
        })),
        { onConflict: "game,card_id", ignoreDuplicates: true },
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
  const game = requestUrl.searchParams.get("game")?.trim() || "yugioh";
  const language = requestUrl.searchParams.get("lang")?.trim() || "ko";
  const releases = requestUrl.searchParams.get("releases");
  const setId = requestUrl.searchParams.get("setId")?.trim();
  const cardId = requestUrl.searchParams.get("id")?.trim();
  const query = requestUrl.searchParams.get("q")?.trim();
  const requestedOffset = requestUrl.searchParams.get("offset");
  const offset = requestedOffset === null ? 0 : Number(requestedOffset);
  const searchFilters = Object.fromEntries(
    [
      "ctype",
      "attr",
      "search_params",
      "se_ta",
      "regulation_sidebar_form",
      "pg",
      "series",
      "colors",
      "categories",
      "rarity",
    ]
      .map((name) => [name, requestUrl.searchParams.get(name)?.trim() || ""])
      .filter(([, value]) => value),
  );
  if (game !== "yugioh" && !EXTERNAL_GAMES[game]) {
    return response.status(400).json({ error: "지원하지 않는 카드게임입니다." });
  }
  if (language !== "ko" && language !== "ja") {
    return response.status(400).json({ error: "지원하지 않는 카드 언어입니다." });
  }
  if (!cardId && !query && !releases && !setId) {
    return response.status(400).json({ error: "id, q, releases, setId 중 하나가 필요합니다." });
  }
  if (game === "yugioh" && cardId && !/^\d+$/.test(cardId)) {
    return response.status(400).json({ error: "잘못된 카드 ID입니다." });
  }
  if (query && query.length > 80) return response.status(400).json({ error: "검색어가 너무 깁니다." });
  if (!Number.isSafeInteger(offset) || offset < 0 || offset > 100000) {
    return response.status(400).json({ error: "잘못된 카드 페이지 위치입니다." });
  }

  try {
    const database = getSupabaseAdmin();
    const result =
      game !== "yugioh"
        ? releases
          ? await getExternalReleaseList(game, database, language)
          : setId
            ? await getExternalReleaseCards(
                game,
                setId,
                database,
                game === "pokemon" || game === "onepiece" ? offset : 0,
                language,
              )
            : cardId
              ? await getExternalCardDetail(game, cardId, database, language)
              : await getExternalSearch(
                  game,
                  query,
                  database,
                  game === "pokemon" || game === "onepiece" ? offset : 0,
                  language,
                  searchFilters,
                )
        : cardId
          ? await getCardDetail(cardId, database, language)
          : await searchCards(query, database, language, searchFilters);
    setResponseCache(response);
    response.setHeader("X-Card-Cache", result.cache);
    if ((game === "pokemon" || game === "onepiece") && Number.isSafeInteger(result.nextOffset)) {
      response.setHeader("X-Card-Next-Offset", String(result.nextOffset));
    }
    return response.status(200).json(result.data);
  } catch (error) {
    return response.status(502).json({ error: error.message || "카드 데이터를 불러오지 못했습니다." });
  }
}
