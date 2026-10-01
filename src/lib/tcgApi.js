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

export async function searchGameCards(game, term) {
  const query = String(term || "").trim();
  if (!query) return [];
  if (game === "yugioh") return searchOfficialCards(query);
  return fetchGameApi({ game, q: query, ...(game === "onepiece" ? { series: "all" } : {}) });
}

export async function searchGameCardsPage(game, term, offset = 0) {
  const query = String(term || "").trim();
  if (!query) return { cards: [], nextOffset: null };
  if (game === "yugioh") return { cards: await searchOfficialCards(query), nextOffset: null };
  return fetchGameApi(
    {
      game,
      q: query,
      ...(game === "pokemon" || game === "onepiece" ? { offset } : {}),
      ...(game === "onepiece" ? { series: "all" } : {}),
    },
    true,
  );
}

export async function fetchGameCardById(game, cardId, fallbackName = "", imageUrl = "") {
  if (!cardId) return null;
  if (game === "yugioh") return fetchOfficialCardById(cardId, fallbackName, imageUrl);
  return fetchGameApi({ game, id: String(cardId) });
}

export async function fetchGameReleaseList(game) {
  if (game === "yugioh") return fetchYugiohReleaseList();
  return fetchGameApi({ game, releases: "1" });
}

export async function fetchGameReleaseCards(game, path) {
  if (!path) return [];
  if (game === "yugioh") return fetchYugiohReleaseCards(path);
  if (game === "onepiece") {
    const cards = [];
    let offset = 0;
    while (offset != null) {
      const page = await fetchGameReleaseCardsPage(game, path, offset);
      cards.push(...page.cards);
      offset = page.nextOffset;
    }
    return cards;
  }
  return fetchGameApi({ game, setId: path });
}

export async function fetchGameReleaseCardsPage(game, path, offset = 0) {
  if (!path) return { cards: [], nextOffset: null };
  if (game === "yugioh") return { cards: await fetchYugiohReleaseCards(path), nextOffset: null };
  return fetchGameApi({ game, setId: path, ...(game === "pokemon" || game === "onepiece" ? { offset } : {}) }, true);
}
