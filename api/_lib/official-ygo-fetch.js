const ORIGIN = "https://www.db.yugioh-card.com";
const languageSessions = new Map();
const SESSION_TTL = 5 * 60 * 1000;

async function getLanguageCookie(language, cardId) {
  const cached = languageSessions.get(language);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const url = new URL("/yugiohdb/card_search.action", ORIGIN);
  url.search = new URLSearchParams({ request_locale: language, ope: "2", cid: cardId });
  const request = fetch(url, {
    headers: {
      "Accept-Language": language === "ja" ? "ja-JP,ja;q=0.9" : "ko-KR,ko;q=0.9",
      "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
    },
    signal: AbortSignal.timeout(15000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`공식 이미지 언어 설정 실패 (${response.status})`);
      const cookie = response.headers
        .getSetCookie()
        .map((value) => value.split(";")[0])
        .join("; ");
      await response.arrayBuffer();
      if (!cookie) throw new Error("공식 이미지 언어 세션을 확인하지 못했습니다.");
      return cookie;
    })
    .catch((error) => {
      languageSessions.delete(language);
      throw error;
    });
  languageSessions.set(language, { request, expiresAt: Date.now() + SESSION_TTL });
  return request;
}

export async function fetchOfficialYgoResource(target, accept = "text/html") {
  const url = new URL(target);
  if (url.origin !== ORIGIN) throw new Error("허용되지 않은 공식 사이트 주소입니다.");
  const requestedLanguage = url.searchParams.get("request_locale");
  const language =
    requestedLanguage === "ko" || requestedLanguage === "ja"
      ? requestedLanguage
      : url.searchParams.get("osplang") === "1"
        ? "ja"
        : "ko";
  const headers = {
    Accept: accept,
    "Accept-Language": language === "ja" ? "ja-JP,ja;q=0.9" : "ko-KR,ko;q=0.9",
    Referer: `${ORIGIN}/yugiohdb/`,
    "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
  };
  if (url.pathname === "/yugiohdb/get_image.action") {
    const cardId = url.searchParams.get("cid");
    if (!/^\d+$/.test(cardId || "")) throw new Error("잘못된 카드 이미지 ID입니다.");
    if (language === "ko") url.searchParams.delete("osplang");
    else url.searchParams.set("osplang", "1");
    headers.Cookie = await getLanguageCookie(language, cardId);
  }
  return fetch(url, { headers, signal: AbortSignal.timeout(15000) });
}
