import { load } from "cheerio";

const ORIGIN = "https://jp.pokellector.com";
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
const RARITIES = {
  common: ["C", "커먼"],
  uncommon: ["U", "언커먼"],
  none: ["N", "노멀"],
  rare: ["R", "레어"],
  holo: ["R", "홀로 레어"],
  "holo rare": ["R", "홀로 레어"],
  "rare holo": ["R", "홀로 레어"],
  "double rare": ["RR", "RR"],
  shiny: ["S", "S"],
  "shiny rare": ["S", "S"],
  "shiny ultra rare": ["SSR", "SSR"],
  "shiny super rare": ["SSR", "SSR"],
  "super secret rare": ["SSR", "SSR"],
  "illustration rare": ["AR", "AR"],
  "art rare": ["AR", "AR"],
  "special illustration rare": ["SAR", "SAR"],
  "special art rare": ["SAR", "SAR"],
  "mega attack rare": ["MA", "MA"],
  "mega hyper rare": ["MUR", "MUR"],
  "black white rare": ["BWR", "BWR"],
  "ace spec rare": ["ACE", "ACE"],
  "triple rare": ["RRR", "RRR"],
  "radiant rare": ["K", "K"],
  "character rare": ["CHR", "CHR"],
  "character super rare": ["CSR", "CSR"],
};
const normalize = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .replace("励ましの手紙", "はげましのてがみ")
    .toLowerCase();
const normalizeCatalogCode = (value) =>
  String(value || "")
    .normalize("NFKC")
    .replace(/\s/g, "")
    .toUpperCase()
    .replace(/^0*(\d+)(?=\/)/, (_match, number) => String(Number(number)))
    .replace(/\/(?:0*)(\d+)$/, (_match, number) => `/${Number(number)}`);

async function fetchHtml(path) {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetch(`${ORIGIN}${path}`, {
    headers: { Accept: "text/html", "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0" },
    signal: AbortSignal.timeout(8000),
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`일본판 카탈로그 요청 실패 (${response.status})`);
      return response.text();
    })
    .catch((error) => {
      cache.delete(path);
      throw error;
    });
  cache.set(path, { request, expiresAt: Date.now() + TTL });
  if (cache.size > 500) cache.delete(cache.keys().next().value);
  return request;
}

export function parseCatalogRarity(html, setPath, setCode, name, verifiedJapaneseName = "") {
  const $ = load(html);
  const fields = {};
  $(".infoblurb > div").each((_index, element) => {
    const block = $(element);
    const label = block.find("strong").first().text().replace(/:$/, "").trim().toLowerCase();
    if (!label) return;
    fields[label] = block.clone().find("strong").remove().end().text().replace(/\s+/g, " ").trim();
    const href = block.find("a[href]").first().attr("href");
    if (href) fields[`${label}Path`] = new URL(href, ORIGIN).pathname;
  });
  if (
    normalize(fields.jpn || verifiedJapaneseName) !== normalize(name) ||
    fields.setPath !== setPath ||
    fields.cardPath !== setPath ||
    normalizeCatalogCode(fields.card) !== normalizeCatalogCode(setCode)
  )
    return null;
  const rawRarity = String(fields.rarity || "").trim();
  const explicitCode = /^(?:C|U|N|R|RR|RRR|SR|SSR|UR|HR|AR|SAR|S|K|ACE|MA|MUR|BWR|CHR|CSR|PROMO)$/i.test(rawRarity)
    ? rawRarity.toUpperCase()
    : null;
  const rarity = explicitCode
    ? [explicitCode, explicitCode === "N" ? "노멀" : explicitCode]
    : fields.setPath === "/Shiny-Treasures-ex-Expansion/" && rawRarity.toLowerCase() === "ultra rare"
      ? ["UR", "UR"]
      : RARITIES[rawRarity.toLowerCase()];
  if (!rarity) return null;
  return {
    code: rarity[0],
    label: rarity[1],
    source: "pokellector-ja",
    metadataId: `${setPath}#${normalizeCatalogCode(setCode)}`,
    hasPrintedSymbol: null,
  };
}

export function parseJapaneseCatalogSetPaths(html) {
  const $ = load(html);
  const paths = new Map();
  $(".buttonlisting.japanese a[name][href]").each((_index, element) => {
    const code = normalize($(element).attr("name"));
    if (!code) return;
    const url = new URL($(element).attr("href"), ORIGIN);
    if (url.origin !== ORIGIN || !/^\/[a-z0-9-]+\/$/i.test(url.pathname)) return;
    if (paths.has(code) && paths.get(code) !== url.pathname) paths.set(code, null);
    else if (!paths.has(code)) paths.set(code, url.pathname);
  });
  return paths;
}

export async function findCatalogJapaneseCardName(setId, setCode) {
  const number = String(setCode || "").match(/^\s*0*(\d{1,3})\s*\/\s*(?:0*\d{1,3}|[A-Z][A-Z0-9-]*)\s*$/i);
  if (!setId || !number) return null;
  try {
    const paths = parseJapaneseCatalogSetPaths(await fetchHtml("/sets"));
    const path = paths.get(normalize(setId));
    if (!path) return null;
    const $ = load(await fetchHtml(path));
    const cardNumber = Number(number[1]);
    const links = [
      ...new Set(
        $("a[href]")
          .toArray()
          .flatMap((element) => {
            const url = new URL($(element).attr("href"), ORIGIN);
            return url.origin === ORIGIN &&
              url.pathname.startsWith(path) &&
              Number(url.pathname.match(/-Card-(\d+)$/)?.[1]) === cardNumber
              ? [url.pathname]
              : [];
          }),
      ),
    ];
    if (links.length !== 1) return null;
    const detail = load(await fetchHtml(links[0]));
    const fields = {};
    detail(".infoblurb > div").each((_index, element) => {
      const block = detail(element);
      const label = block.find("strong").first().text().replace(/:$/, "").trim().toLowerCase();
      if (!label) return;
      fields[label] = block.clone().find("strong").remove().end().text().replace(/\s+/g, " ").trim();
      const href = block.find("a[href]").first().attr("href");
      if (href) fields[`${label}Path`] = new URL(href, ORIGIN).pathname;
    });
    if (
      !fields.jpn ||
      fields.setPath !== path ||
      fields.cardPath !== path ||
      normalizeCatalogCode(fields.card) !== normalizeCatalogCode(setCode)
    )
      return null;
    return fields.jpn;
  } catch {
    return null;
  }
}

function normalizeCatalogResult(result, isHighClass) {
  if (!result) return null;
  if (isHighClass && ["C", "U"].includes(result.code)) return { ...result, code: "N", label: "노멀" };
  return result;
}

export async function findCatalogJapaneseRarity(setId, setCode, name, officialImageUrl = "", isHighClass = false) {
  const number = String(setCode || "").match(/^(\d{1,3})\/(\d{1,3})$/);
  if (!setId || !number) return null;
  try {
    const paths = parseJapaneseCatalogSetPaths(await fetchHtml("/sets"));
    const path = paths.get(normalize(setId));
    if (!path) return null;
    const $ = load(await fetchHtml(path));
    const numberValue = Number(number[1]);
    const links = [
      ...new Set(
        $("a[href]")
          .toArray()
          .flatMap((element) => {
            const url = new URL($(element).attr("href"), ORIGIN);
            return url.origin === ORIGIN &&
              url.pathname.startsWith(path) &&
              Number(url.pathname.match(/-Card-(\d+)$/)?.[1]) === numberValue
              ? [url.pathname]
              : [];
          }),
      ),
    ];
    if (links.length !== 1) return null;
    const html = await fetchHtml(links[0]);
    const direct = parseCatalogRarity(html, path, setCode, name);
    if (direct) return normalizeCatalogResult(direct, isHighClass);
    const detail = load(html);
    const hasJapaneseName = detail(".infoblurb strong")
      .toArray()
      .some((element) => detail(element).text().trim() === "JPN:");
    if (hasJapaneseName) return null;
    const key = `identity:${String(setId).toLowerCase()}`;
    const cached = cache.get(key);
    if (!cached || cached.expiresAt <= Date.now()) {
      const request = fetch(`https://api.tcgdex.net/v2/ja/sets/${encodeURIComponent(setId)}`, {
        signal: AbortSignal.timeout(8000),
      })
        .then(async (response) => {
          if (!response.ok) throw new Error("세트 일본어 이름 대조 실패");
          return response.json();
        })
        .catch((error) => {
          cache.delete(key);
          throw error;
        });
      cache.set(key, { request, expiresAt: Date.now() + TTL });
    }
    let pack;
    try {
      pack = await cache.get(key).request;
    } catch {
      pack = null;
    }
    const matchingPack =
      pack &&
      String(pack.id).toLowerCase() === String(setId).toLowerCase() &&
      Number(pack.cardCount?.official) === Number(number[2]);
    const entries = matchingPack
      ? (pack.cards || []).filter(
          (card) => Number(card.localId) === numberValue && normalize(card.name) === normalize(name),
        )
      : [];
    if (entries.length === 1)
      return normalizeCatalogResult(parseCatalogRarity(html, path, setCode, name, entries[0].name), isHighClass);
    const official = new URL(officialImageUrl);
    const imageSet = official.pathname.match(/\/card_images\/large\/([^/]+)\/\d+_/)?.[1];
    if (official.hostname !== "www.pokemon-card.com" || normalize(imageSet) !== normalize(setId) || !name) return null;
    return normalizeCatalogResult(parseCatalogRarity(html, path, setCode, name, name), isHighClass);
  } catch {
    return null;
  }
}
