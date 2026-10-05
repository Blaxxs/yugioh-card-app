import { load } from "cheerio";

const ORIGIN = "https://www.artofpkm.com";
const LOOKUP_TTL = 24 * 60 * 60 * 1000;
const lookupCache = new Map();

const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/[\s・._-]/g, "")
    .toLowerCase();

async function fetchHtml(url) {
  const response = await fetch(url, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0" },
    signal: AbortSignal.timeout(6000),
  });
  if (!response.ok) return "";
  return response.text();
}

export async function findJapaneseCollectorNumber(setName, cardName) {
  const normalizedSet = normalize(setName);
  const normalizedCard = normalize(cardName);
  if (!normalizedSet || !normalizedCard) return null;
  const cacheKey = `${normalizedSet}:${normalizedCard}`;
  const cached = lookupCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.code;

  try {
    const setSearch = new URL("/cards", ORIGIN);
    setSearch.searchParams.set("q", setName);
    const setHtml = await fetchHtml(setSearch);
    if (!setHtml) return null;
    const $ = load(setHtml);
    const setIds = [
      ...new Set(
        $("a[href^='/sets/']")
          .map((_index, element) => {
            const href = $(element).attr("href") || "";
            const match = href.match(/^\/sets\/(\d+)$/);
            return match?.[1] || null;
          })
          .get()
          .filter(Boolean),
      ),
    ].slice(0, 3);

    for (const setId of setIds) {
      const cardSearch = new URL(`/sets/${setId}`, ORIGIN);
      cardSearch.searchParams.set("q", cardName);
      const cardHtml = await fetchHtml(cardSearch);
      if (!cardHtml) continue;
      const cardsPage = load(cardHtml);
      const match = cardsPage("a[href^='/sets/']")
        .toArray()
        .find((element) => {
          const href = cardsPage(element).attr("href") || "";
          if (!new RegExp(`^/sets/${setId}/card/\\d+$`).test(href)) return false;
          const rowText = normalize(cardsPage(element).parent().text());
          return rowText.includes(normalizedCard);
        });
      if (!match) continue;
      const rowText = cardsPage(match).parent().text();
      const number = rowText.match(/(\d{1,3})\s*\/\s*(\d{1,3})/);
      if (number) {
        const code = number[0].replace(/\s/g, "");
        lookupCache.set(cacheKey, { code, expiresAt: Date.now() + LOOKUP_TTL });
        return code;
      }
    }
    lookupCache.set(cacheKey, { code: null, expiresAt: Date.now() + LOOKUP_TTL });
  } catch {
    return null;
  }
  return null;
}
