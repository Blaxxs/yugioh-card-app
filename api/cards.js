import { load } from "cheerio";
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
import { findJapaneseCollectorNumber } from "./_lib/artofpkm-parser.js";
import {
  translateJapaneseDisplayNames,
  translateJapaneseReleaseTerms,
  translateJapaneseSearchTerms,
} from "./_lib/japanese-search-translator.js";
import { findCatalogJapaneseCardName } from "./_lib/pokemon-ja-catalog-rarity.js";
import { getSupabaseAdmin } from "./_lib/supabase-admin.js";
import { getYugiohReleaseDisplayName } from "../src/lib/yugiohReleaseNames.js";

const DETAIL_CACHE_DAYS = 30;
const SEARCH_CACHE_DAYS = 1;
const RELEASE_CACHE_DAYS = 7;
const koreanPokemonNameCache = new Map();

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

const hasKoreanName = (name) => /[\uac00-\ud7a3]/.test(String(name || ""));

const normalizeCode = (value) =>
  String(value || "")
    .replace(/[^a-z0-9]/gi, "")
    .toUpperCase();

const onePieceReleaseCode = (name) =>
  String(name || "")
    .match(/\b((?:OP|EB|ST|PRB)K?-\d{1,3})\b/i)?.[1]
    .replace(/K-/i, "-")
    .toUpperCase() || "";

async function getOfficialKoreanCardName(game, card, database) {
  const cardId = String(card.cardId || card.id || "");
  if (database && cardId) {
    const { data } = await database
      .from("card_catalog")
      .select("data")
      .eq("game", game)
      .eq("card_id", cardId)
      .maybeSingle();
    const cachedName = data?.data?.koreanData?.cardName || data?.data?.name;
    if (hasKoreanName(cachedName)) return cachedName;
  }
  if (game === "yugioh" && cardId) {
    const detail = await getCardDetail(cardId, database, "ko").catch(() => null);
    const name = detail?.data?.koreanData?.cardName || detail?.data?.name;
    return hasKoreanName(name) ? name : null;
  }
  if (game === "onepiece") {
    const code = card.card_sets?.find((set) => set.set_code)?.set_code || cardId.replace(/_p\d+$/i, "");
    if (!code) return null;
    const detail = await onePieceKr.fetchCardById(code).catch(() => null);
    const matchedCode = detail?.card_sets?.some((set) => normalizeCode(set.set_code) === normalizeCode(code));
    const name = detail?.koreanData?.cardName || detail?.name;
    return matchedCode && hasKoreanName(name) ? name : null;
  }
  return null;
}

async function findOfficialKoreanPokemonName(query) {
  const cacheKey = normalizeSearchTerm(query);
  const cached = koreanPokemonNameCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.name;
  const result = await pokemonKr.searchCards(query, 0).catch(() => ({ cards: [] }));
  const details = await mapWithConcurrency((result.cards || []).slice(0, 3), 3, (card) =>
    pokemonKr.fetchCardDetail(card.cardId, query).catch(() => null),
  );
  const officialName = details.find((card) => normalizeSearchTerm(card?.name) === cacheKey)?.name || null;
  koreanPokemonNameCache.set(cacheKey, {
    name: officialName,
    expiresAt: Date.now() + SEARCH_CACHE_DAYS * 24 * 60 * 60 * 1000,
  });
  return officialName;
}

async function localizeJapaneseCards(game, cards, database) {
  if (!cards.length) return cards;
  const displayLimit = Math.min(cards.length, 24);
  const displayCards = cards.slice(0, displayLimit);
  const cardNamesPromise = (async () => {
    const officialNames = await mapWithConcurrency(displayCards, 4, async (card) => {
      if (hasKoreanName(card.koreanData?.cardName)) return card.koreanData.cardName;
      if (cards.length > 24) return null;
      return getOfficialKoreanCardName(game, card, database).catch(() => null);
    });
    const missingIndexes = officialNames.flatMap((name, index) => (name ? [] : [index]));
    const translatedNames = await translateJapaneseDisplayNames(
      game,
      missingIndexes.map((index) => displayCards[index].name),
      "card",
    );
    if (game === "pokemon" && cards.length === 1) {
      const officialPokemonNames = await mapWithConcurrency(translatedNames, 1, (name) =>
        name ? findOfficialKoreanPokemonName(name).catch(() => null) : null,
      );
      translatedNames.forEach((name, index) => {
        translatedNames[index] = officialPokemonNames[index] || name;
      });
    }
    const displayNames = [...officialNames];
    missingIndexes.forEach((index, translatedIndex) => {
      displayNames[index] = translatedNames[translatedIndex] || cards[index].name;
    });
    return displayNames;
  })();
  const setNames = [
    ...new Set(cards.flatMap((card) => (card.card_sets || []).map((set) => set.set_name).filter(Boolean))),
  ].slice(0, 24);
  const [displayNames, localizedSetNames] = await Promise.all([
    cardNamesPromise,
    translateJapaneseDisplayNames(game, setNames, "release"),
  ]);
  const localizedSetMap = new Map(setNames.map((name, index) => [name, localizedSetNames[index] || name]));
  return cards.map((card, index) => ({
    ...card,
    localizedName: displayNames[index] || card.koreanData?.cardName || card.name,
    koreanData: { ...card.koreanData, cardName: displayNames[index] || card.koreanData?.cardName || card.name },
    card_sets: (card.card_sets || []).map((set) => ({
      ...set,
      localizedName: localizedSetMap.get(set.set_name) || set.set_name,
    })),
  }));
}

async function getYugiohReleaseNames(language = "ko") {
  const url = new URL("https://www.db.yugioh-card.com/yugiohdb/card_list.action");
  url.searchParams.set("request_locale", language);
  const $ = load(await fetchOfficialHtml(url, language));
  return $("#CardList .t_row")
    .map((_index, row) => {
      const item = $(row);
      const id = item.find(".link_value").first().val();
      const name = item.find(".main p").first().text().trim();
      return id && name ? { id: String(id), path: String(id), name } : null;
    })
    .get()
    .filter(Boolean);
}

async function localizeJapaneseReleases(game, releases) {
  if (!releases.length) return releases;
  const koreanReleases =
    game === "yugioh"
      ? await getYugiohReleaseNames("ko").catch(() => [])
      : await EXTERNAL_GAMES[game].ko.releaseList().catch(() => []);
  const koreanById = new Map(koreanReleases.map((release) => [String(release.id || release.path), release.name]));
  const koreanByCode = new Map(
    koreanReleases.map((release) => [onePieceReleaseCode(release.name), release.name]).filter(([code]) => code),
  );
  const matchedNames = releases.map((release) => {
    if (game === "yugioh") {
      const knownName = getYugiohReleaseDisplayName(release.name);
      if (knownName !== release.name) return knownName;
    }
    const sameId = koreanById.get(String(release.id || release.path));
    const sameCode = game === "onepiece" ? koreanByCode.get(onePieceReleaseCode(release.name)) : null;
    return sameId || sameCode || null;
  });
  const missingIndexes = matchedNames.flatMap((name, index) => (name ? [] : [index]));
  const translatedNames = await translateJapaneseDisplayNames(
    game,
    missingIndexes.map((index) => releases[index].name),
    "release",
  );
  return releases.map((release, index) => {
    const translated = translatedNames[missingIndexes.indexOf(index)];
    const exactKoreanName =
      !matchedNames[index] && translated
        ? koreanReleases.find((item) => normalizeSearchTerm(item.name) === normalizeSearchTerm(translated))?.name
        : null;
    return { ...release, localizedName: matchedNames[index] || exactKoreanName || translated || release.name };
  });
}

const normalizePokemonCollectorNumber = (value) => {
  const match = String(value || "")
    .normalize("NFKC")
    .match(/^\s*(.*?)\s*0*(\d{1,3})\s*\/\s*(?:0*(\d{1,3})|([a-z][a-z0-9-]*))\s*$/i);
  if (!match) return null;
  const setId = match[1].replace(/[\s:_-]+$/, "").trim();
  const denominator = match[3] ? String(Number(match[3])) : match[4].toUpperCase();
  return { setId, code: `${Number(match[2])}/${denominator}` };
};

async function searchJapanesePokemonByCollectorNumber(query) {
  const parsed = normalizePokemonCollectorNumber(query);
  if (!parsed) return [];
  let japaneseNames = [];
  if (parsed.setId) {
    const name = await findCatalogJapaneseCardName(parsed.setId, parsed.code);
    if (name) japaneseNames = [{ name, setId: parsed.setId, japanese: true }];
  } else {
    const koreanSearch = await pokemonKr.searchCards(query, 0).catch(() => ({ cards: [] }));
    const koreanCards = await mapWithConcurrency((koreanSearch.cards || []).slice(0, 12), 4, (card) =>
      pokemonKr.fetchCardDetail(card.cardId, query).catch(() => null),
    );
    const exactKoreanCards = [
      ...new Map(
        koreanCards
          .filter((card) =>
            card?.card_sets?.some((set) => normalizePokemonCollectorNumber(set.set_code)?.code === parsed.code),
          )
          .map((card) => [card.cardId, card]),
      ).values(),
    ];
    japaneseNames = exactKoreanCards.flatMap((card) => (card.name ? [{ name: card.name, japanese: false }] : []));
  }
  const sets = await fetch("https://api.tcgdex.net/v2/ja/sets", { signal: AbortSignal.timeout(8000) })
    .then((response) => (response.ok ? response.json() : []))
    .catch(() => []);
  const candidateSets = (Array.isArray(sets) ? sets : []).filter(
    (set) => Number(set.cardCount?.official) === Number(parsed.code.split("/")[1]),
  );
  const matches = await mapWithConcurrency(candidateSets, 4, async (set) => {
    const name = await findCatalogJapaneseCardName(set.id, parsed.code);
    return name ? { setId: set.id, name, japanese: true } : null;
  });
  japaneseNames.push(...matches.filter(Boolean));
  japaneseNames = [
    ...new Map(
      [...matches.filter(Boolean).map((item) => ({ ...item, japanese: true })), ...japaneseNames].map((item) => [
        `${item.setId || ""}:${item.name}`,
        item,
      ]),
    ).values(),
  ];
  if (!japaneseNames.length) return [];

  const japanesePreviews = await mapWithConcurrency(japaneseNames, 3, async ({ name, setId, japanese }) => {
    const translatedTerms = japanese ? [name] : await translateJapaneseSearchTerms("pokemon", name);
    const terms = [...new Set(translatedTerms.flatMap((term) => [term, term.replace(/ex$/i, "")].filter(Boolean)))];
    const pages = await mapWithConcurrency(terms.slice(0, 2), 2, async (term) =>
      pokemonJa.searchCards(term, 0).catch(() => ({ cards: [] })),
    );
    return pages
      .flatMap((page) => page.cards || [])
      .filter((card) => {
        const expectedSetId = parsed.setId || setId;
        if (!expectedSetId) return true;
        const imageSetId = card.card_images?.[0]?.image_url_small?.match(/\/card_images\/large\/([^/]+)\//)?.[1];
        return imageSetId?.toLowerCase() === expectedSetId.toLowerCase();
      })
      .map((card) => ({ ...card, requestedSetId: parsed.setId || null }));
  });
  const uniquePreviews = [...new Map(japanesePreviews.flat().map((card) => [card.cardId, card])).values()].slice(0, 24);
  const japaneseCards = await mapWithConcurrency(uniquePreviews, 4, (card) =>
    pokemonJa
      .fetchCardDetail(card.cardId)
      .then((detail) => detail && { ...detail, requestedSetId: card.requestedSetId })
      .catch(() => null),
  );
  return [
    ...new Map(
      japaneseCards
        .filter(
          (card) =>
            card?.card_sets?.some((set) => normalizePokemonCollectorNumber(set.set_code)?.code === parsed.code) &&
            (!card.requestedSetId ||
              card.card_images?.some((image) => {
                const imageSetId = image.image_url_small?.match(/\/card_images\/large\/([^/]+)\//)?.[1];
                return imageSetId?.toLowerCase() === card.requestedSetId.toLowerCase();
              })),
        )
        .map((card) => {
          const matchingSets = card.card_sets.filter(
            (set) => normalizePokemonCollectorNumber(set.set_code)?.code === parsed.code,
          );
          return [card.cardId, { ...card, card_sets: matchingSets }];
        }),
    ).values(),
  ];
}

const pageCacheKey = (baseKey, offset) => (offset ? `${baseKey}:offset:${offset}` : baseKey);

const matchesJapaneseCardName = (game, cardName, term) => {
  const name = normalizeSearchTerm(cardName);
  const candidate = normalizeSearchTerm(term);
  if (!name || !candidate) return false;
  if (game === "onepiece") return name.includes(candidate);
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

const proxyOfficialCardImages = (card, language = card.language || "ko") => ({
  ...card,
  card_images: (card.card_images || []).map((image) => {
    const source = image.image_url_small;
    if (!source) return image;
    try {
      const url = new URL(
        source.startsWith("/official-ygo/") ? source.slice("/official-ygo".length) : source,
        "https://www.db.yugioh-card.com",
      );
      if (url.origin === "https://www.db.yugioh-card.com" && url.pathname.endsWith("/get_image.action")) {
        url.searchParams.set("request_locale", language === "ja" ? "ja" : "ko");
        if (language === "ja") url.searchParams.set("osplang", "1");
        else url.searchParams.delete("osplang");
      }
      return url.origin === "https://www.db.yugioh-card.com"
        ? { ...image, image_url_small: `/official-ygo${url.pathname}${url.search}` }
        : image;
    } catch {
      return image;
    }
  }),
});

async function getExternalCardDetail(game, cardId, database, language, localize = true) {
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
  let card = await source.detail(cardId);
  if (!card) throw new Error("카드를 찾을 수 없습니다.");
  if (game === "pokemon" && language === "ja" && !card.card_sets?.some((set) => set.set_code)) {
    const imagePath = card.card_images?.[0]?.image_url_small || "";
    const imageSet = imagePath.match(/\/large\/([^/]+)\//)?.[1] || "";
    const setNames = [...new Set([card.card_sets?.[0]?.set_name, imageSet].filter(Boolean))];
    for (const setName of setNames) {
      const code = await findJapaneseCollectorNumber(setName, card.name);
      if (!code) continue;
      card = {
        ...card,
        card_sets: [{ ...(card.card_sets?.[0] || {}), set_date: null, set_code: code, set_name: setName }],
      };
      break;
    }
  }
  if (language === "ja" && localize) [card] = await localizeJapaneseCards(game, [card], database);
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
  const cacheVersion = game === "onepiece" ? "v16" : game === "pokemon" ? "v15" : "v4";
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
      const cards = language === "ja" ? await localizeJapaneseCards(game, page.cards, database) : page.cards;
      return { data: cards, nextOffset: page.nextOffset, cache: "HIT" };
    }
  }
  if (game === "pokemon" && language === "ja" && normalizePokemonCollectorNumber(query)) {
    const cards = await searchJapanesePokemonByCollectorNumber(query);
    const localizedCards = await localizeJapaneseCards(game, cards, database);
    if (database) {
      const expiresAt = new Date(Date.now() + SEARCH_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
      await database
        .from("card_search_cache")
        .upsert({ query_key: queryKey, results: { cards: localizedCards, nextOffset: null }, expires_at: expiresAt });
    }
    return { data: localizedCards, nextOffset: null, cache: database ? "MISS" : "BYPASS" };
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
  if (language === "ja") cards = await localizeJapaneseCards(game, cards, database);
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
  const queryKey = `${game}:${language}:releases${language === "ja" ? ":localized-v2" : ""}`;
  if (database) {
    const { data } = await database
      .from("card_search_cache")
      .select("results, expires_at")
      .eq("query_key", queryKey)
      .maybeSingle();
    if (data && new Date(data.expires_at).getTime() > Date.now()) return { data: data.results, cache: "HIT" };
  }
  let releases = await EXTERNAL_GAMES[game][language].releaseList();
  if (language === "ja") releases = await localizeJapaneseReleases(game, releases);
  if (database) {
    const expiresAt = new Date(Date.now() + RELEASE_CACHE_DAYS * 24 * 60 * 60 * 1000).toISOString();
    await database.from("card_search_cache").upsert({ query_key: queryKey, results: releases, expires_at: expiresAt });
  }
  return { data: releases, cache: database ? "MISS" : "BYPASS" };
}

async function getExternalReleaseCards(game, setId, database, offset = 0, language) {
  const cacheScope =
    game === "onepiece"
      ? `${game}:${language}:v4:set:${setId}`
      : game === "pokemon"
        ? `${game}:${language}:v7:set:${setId}`
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
      const cards = language === "ja" ? await localizeJapaneseCards(game, page.cards, database) : page.cards;
      return { data: cards, nextOffset: page.nextOffset, cache: "HIT" };
    }
  }
  let page = normalizeExternalPage(await EXTERNAL_GAMES[game][language].releaseCards(setId, offset), game, offset);
  if (language === "ja") page = { ...page, cards: await localizeJapaneseCards(game, page.cards, database) };
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
    if (staleCard && isFresh(data.updated_at))
      return { data: proxyOfficialCardImages(staleCard, language), cache: "HIT" };
  }

  try {
    const html = await fetchOfficialHtml(createDetailUrl(cardId, language), language);
    let card = parseCardDetail(html, cardId, staleCard?.name, staleCard?.card_images?.[0]?.image_url_small, language);
    if (language === "ja") [card] = await localizeJapaneseCards("yugioh", [card], database);
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
    return { data: proxyOfficialCardImages(card, language), cache: database ? "MISS" : "BYPASS" };
  } catch (error) {
    if (staleCard) return { data: proxyOfficialCardImages(staleCard, language), cache: "STALE" };
    throw error;
  }
}

async function searchCards(query, database, language, filters = {}) {
  const normalizedTerm = normalizeSearchTerm(query);
  const filterKey = JSON.stringify(Object.fromEntries(Object.entries(filters).filter(([, value]) => value)));
  const queryKey = `yugioh:v13:${language}:${normalizedTerm}:${filterKey}`;
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
    if (data && new Date(data.expires_at).getTime() > Date.now()) {
      const cards = language === "ja" ? await localizeJapaneseCards("yugioh", data.results, database) : data.results;
      return { data: cards.map((card) => proxyOfficialCardImages(card, language)), cache: "HIT" };
    }
  }

  let cards = [];
  if (language === "ja") {
    const prefixMatch = query.toUpperCase().match(/^([A-Z0-9]{2,8})(?:-?JP)?$/);
    const prefix = prefixMatch?.[1];
    const looksLikePrefix = prefix && (/[0-9]/.test(prefix) || query === query.toUpperCase());
    if (looksLikePrefix) {
      const prefixCodes = Array.from(
        { length: 20 },
        (_unused, index) => `${prefix}-JP${String(index + 1).padStart(3, "0")}`,
      );
      const prefixResults = await mapWithConcurrency(prefixCodes, 5, async (code) => {
        const codeUrl = createSearchUrl(code, language, filters);
        codeUrl.searchParams.set("stype", "4");
        const html = await fetchOfficialHtml(codeUrl, language).catch(() => "");
        return html ? parseSearchResults(html, "", language) : [];
      });
      cards = [...new Map(prefixResults.flat().map((card) => [card.cardId, card])).values()];
    }
  }

  const looksLikeSetCode = /^[a-z0-9]{2,}(?:-[a-z0-9]+)+$/i.test(query);
  if (!cards.length && looksLikeSetCode) {
    const codeUrl = createSearchUrl(query.toUpperCase(), language, filters);
    codeUrl.searchParams.set("stype", "4");
    const codeHtml = await fetchOfficialHtml(codeUrl, language).catch(() => "");
    if (codeHtml) cards = parseSearchResults(codeHtml, "", language);
  }

  const koreanJapaneseQuery = language === "ja" && /[\uac00-\ud7a3]/i.test(query);
  const translatedTerms = koreanJapaneseQuery ? await translateJapaneseSearchTerms("yugioh", query) : [];
  if (!cards.length && translatedTerms.length) {
    const translatedResults = await mapWithConcurrency(translatedTerms, 3, async (term) => {
      const translatedHtml = await fetchOfficialHtml(createSearchUrl(term, language, filters), language).catch(
        () => "",
      );
      return translatedHtml ? parseSearchResults(translatedHtml, term, language) : [];
    });
    cards = [...new Map(translatedResults.flat().map((card) => [card.cardId, card])).values()];
  }
  if (!cards.length && !koreanJapaneseQuery) {
    const html = await fetchOfficialHtml(createSearchUrl(query, language, filters), language);
    cards = parseSearchResults(html, query, language);
  }
  if (!cards.length && !koreanJapaneseQuery && normalizedTerm.length > 1) {
    const fallbackHtml = await fetchOfficialHtml(
      createSearchUrl(normalizedTerm.slice(0, 2), language, filters),
      language,
    );
    cards = parseSearchResults(fallbackHtml, query, language);
  }
  if (language === "ja") cards = await localizeJapaneseCards("yugioh", cards, database);

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
  const translationTarget = requestUrl.searchParams.get("translate");
  const displayKind = requestUrl.searchParams.get("kind");
  const displayNames = requestUrl.searchParams.getAll("name").map((name) => name.trim());
  const displayIds = requestUrl.searchParams.getAll("itemId");
  const displayCodes = requestUrl.searchParams.getAll("code");
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
  if (translationTarget && !["release", "display"].includes(translationTarget)) {
    return response.status(400).json({ error: "지원하지 않는 번역 요청입니다." });
  }
  if (translationTarget === "release" && (language !== "ja" || !query)) {
    return response.status(400).json({ error: "일본판 수록명 번역에는 검색어가 필요합니다." });
  }
  if (
    translationTarget === "display" &&
    (language !== "ja" ||
      !["cards", "releases"].includes(displayKind) ||
      !displayNames.length ||
      displayNames.length > 100)
  ) {
    return response.status(400).json({ error: "일본어 카드·수록명 번역 요청이 올바르지 않습니다." });
  }
  if (displayNames.some((name) => !name || name.length > 160)) {
    return response.status(400).json({ error: "번역할 이름이 비어 있거나 너무 깁니다." });
  }
  if (!cardId && !query && !releases && !setId && translationTarget !== "display") {
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
    if (translationTarget === "release") {
      return response.status(200).json(await translateJapaneseReleaseTerms(game, query));
    }
    const database = getSupabaseAdmin();
    if (translationTarget === "display") {
      if (displayKind === "cards") {
        const cards = displayNames.map((name, index) => ({
          id: displayIds[index] || name,
          cardId: displayIds[index] || "",
          name,
          koreanData: { cardName: name },
          card_sets: displayCodes[index] ? [{ set_code: displayCodes[index] }] : [],
        }));
        const localized = await localizeJapaneseCards(game, cards, database);
        return response.status(200).json(localized.map((card) => card.localizedName));
      }
      const releaseItems = displayNames.map((name, index) => ({
        id: displayIds[index] || "",
        path: displayIds[index] || "",
        name,
      }));
      const localized = await localizeJapaneseReleases(game, releaseItems);
      return response.status(200).json(localized.map((release) => release.localizedName));
    }
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
              ? await getExternalCardDetail(
                  game,
                  cardId,
                  database,
                  language,
                  requestUrl.searchParams.get("localize") !== "0",
                )
              : await getExternalSearch(
                  game,
                  query,
                  database,
                  game === "pokemon" || game === "onepiece" ? offset : 0,
                  language,
                  searchFilters,
                )
        : releases
          ? { data: await getYugiohReleaseNames(language), cache: "BYPASS" }
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
