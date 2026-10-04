import { load } from "cheerio";

const ORIGIN = "https://www.pokemon-card.com";
const SEARCH_URL = `${ORIGIN}/card-search/resultAPI.php`;
const CARD_TYPES = ["pokemon", "trainer", "energy"];
let setListPromise;

const headers = () => ({
  Accept: "application/json, text/html",
  "Accept-Language": "ja-JP,ja;q=0.9",
  Referer: `${ORIGIN}/card-search/`,
  "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
});

const createPreview = (entry, pack) => {
  const name = String(entry.cardNameViewText || entry.cardNameAltText || "").trim();
  const imageUrl = entry.cardThumbFile ? new URL(entry.cardThumbFile, ORIGIN).href : null;
  return {
    id: String(entry.cardID),
    cardId: String(entry.cardID),
    game: "pokemon",
    language: "ja",
    name,
    collectorNumber: null,
    card_images: imageUrl ? [{ id: `${entry.cardID}-1`, image_url_small: imageUrl }] : [],
    koreanData: { cardName: name },
    card_sets: pack ? [{ set_date: null, set_name: pack.name }] : [],
    isDetailLoaded: false,
  };
};

async function requestCards({ term = "", packId = "", page = 0 }) {
  const pack = packId ? (await fetchSets()).find((item) => item.id.toLowerCase() === packId.toLowerCase()) : null;
  const results = await Promise.all(
    CARD_TYPES.map(async (type) => {
      const params = new URLSearchParams({
        keyword: term,
        se_ta: type,
        regulation_sidebar_form: "all",
        pg: packId,
        illust: "",
        sm_and_keyword: "true",
        page: String(page + 1),
      });
      const response = await fetch(`${SEARCH_URL}?${params}`, { headers: headers() });
      if (!response.ok) throw new Error(`일본 포켓몬 카드 검색 실패 (${response.status})`);
      const body = await response.json();
      if (body.result !== 1) throw new Error(body.errMsg || "일본 포켓몬 카드 검색에 실패했습니다.");
      return body;
    }),
  );
  const cards = [
    ...new Map(
      results
        .flatMap((result) => Object.values(result.cardList || {}))
        .filter((entry) => entry.cardID)
        .map((entry) => [String(entry.cardID), createPreview(entry, pack)]),
    ).values(),
  ];
  const maxPage = Math.max(...results.map((result) => Number(result.maxPage) || 0));
  return { cards, nextOffset: cards.length && page + 1 < maxPage ? page + 1 : null };
}

export async function searchCards(term, page = 0) {
  return requestCards({ term: String(term || "").trim(), page });
}

export async function fetchSets() {
  if (!setListPromise) {
    setListPromise = (async () => {
      const response = await fetch(`${ORIGIN}/card-search/index.php`, { headers: headers() });
      if (!response.ok) throw new Error(`일본 포켓몬 팩 목록 요청 실패 (${response.status})`);
      const html = await response.text();
      const section = html.match(/"pg"\s*:\s*\{[\s\S]*?list:\s*\[([\s\S]*?)\]\s*,?\s*\}/)?.[1] || "";
      const packs = [];
      const seen = new Set();
      for (const match of section.matchAll(/\{\s*name:\s*"pg",\s*value:\s*"([^"]*)",\s*group:\s*"[^"]*",\s*label:\s*"([^"]*)"\s*\}/g)) {
        const [, id, name] = match;
        if (!id || seen.has(id)) continue;
        seen.add(id);
        packs.push({ id, name, date: "", category: "ポケモン", path: id });
      }
      return packs;
    })().catch((error) => {
      setListPromise = null;
      throw error;
    });
  }
  return setListPromise;
}

export async function fetchSetCards(packId, page = 0) {
  return requestCards({ packId: String(packId), page });
}

export async function fetchCardDetail(cardId) {
  const response = await fetch(`${ORIGIN}/card-search/details.php/card/${encodeURIComponent(cardId)}/regu/all`, {
    headers: headers(),
  });
  if (!response.ok) throw new Error(`일본 포켓몬 카드 상세 요청 실패 (${response.status})`);
  const $ = load(await response.text());
  const name = $("h1.Heading1").first().text().trim();
  const imagePath = $("img[src*='/card_images/large/']").first().attr("src");
  const imageUrl = imagePath ? new URL(imagePath, ORIGIN).href : null;
  const imageMatch = imagePath?.match(/\/([^/]+)\/(\d+)_/);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const cardNumber = bodyText.match(/(?:^|\s)(\d{1,3})\s*\/\s*(\d{1,3})(?:\s|$)/);
  const collectorNumber = cardNumber ? Number(cardNumber[1]) : null;
  const release = (await fetchSets())
    .filter((item) => bodyText.includes(item.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  if (!name) throw new Error("일본 포켓몬 카드 상세에서 카드명을 찾을 수 없습니다.");
  return {
    id: String(cardId),
    cardId: String(cardId),
    game: "pokemon",
    language: "ja",
    name,
    collectorNumber,
    card_images: imageUrl ? [{ id: `${cardId}-1`, image_url_small: imageUrl }] : [],
    koreanData: { cardName: name },
    card_sets: imageMatch
      ? [{
          set_date: null,
          set_code: cardNumber ? `${cardNumber[1]}/${cardNumber[2]}` : imageMatch[2],
          set_name: release?.name || imageMatch[1],
        }]
      : [],
    isDetailLoaded: true,
  };
}