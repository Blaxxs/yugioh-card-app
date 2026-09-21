import {
  fetchOfficialCardById,
  fetchReleaseCards as fetchYugiohReleaseCards,
  fetchReleaseList as fetchYugiohReleaseList,
  searchOfficialCards,
} from "./officialCardApi";

const fetchGameApi = async (params) => {
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
  return body;
};

export async function searchGameCards(game, term) {
  if (game === "yugioh") return searchOfficialCards(term);
  return fetchGameApi({ game, q: term.trim() });
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
  return fetchGameApi({ game, setId: path });
}
