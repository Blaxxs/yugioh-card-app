import { findCatalogJapaneseRarity } from "./pokemon-ja-catalog-rarity.js";

const ORIGIN = "https://api.tcgdex.net/v2/ja";
const cache = new Map();
const TTL = 24 * 60 * 60 * 1000;
const VERIFIED_OFFICIAL_NORMALS = new Map([
  ["44630", { setId: "SV4a", setCode: "107/190", name: "コジオ" }],
  ["44657", { setId: "SV4a", setCode: "134/190", name: "オンバット" }],
  ["44654", { setId: "SV4a", setCode: "131/190", name: "ブロロローム" }],
  ["44698", { setId: "SV4a", setCode: "175/190", name: "ネルケ" }],
  ["44705", { setId: "SV4a", setCode: "182/190", name: "ボタン" }],
  ["44713", { setId: "SV4a", setCode: "190/190", name: "ルミナスエネルギー" }],
]);
const CODES = {
  common: "C",
  uncommon: "U",
  rare: "R",
  "holo rare": "R",
  "rare holo": "R",
  "double rare": "RR",
  "triple rare": "RRR",
  "ultra rare": "SR",
  "secret rare": "SR",
  "illustration rare": "AR",
  "special illustration rare": "SAR",
  "hyper rare": "UR",
  "shiny rare": "S",
  "shiny ultra rare": "SSR",
  "character rare": "CHR",
  "character super rare": "CSR",
  "radiant rare": "K",
  "ace spec rare": "ACE",
  "black white rare": "BWR",
  promo: "PROMO",
  none: "N",
};

const normalizeName = (name) =>
  String(name || "")
    .normalize("NFKC")
    .replace(/\s+/g, "")
    .toLowerCase();

async function fetchMetadata(path) {
  const cached = cache.get(path);
  if (cached && cached.expiresAt > Date.now()) return cached.request;
  const request = fetch(`${ORIGIN}/${path}`, { signal: AbortSignal.timeout(8000) })
    .then(async (response) => {
      if (response.status === 404) {
        cache.delete(path);
        return null;
      }
      if (!response.ok) throw new Error(`레어도 메타데이터 요청 실패 (${response.status})`);
      return response.json();
    })
    .catch((error) => {
      cache.delete(path);
      throw error;
    });
  cache.set(path, { request, expiresAt: Date.now() + TTL });
  if (cache.size > 1500) cache.delete(cache.keys().next().value);
  return request;
}

export function matchJapaneseRarity(metadata, setId, setCode, name) {
  const number = String(setCode || "").match(/^(\d{1,3})\/(\d{1,3})$/);
  if (
    !number ||
    !metadata ||
    String(metadata.set?.id).toLowerCase() !== setId.toLowerCase() ||
    Number(metadata.localId) !== Number(number[1]) ||
    Number(metadata.set?.cardCount?.official) !== Number(number[2]) ||
    normalizeName(metadata.name) !== normalizeName(name)
  )
    return null;
  const raw = String(metadata.rarity || "");
  const normalized = raw.toLowerCase();
  const explicitCode = /^(?:C|U|N|R|RR|RRR|SR|SSR|UR|HR|AR|SAR|S|K|ACE|MA|MUR|BWR|CHR|CSR|PROMO)$/i.test(raw.trim())
    ? raw.trim().toUpperCase()
    : null;
  const modernSet = /^(?:sv\d|m\d)/i.test(setId);
  if (
    !explicitCode &&
    ((normalized === "ultra rare" && !modernSet) ||
      (normalized === "hyper rare" && !/^sv\d/i.test(setId)) ||
      normalized === "secret rare")
  )
    return null;
  const code =
    explicitCode ||
    (normalized === "mega hyper rare"
      ? "MUR"
      : normalized === "ultra rare" && setId.toLowerCase() === "m2a" && metadata.category === "Pokemon"
        ? "MA"
        : CODES[normalized]);
  if (!code) return null;
  return {
    code,
    label: code === "N" ? "노멀" : code,
    source: "tcgdex",
    metadataId: metadata.id,
    hasPrintedSymbol: normalized !== "none",
  };
}

export async function findJapaneseRarity(imageUrl, setCode, name, officialSetName = "") {
  try {
    const url = new URL(imageUrl);
    if (url.hostname !== "www.pokemon-card.com") return null;
    const setId = url.pathname.match(/\/card_images\/large\/([^/]+)\//)?.[1];
    const number = String(setCode || "").match(/^(\d{1,3})\/(\d{1,3})$/);
    if (!setId || !number) return null;
    const imageId = url.pathname.match(/\/card_images\/large\/[^/]+\/(\d+)_/)?.[1];
    const verified = imageId && VERIFIED_OFFICIAL_NORMALS.get(String(Number(imageId)));
    if (
      verified &&
      verified.setId.toLowerCase() === setId.toLowerCase() &&
      verified.setCode === `${number[1].padStart(3, "0")}/${Number(number[2])}` &&
      normalizeName(verified.name) === normalizeName(name)
    ) {
      return {
        code: "N",
        label: "노멀",
        source: "official-image",
        metadataId: `official:${Number(imageId)}`,
        hasPrintedSymbol: false,
      };
    }
    if (setId.toLowerCase() === "sv4a") {
      return findCatalogJapaneseRarity(setId, setCode, name, imageUrl, /ハイクラスパック/.test(officialSetName));
    }
    try {
      const pack = await fetchMetadata(`sets/${encodeURIComponent(setId)}`);
      if (pack && Number(pack.cardCount?.official) === Number(number[2])) {
        const entries = (pack.cards || []).filter(
          (card) => Number(card.localId) === Number(number[1]) && normalizeName(card.name) === normalizeName(name),
        );
        if (entries.length === 1) {
          const metadata = await fetchMetadata(`cards/${encodeURIComponent(entries[0].id)}`);
          if (metadata && !metadata.rarity) cache.delete(`cards/${encodeURIComponent(entries[0].id)}`);
          const rarity = matchJapaneseRarity(metadata, setId, setCode, name);
          if (rarity) return rarity;
        }
      }
    } catch {
      cache.delete(`sets/${encodeURIComponent(setId)}`);
    }
    return findCatalogJapaneseRarity(setId, setCode, name, imageUrl, /ハイクラスパック/.test(officialSetName));
  } catch {
    return null;
  }
}
