import { load } from "cheerio";
import { findJapaneseRarity } from "./pokemon-ja-rarity.js";

const ORIGIN = "https://www.pokemon-card.com";
const SEARCH_URL = `${ORIGIN}/card-search/resultAPI.php`;
let setListPromise;
const setPagePromises = new Map();
const requestWaiters = [];
let activeRequests = 0;

const headers = () => ({
  Accept: "application/json, text/html",
  "Accept-Language": "ja-JP,ja;q=0.9",
  Referer: `${ORIGIN}/card-search/`,
  "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
});

async function fetchOfficial(url, options) {
  if (activeRequests >= 2) await new Promise((resolve) => requestWaiters.push(resolve));
  else activeRequests += 1;
  try {
    return await fetch(url, options);
  } finally {
    const next = requestWaiters.shift();
    if (next) next();
    else activeRequests -= 1;
  }
}

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

async function requestCards({ term = "", packId = "", page = 0, filters = {} }) {
  const pack = packId ? (await fetchSets()).find((item) => item.id.toLowerCase() === packId.toLowerCase()) : null;
  const params = new URLSearchParams({
    keyword: term,
    se_ta: filters.se_ta || "",
    regulation_sidebar_form: filters.regulation_sidebar_form || "all",
    pg: packId || filters.pg || "",
    illust: "",
    sm_and_keyword: "true",
    page: String(page + 1),
  });
  const response = await fetchOfficial(`${SEARCH_URL}?${params}`, { headers: headers() });
  if (!response.ok) throw new Error(`일본 포켓몬 카드 검색 실패 (${response.status})`);
  const body = await response.json();
  if (body.result !== 1) throw new Error(body.errMsg || "일본 포켓몬 카드 검색에 실패했습니다.");
  const cards = Object.values(body.cardList || {})
    .filter((entry) => entry.cardID)
    .map((entry) => createPreview(entry, pack));
  const maxPage = Number(body.maxPage) || 0;
  return { cards, nextOffset: cards.length && page + 1 < maxPage ? page + 1 : null };
}

export async function searchCards(term, page = 0, filters = {}) {
  return requestCards({ term: String(term || "").trim(), page, filters });
}

export async function fetchSets() {
  if (!setListPromise) {
    setListPromise = (async () => {
      const response = await fetchOfficial(`${ORIGIN}/card-search/index.php`, { headers: headers() });
      if (!response.ok) throw new Error(`일본 포켓몬 팩 목록 요청 실패 (${response.status})`);
      const html = await response.text();
      const section = html.match(/"pg"\s*:\s*\{[\s\S]*?list:\s*\[([\s\S]*?)\]\s*,?\s*\}/)?.[1] || "";
      const packs = [];
      const seen = new Set();
      for (const match of section.matchAll(
        /\{\s*name:\s*"pg",\s*value:\s*"([^"]*)",\s*group:\s*"[^"]*",\s*label:\s*"([^"]*)"\s*\}/g,
      )) {
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

export async function fetchCardBySetNumber(packId, setCode) {
  const match = String(setCode || "").match(/^(\d{1,3})(?:\s*\/\s*(\d{1,3}))?$/);
  if (!match || !packId) return null;
  const number = Number(match[1]);
  const expectedCode = match[2] ? `${number}/${Number(match[2])}` : null;
  const pageIndex = Math.floor((number - 1) / 39);
  const cacheKey = `${packId}:${pageIndex}`;
  if (!setPagePromises.has(cacheKey)) {
    setPagePromises.set(
      cacheKey,
      requestCards({ packId: String(packId), page: pageIndex }).catch((error) => {
        setPagePromises.delete(cacheKey);
        throw error;
      }),
    );
  }
  const page = await setPagePromises.get(cacheKey);
  const expectedIndex = (number - 1) % 39;
  const likelyCard = page.cards[expectedIndex];
  if (!likelyCard) return null;
  return {
    ...likelyCard,
    collectorNumber: number,
    card_sets: [
      {
        set_date: null,
        set_code: expectedCode || String(number),
        set_name: likelyCard.card_sets?.[0]?.set_name || packId,
      },
    ],
  };
}

const TYPE_NAMES = {
  grass: "풀",
  fire: "불꽃",
  water: "물",
  electric: "번개",
  psychic: "초",
  fighting: "격투",
  dark: "악",
  darkness: "악",
  steel: "강철",
  metal: "강철",
  dragon: "드래곤",
  fairy: "페어리",
  none: "무색",
};
const SECTION_NAMES = {
  ワザ: "기술",
  特性: "특성",
  特別なルール: "특별한 규칙",
  グッズ: "아이템",
  サポート: "서포트",
  スタジアム: "스타디움",
  ポケモンのどうぐ: "포켓몬의 도구",
  特殊エネルギー: "특수 에너지",
  基本エネルギー: "기본 에너지",
};

export function parseCardDetail(html, cardId, releases = []) {
  const $ = load(html);
  const textOf = (element) => element.text().replace(/\s+/g, " ").trim();
  const iconTypes = (element) =>
    element
      .find(".icon")
      .toArray()
      .flatMap((icon) => {
        const type = String($(icon).attr("class") || "").match(/\bicon-([a-z]+)\b/)?.[1];
        return type ? [TYPE_NAMES[type] || type] : [];
      });
  const name = $("h1.Heading1").first().text().trim();
  const imagePath = $("img[src*='/card_images/large/']").first().attr("src");
  const imageUrl = imagePath ? new URL(imagePath, ORIGIN).href : null;
  const imageMatch = imagePath?.match(/\/([^/]+)\/(\d+)_/);
  const bodyText = $("body").text().replace(/\s+/g, " ").trim();
  const numberText = textOf($(".LeftBox .subtext").first()) || bodyText;
  const cardNumber = numberText.match(/(\d{1,3})\s*\/\s*(\d{1,3}|[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)?)/i);
  const collectorNumber = cardNumber ? Number(cardNumber[1]) : null;
  const release = releases
    .filter((item) => bodyText.includes(item.name))
    .sort((left, right) => right.name.length - left.name.length)[0];
  if (!name) throw new Error("일본 포켓몬 카드 상세에서 카드명을 찾을 수 없습니다.");
  const content = $("h1.Heading1").first().parent().parent();
  const releaseLinks = content
    .find("a[href]")
    .toArray()
    .flatMap((element) => {
      const link = $(element);
      const url = new URL(link.attr("href"), ORIGIN);
      const label = textOf(link);
      if (!label || (!url.searchParams.has("pg") && !/^\/(?:ex|products)\//.test(url.pathname))) return [];
      const pack = releases.find((item) => item.id === url.searchParams.get("pg") || item.name === label);
      return [{ name: pack?.name || label, id: pack?.id || url.searchParams.get("pg") || null }];
    });
  const setCode = cardNumber ? `${cardNumber[1]}/${cardNumber[2].toUpperCase()}` : "";
  const promo = Boolean(cardNumber && /[A-Z]/i.test(cardNumber[2]));
  const directRarityValues = $(
    ".LeftBox .subtext [data-rarity], .LeftBox .subtext .rarity, .LeftBox .subtext .rare, .LeftBox .subtext img[src*='rarity']",
  )
    .toArray()
    .map((element) => $(element).attr("data-rarity") || $(element).attr("alt") || textOf($(element)));
  if (cardNumber) directRarityValues.push(numberText.slice(cardNumber.index + cardNumber[0].length).trim());
  const directRarities = [
    ...new Set(
      directRarityValues
        .map((value) =>
          String(value || "")
            .trim()
            .toUpperCase(),
        )
        .filter((value) => /^(?:C|U|N|R|RR|RRR|SR|SSR|UR|HR|AR|SAR|S|K|ACE|MA|MUR|BWR|CHR|CSR|PROMO)$/.test(value)),
    ),
  ];
  const directRarity = directRarities.length === 1 ? directRarities[0] : null;
  const packs = [...new Map(releaseLinks.map((pack) => [pack.name, pack])).values()];
  if (!packs.length && (cardNumber || imageMatch)) {
    packs.push({ name: release?.name || (promo ? "프로모 카드" : imageMatch?.[1] || ""), id: release?.id || null });
  }
  const right = $(".RightBox-inner").first();
  const hp = textOf(right.find(".hp-num").first()) || null;
  const rawStage = textOf(right.find(".TopInfo .type").first());
  const stage =
    { たね: "기본", "1進化": "1진화", "2進化": "2진화", 復元: "복원", レベルアップ: "레벨업" }[rawStage] ||
    rawStage ||
    null;
  const section = textOf(right.children("h2").first());
  const trainer = ["グッズ", "サポート", "スタジアム", "ポケモンのどうぐ"].includes(section);
  const energy = /エネルギー/.test(section) || /_E_/.test(imagePath || "");
  const category = hp || rawStage ? "포켓몬" : trainer ? "트레이너" : energy ? "에너지" : null;
  const type = iconTypes(right.find(".TopInfo")).join(" / ") || SECTION_NAMES[section] || null;
  const statCells = right.find("table").first().find("tr").eq(1).children("td");
  const weaknessCell = statCells.eq(0);
  const weakness = statCells.length
    ? [iconTypes(weaknessCell).join(" / "), textOf(weaknessCell)].filter(Boolean).join(" ")
    : null;
  const resistanceCell = statCells.eq(1);
  const resistance = statCells.length
    ? [iconTypes(resistanceCell).join(" / "), textOf(resistanceCell)].filter(Boolean).join(" ")
    : null;
  const retreat = statCells.length ? String(statCells.eq(2).find(".icon").length) : null;
  const descriptions = right
    .children("h2, h4, p")
    .toArray()
    .map((element) => {
      const block = $(element);
      const text = textOf(block);
      if (element.tagName === "h2") return SECTION_NAMES[text] || text;
      if (element.tagName === "h4") {
        const damage = textOf(block.find(".f_right"));
        const heading = textOf(block.clone().find(".f_right").remove().end());
        const cost = iconTypes(block);
        return [heading, cost.length ? `[${cost.join(" · ")}]` : "", damage].filter(Boolean).join(" ");
      }
      return text;
    })
    .filter(Boolean);
  const profile = textOf($(".LeftBox .card"));
  const illustrator = textOf($(".LeftBox .author a"));
  const cardText = [
    ...descriptions,
    resistance && `저항력: ${resistance}`,
    retreat != null && `후퇴: ${retreat}`,
    profile,
    illustrator && `일러스트: ${illustrator}`,
  ]
    .filter(Boolean)
    .join("\n");
  return {
    id: String(cardId),
    cardId: String(cardId),
    game: "pokemon",
    language: "ja",
    name,
    collectorNumber,
    card_images: imageUrl ? [{ id: `${cardId}-1`, image_url_small: imageUrl }] : [],
    koreanData: {
      cardName: name,
      cardOther: category,
      cardAttr: type,
      cardLevel: stage,
      cardAtk: hp,
      cardDef: weakness,
      cardText: cardText || null,
    },
    card_sets: packs.map((pack) => ({
      set_date: null,
      set_code: setCode,
      set_name: pack.name,
      set_id: pack.id,
      set_rarity: directRarity || (promo ? "프로모" : null),
      rarity_code: directRarity || (promo ? "PROMO" : null),
      ...(directRarity || promo
        ? {
            rarity_source: "official",
            rarity_metadata_id: String(cardId),
            rarity_has_printed_symbol: Boolean(directRarity),
          }
        : {}),
      price_query: setCode || name,
      price_queries: [setCode, name].filter(Boolean),
    })),
    detailSchemaVersion: 8,
    isDetailLoaded: true,
  };
}

export async function fetchCardDetail(cardId) {
  const response = await fetchOfficial(
    `${ORIGIN}/card-search/details.php/card/${encodeURIComponent(cardId)}/regu/all`,
    { headers: headers() },
  );
  if (!response.ok) throw new Error(`일본 포켓몬 카드 상세 요청 실패 (${response.status})`);
  const card = parseCardDetail(await response.text(), cardId, await fetchSets());
  if (card.card_sets.some((set) => set.rarity_code)) return card;
  const setCode = card.card_sets[0]?.set_code;
  const rarity = await findJapaneseRarity(
    card.card_images[0]?.image_url_small,
    setCode,
    card.name,
    card.card_sets.map((set) => set.set_name || "").join("\n"),
  );
  if (!rarity) return card;
  return {
    ...card,
    card_sets: card.card_sets.map((set) => ({
      ...set,
      set_rarity: rarity.label,
      rarity_code: rarity.code,
      rarity_source: rarity.source,
      rarity_metadata_id: rarity.metadataId,
      rarity_has_printed_symbol: rarity.hasPrintedSymbol,
    })),
  };
}
