import {
  fetchOfficialCardById,
  fetchReleaseCards as fetchYugiohReleaseCards,
  fetchReleaseList as fetchYugiohReleaseList,
  searchOfficialCards,
} from "./officialCardApi";

const fetchGameApi = async (params, includePageInfo = false) => {
  const response = await fetch(`/api/cards?${new URLSearchParams(params)}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      import.meta.env.DEV
        ? "로컬 개발 서버에서는 /api 서버리스 함수가 실행되지 않습니다. `vercel dev`로 실행하거나 배포된 주소에서 확인해 주세요."
        : "카드 데이터 API 응답 형식이 올바르지 않습니다.",
    );
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "카드 데이터를 불러오지 못했습니다.");
  if (!includePageInfo) return body;
  const nextOffset = response.headers.get("X-Card-Next-Offset");
  return { cards: body, nextOffset: nextOffset == null ? null : Number(nextOffset) };
};

export async function searchGameCards(game, term, language = "ko") {
  const query = String(term || "").trim();
  if (!query) return [];
  if (game === "yugioh") return searchOfficialCards(query, language);
  return fetchGameApi({ game, lang: language, q: query, ...(game === "onepiece" ? { series: "all" } : {}) });
}

export async function searchGameCardsPage(game, term, offset = 0, language = "ko") {
  const query = String(term || "").trim();
  if (!query) return { cards: [], nextOffset: null };
  if (game === "yugioh") return { cards: await searchOfficialCards(query, language), nextOffset: null };
  return fetchGameApi(
    {
      game,
      lang: language,
      q: query,
      ...(game === "pokemon" || game === "onepiece" ? { offset } : {}),
      ...(game === "onepiece" ? { series: "all" } : {}),
    },
    true,
  );
}

export async function fetchGameCardById(game, cardId, fallbackName = "", imageUrl = "", language = "ko") {
  if (!cardId) return null;
  if (game === "yugioh") return fetchOfficialCardById(cardId, fallbackName, imageUrl, language);
  return fetchGameApi({ game, id: String(cardId), lang: language });
}

export async function fetchGameReleaseList(game, language = "ko") {
  if (game === "yugioh") return fetchYugiohReleaseList(language);
  return fetchGameApi({ game, lang: language, releases: "1" });
}

export async function fetchGameReleaseCards(game, path, language = "ko") {
  if (!path) return [];
  if (game === "yugioh") return fetchYugiohReleaseCards(path, language);
  if (game === "onepiece") {
    const cards = [];
    let offset = 0;
    while (offset != null) {
      const page = await fetchGameReleaseCardsPage(game, path, offset, language);
      cards.push(...page.cards);
      offset = page.nextOffset;
    }
    return cards;
  }
  return fetchGameApi({ game, lang: language, setId: path });
}

export async function fetchGameReleaseCardsPage(game, path, offset = 0, language = "ko") {
  if (!path) return { cards: [], nextOffset: null };
  if (game === "yugioh") return { cards: await fetchYugiohReleaseCards(path, language), nextOffset: null };
  return fetchGameApi(
    { game, lang: language, setId: path, ...(game === "pokemon" || game === "onepiece" ? { offset } : {}) },
    true,
  );
}
