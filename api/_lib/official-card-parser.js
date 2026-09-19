import { load } from "cheerio";

const OFFICIAL_SITE_ORIGIN = "https://www.db.yugioh-card.com";

const rarityCodes = new Map([
  ["노멀", "N"],
  ["패러렐 노멀", "P"],
  ["레어", "R"],
  ["골드 레어", "GR"],
  ["밀레니엄 레어", "M"],
  ["슈퍼 레어", "SR"],
  ["울트라 레어", "UR"],
  ["패러렐 울트라 레어", "P+UR"],
  ["얼티미트 레어", "UL"],
  ["시크릿 레어", "SE"],
  ["홀로그래픽 레어", "HR"],
  ["프리미엄 골드 레어", "PG"],
  ["엑스트라 시크릿 레어", "EXSE"],
  ["패러렐 엑스트라 시크릿 레어", "P+ES"],
  ["오버프레임 울트라 레어", "OFUR"],
  ["프리즈마틱 시크릿 레어", "PSE"],
  ["오버프레임 프리즈마틱 시크릿 레어", "OFPSE"],
  ["쿼터 센추리 시크릿 레어", "QCSE"],
  ["그랜드마스터 레어", "GMR"],
]);

const rarityEnglish = new Map([
  ["노멀", "Normal"],
  ["패러렐 노멀", "Parallel Rare"],
  ["레어", "Rare"],
  ["골드 레어", "Gold Rare"],
  ["밀레니엄 레어", "Millennium Rare"],
  ["슈퍼 레어", "Super Rare"],
  ["울트라 레어", "Ultra Rare"],
  ["패러렐 울트라 레어", "Parallel Ultra Rare"],
  ["얼티미트 레어", "Ultimate Rare"],
  ["시크릿 레어", "Secret Rare"],
  ["홀로그래픽 레어", "Holographic Rare"],
  ["프리미엄 골드 레어", "Premium Gold Rare"],
  ["엑스트라 시크릿 레어", "Extra Secret Rare"],
  ["패러렐 엑스트라 시크릿 레어", "Parallel Extra Secret Rare"],
  ["오버프레임 울트라 레어", "Over Frame Ultra Rare"],
  ["프리즈마틱 시크릿 레어", "Prismatic Secret Rare"],
  ["오버프레임 프리즈마틱 시크릿 레어", "Over Frame Prismatic Secret Rare"],
  ["쿼터 센추리 시크릿 레어", "Quarter Century Secret Rare"],
  ["그랜드마스터 레어", "Grandmaster Rare"],
]);

export const normalizeSearchTerm = (value) =>
  String(value || "")
    .replace(/\s+/g, "")
    .toLowerCase();

const getRarityCode = (rarity) => rarityCodes.get(rarity?.replace(/\s+/g, " ").trim()) || rarity || "";

const findImageUrls = (html, cardId, imageType = 1) =>
  [
    ...new Set(
      [
        ...html.matchAll(new RegExp(`get_image\\.action\\?type=${imageType}[^"'\\s<]*?cid=${cardId}[^"'\\s<]*`, "g")),
      ].map((match) => match[0].replaceAll("&amp;", "&")),
    ),
  ].map((path) => new URL(path, `${OFFICIAL_SITE_ORIGIN}/yugiohdb/`).href);

export const createSearchUrl = (keyword) => {
  const url = new URL(`${OFFICIAL_SITE_ORIGIN}/yugiohdb/card_search.action`);
  url.search = new URLSearchParams({
    request_locale: "ko",
    ope: "1",
    sess: "1",
    rp: "100",
    sort: "1",
    keyword,
    stype: "1",
    othercon: "2",
    link_m: "2",
    releaseDStart: "1",
    releaseMStart: "1",
    releaseYStart: "1999",
  });
  return url;
};

export const createDetailUrl = (cardId) =>
  new URL(
    `/yugiohdb/card_search.action?request_locale=ko&ope=2&cid=${encodeURIComponent(cardId)}`,
    OFFICIAL_SITE_ORIGIN,
  );

export const parseSearchResults = (html, searchTerm) => {
  const $ = load(html);
  const term = normalizeSearchTerm(searchTerm);
  const seen = new Set();
  const cards = [];

  $(".t_row.c_normal").each((_index, element) => {
    const row = $(element);
    const name = row.find(".card_name").text().trim();
    const cardId = row.find("input.cid").attr("value");
    if (!cardId || !normalizeSearchTerm(name).includes(term) || seen.has(cardId)) return;
    seen.add(cardId);
    const imageUrl = findImageUrls(html, cardId)[0];
    cards.push({
      id: cardId,
      cardId,
      name,
      card_images: imageUrl ? [{ id: `${cardId}-1`, image_url_small: imageUrl }] : [],
      koreanData: { cardName: name },
      card_sets: [],
      isDetailLoaded: false,
    });
  });
  return cards;
};

export const parseCardDetail = (html, cardId, fallbackName = "", fallbackImageUrl = "") => {
  const $ = load(html);
  const root = $("#CardSet").first().length ? $("#CardSet").first() : $.root();
  const read = (selector) => root.find(selector).first().text().trim() || null;
  const itemValue = (title) => {
    let value = null;
    root.find(".item_box").each((_index, element) => {
      const item = $(element);
      if (!value && item.find(".item_box_title").text().trim() === title) {
        value = item.find(".item_box_value").text().trim() || null;
      }
    });
    return value;
  };
  const textNode = root.find(".top .CardText .text_linebreak").first().clone();
  textNode.find("br").replaceWith("\n");
  const name =
    root
      .find("#cardname h1")
      .first()
      .contents()
      .filter((_index, node) => node.type === "text")
      .first()
      .text()
      .trim() || fallbackName;
  const attribute =
    root.find("img[src*='/attribute/']").first().closest(".item_box").find(".item_box_value").text().trim() || null;
  const level =
    root.find("img[src*='icon_level']").first().closest(".item_box").find(".item_box_value").text().trim() || null;
  const imageUrls = findImageUrls(html, cardId, 2);
  if (!imageUrls.length && fallbackImageUrl) imageUrls.push(fallbackImageUrl);
  const cardSets = [];

  $(".t_row").each((_index, element) => {
    const row = $(element);
    const setCode = row.find(".card_number").text().trim();
    const setName = row.find(".pack_name").text().trim();
    const setRarity = row.find(".rarity p").text().trim();
    if (!setCode || !setName || !setRarity) return;
    const normalizedRarity = setRarity.replace(/\s+/g, " ").trim();
    const compactRarity = setRarity.replace(/\s+/g, "");
    const rarityCode = getRarityCode(normalizedRarity);
    const englishRarity = rarityEnglish.get(normalizedRarity);
    cardSets.push({
      set_date: row.find(".time").text().trim() || null,
      set_code: setCode,
      set_name: setName,
      set_rarity: setRarity,
      rarity_code: rarityCode,
      price_query: `${setCode} ${setRarity}`,
      price_queries: [
        `${setCode} ${setRarity}`,
        `${setCode} ${compactRarity}`,
        `${setCode} ${rarityCode}`,
        englishRarity && `${setCode} ${englishRarity}`,
        `${name} ${setCode} ${setRarity}`,
        `${name} ${setCode} ${compactRarity}`,
        `${name} ${setCode} ${rarityCode}`,
        englishRarity && `${name} ${setCode} ${englishRarity}`,
      ].filter(Boolean),
    });
  });

  return {
    id: String(cardId),
    cardId: String(cardId),
    name,
    card_images: imageUrls.map((imageUrl, index) => ({ id: `${cardId}-${index + 1}`, image_url_small: imageUrl })),
    koreanData: {
      cardName: name,
      cardAttr: attribute,
      cardLevel: level,
      cardOther: read(".species"),
      cardAtk: itemValue("ATK"),
      cardDef: itemValue("DEF"),
      cardText:
        textNode
          .text()
          .replace(/\r\n/g, "\n")
          .replace(/[ \t]+\n/g, "\n")
          .replace(/\n[ \t]+/g, "\n")
          .trim() || null,
    },
    card_sets: cardSets,
    isDetailLoaded: true,
  };
};
