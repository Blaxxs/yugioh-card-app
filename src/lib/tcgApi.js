import {
  fetchOfficialCardById,
  fetchReleaseCards as fetchYugiohReleaseCards,
  fetchReleaseList as fetchYugiohReleaseList,
  searchOfficialCards,
} from "./officialCardApi";
import { fetchCardApi as fetchGameApi } from "./cardApiClient";

const fetchJapaneseNameBatch = async (game, kind, items) => {
  const params = new URLSearchParams({ game, lang: "ja", translate: "display", kind });
  items.forEach((item) => {
    params.append("name", item.name || "");
    params.append("itemId", item.id || "");
    params.append("code", item.code || "");
  });
  return fetchGameApi(params);
};

export async function localizeJapaneseCards(game, cards) {
  if (!cards.length) return cards;
  const localized = [...cards];
  const pending = cards.flatMap((card, index) =>
    card.localizedName || /[\uac00-\ud7a3]/.test(card.koreanData?.cardName || "")
      ? []
      : [
          {
            index,
            name: card.name,
            id: String(card.cardId || card.id || ""),
            code: card.card_sets?.[0]?.set_code || "",
          },
        ],
  );
  for (let index = 0; index < pending.length; index += 40) {
    const batch = pending.slice(index, index + 40);
    const names = await fetchJapaneseNameBatch(game, "cards", batch);
    batch.forEach((item, batchIndex) => {
      const name = names?.[batchIndex] || item.name;
      localized[item.index] = {
        ...localized[item.index],
        localizedName: name,
        koreanData: { ...localized[item.index].koreanData, cardName: name },
      };
    });
  }
  const setItems = [
    ...new Set(
      localized.flatMap((card) =>
        (card.card_sets || []).filter((set) => !set.localizedName && set.set_name).map((set) => set.set_name),
      ),
    ),
  ]
    .slice(0, 24)
    .map((name) => ({ name }));
  const translatedSetNames = setItems.length ? await fetchJapaneseNameBatch(game, "releases", setItems) : [];
  const setNameMap = new Map(setItems.map(({ name }, index) => [name, translatedSetNames?.[index] || name]));
  const setNames = [
    ...new Set(
      localized.flatMap((card) =>
        (card.card_sets || []).filter((set) => !set.localizedName && set.set_name).map((set) => set.set_name),
      ),
    ),
  ];
  if (!setNames.length) return localized;
  return localized.map((card) => ({
    ...card,
    card_sets: (card.card_sets || []).map((set) => ({
      ...set,
      localizedName: set.localizedName || setNameMap.get(set.set_name) || set.set_name,
    })),
  }));
}

const localizeJapaneseReleases = async (game, releases) => {
  const localized = [...releases];
  const pending = releases.flatMap((release, index) =>
    release.localizedName ? [] : [{ index, name: release.name, id: String(release.id || release.path || "") }],
  );
  for (let index = 0; index < pending.length; index += 80) {
    const batch = pending.slice(index, index + 80);
    const names = await fetchJapaneseNameBatch(game, "releases", batch);
    batch.forEach((item, batchIndex) => {
      localized[item.index] = { ...localized[item.index], localizedName: names?.[batchIndex] || item.name };
    });
  }
  return localized;
};

const toFilterParams = (filters = {}) =>
  Object.fromEntries(Object.entries(filters).filter(([, value]) => value !== "" && value != null));

export async function searchGameCards(game, term, language = "ko", filters = {}) {
  const query = String(term || "").trim();
  if (!query) return [];
  if (game === "yugioh") {
    const cards = await searchOfficialCards(query, language, filters);
    return language === "ja" ? localizeJapaneseCards(game, cards) : cards;
  }
  const cards = await fetchGameApi({
    game,
    lang: language,
    q: query,
    ...(game === "onepiece" ? { series: "all" } : {}),
    ...toFilterParams(filters),
  });
  return language === "ja" ? localizeJapaneseCards(game, cards) : cards;
}

export async function searchGameCardsPage(game, term, offset = 0, language = "ko", filters = {}) {
  const query = String(term || "").trim();
  if (!query) return { cards: [], nextOffset: null };
  if (game === "yugioh") {
    const cards = await searchOfficialCards(query, language, filters);
    return { cards: language === "ja" ? await localizeJapaneseCards(game, cards) : cards, nextOffset: null };
  }
  const page = await fetchGameApi(
    {
      game,
      lang: language,
      q: query,
      ...(game === "onepiece" ? { series: "all" } : {}),
      ...toFilterParams(filters),
      ...(game === "pokemon" || game === "onepiece" ? { offset } : {}),
    },
    true,
  );
  return language === "ja" ? { ...page, cards: await localizeJapaneseCards(game, page.cards) } : page;
}

export const isGameCardDetailLoaded = (card, game = card?.game, language = card?.language) =>
  Boolean(card?.isDetailLoaded && (game !== "pokemon" || language !== "ja" || card.detailSchemaVersion >= 8));

export async function fetchGameCardById(game, cardId, fallbackName = "", imageUrl = "", language = "ko", options = {}) {
  if (!cardId) return null;
  const card =
    game === "yugioh"
      ? await fetchOfficialCardById(cardId, fallbackName, imageUrl, language)
      : await fetchGameApi({
          game,
          id: String(cardId),
          lang: language,
          ...(game === "pokemon" && language === "ja" ? { detailVersion: "8" } : {}),
          ...(options.localize === false ? { localize: "0" } : {}),
        });
  return language === "ja" && card && options.localize !== false
    ? (await localizeJapaneseCards(game, [card]))[0]
    : card;
}

export async function fetchGameReleaseList(game, language = "ko") {
  const releases =
    game === "yugioh"
      ? await fetchYugiohReleaseList(language)
      : await fetchGameApi({ game, lang: language, releases: "1" });
  return language === "ja" ? localizeJapaneseReleases(game, releases) : releases;
}

export async function translateJapaneseReleaseQuery(game, term) {
  const query = String(term || "").trim();
  if (!query || !/[\uac00-\ud7a3]/.test(query)) return [];
  return fetchGameApi({ game, lang: "ja", q: query, translate: "release" });
}

export async function fetchGameReleaseCards(game, path, language = "ko") {
  if (!path) return [];
  if (game === "yugioh") {
    const cards = await fetchYugiohReleaseCards(path, language);
    return language === "ja" ? localizeJapaneseCards(game, cards) : cards;
  }
  if (game === "onepiece") {
    const cards = [];
    let offset = 0;
    while (offset != null) {
      const page = await fetchGameReleaseCardsPage(game, path, offset, language);
      cards.push(...page.cards);
      offset = page.nextOffset;
    }
    return language === "ja" ? localizeJapaneseCards(game, cards) : cards;
  }
  const cards = await fetchGameApi({ game, lang: language, setId: path });
  return language === "ja" ? localizeJapaneseCards(game, cards) : cards;
}

export async function fetchGameReleaseCardsPage(game, path, offset = 0, language = "ko") {
  if (!path) return { cards: [], nextOffset: null };
  if (game === "yugioh") {
    const cards = await fetchYugiohReleaseCards(path, language);
    return { cards: language === "ja" ? await localizeJapaneseCards(game, cards) : cards, nextOffset: null };
  }
  const page = await fetchGameApi(
    { game, lang: language, setId: path, ...(game === "pokemon" || game === "onepiece" ? { offset } : {}) },
    true,
  );
  return language === "ja" ? { ...page, cards: await localizeJapaneseCards(game, page.cards) } : page;
}
