const apiRequests = new Map();
const apiCache = new Map();
const API_CACHE_TTL = 60 * 1000;

const requestCardApi = async (searchParams) => {
  const response = await fetch(`/api/cards?${searchParams}`);
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error(
      import.meta.env?.DEV
        ? "로컬 개발 서버에서는 /api 서버리스 함수가 실행되지 않습니다. `vercel dev`로 실행하거나 배포된 주소에서 확인해 주세요."
        : "카드 데이터 API 응답 형식이 올바르지 않습니다.",
    );
  }
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "카드 데이터를 불러오지 못했습니다.");
  const nextOffset = response.headers.get("X-Card-Next-Offset");
  return { cards: body, nextOffset: nextOffset == null ? null : Number(nextOffset) };
};

export async function fetchCardApi(params, includePageInfo = false) {
  const searchParams = new URLSearchParams(params);
  searchParams.sort();
  const key = searchParams.toString();
  const cached = apiCache.get(key);
  let page;
  if (cached && cached.expiresAt > Date.now()) {
    page = cached.page;
  } else {
    if (!apiRequests.has(key)) {
      const request = requestCardApi(searchParams)
        .then((result) => {
          apiCache.delete(key);
          apiCache.set(key, { page: result, expiresAt: Date.now() + API_CACHE_TTL });
          if (apiCache.size > 100) apiCache.delete(apiCache.keys().next().value);
          return result;
        })
        .finally(() => apiRequests.delete(key));
      apiRequests.set(key, request);
    }
    page = await apiRequests.get(key);
  }
  return structuredClone(includePageInfo ? page : page.cards);
}
