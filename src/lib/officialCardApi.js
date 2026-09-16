const OFFICIAL_SITE_ORIGIN = "https://www.db.yugioh-card.com";

const normalizeCardName = (name) => name.replace(/\s+/g, "");

const RARITY_CODES = new Map([
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
  ["프리즈마틱 시크릿 레어", "PSE"],
  ["쿼터 센추리 시크릿 레어", "QCSE"],
  ["그랜드마스터 레어", "GMR"],
]);

const RARITY_ENGLISH = new Map([
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
  ["프리즈마틱 시크릿 레어", "Prismatic Secret Rare"],
  ["쿼터 센추리 시크릿 레어", "Quarter Century Secret Rare"],
  ["그랜드마스터 레어", "Grandmaster Rare"],
]);
const RARITY_KOREAN_BY_CODE = new Map([...RARITY_CODES.entries()].map(([name, code]) => [code.toLowerCase(), name]));
const RARITY_KOREAN_BY_ENGLISH = new Map(
  [...RARITY_ENGLISH.entries()].map(([name, english]) => [english.toLowerCase(), name]),
);

export const getRarityLabel = (rarity) => {
  if (!rarity) return "레어도 미상";
  const normalized = String(rarity).replace(/\s+/g, " ").trim();
  if (RARITY_CODES.has(normalized)) return normalized;
  return (
    RARITY_KOREAN_BY_CODE.get(normalized.toLowerCase()) ||
    RARITY_KOREAN_BY_ENGLISH.get(normalized.toLowerCase()) ||
    "레어도 미상"
  );
};

export const getRarityCode = (rarity) => {
  if (!rarity) return "";
  const normalized = String(rarity).replace(/\s+/g, " ").trim();
  return RARITY_CODES.get(normalized) || normalized;
};

const readCardText = (root, selector) => {
  const element = root.querySelector(selector);
  if (!element) return null;

  const clone = element.cloneNode(true);
  clone.querySelectorAll("br").forEach((lineBreak) => lineBreak.replaceWith("\n"));
  return (
    clone.textContent
      .replace(/<\s*br\s*\/?>/gi, "\n")
      .replace(/\r\n/g, "\n")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n[ \t]+/g, "\n")
      .trim() || null
  );
};

const fetchOfficialHtml = async (url) => {
  const response = await fetch(`/official-ygo${url.pathname}${url.search}`);
  if (!response.ok) throw new Error("공식 카드 데이터베이스에 연결할 수 없습니다.");
  return new DOMParser().parseFromString(await response.text(), "text/html");
};

const createSearchUrl = (keyword) => {
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

const createCardNumberSearchUrl = (code) => {
  const url = createSearchUrl(code);
  url.searchParams.set("stype", "4");
  return url;
};

const findCardEntries = (document, term) => {
  const seen = new Set();
  return [...document.querySelectorAll(".t_row.c_normal")]
    .filter((row) => normalizeCardName(row.querySelector(".card_name")?.textContent || "").includes(term))
    .map((row) => ({
      row,
      cardId: row.querySelector("input.cid")?.value,
      image: row.querySelector("img[id^='card_image']"),
    }))
    .filter(({ cardId, image }) => image && cardId && !seen.has(cardId) && seen.add(cardId))
    .map(({ row, cardId, image }) => ({
      cardId,
      href: new URL(`/yugiohdb/card_search.action?request_locale=ko&ope=2&cid=${cardId}`, OFFICIAL_SITE_ORIGIN),
      imageUrl:
        image.getAttribute("src") && image.getAttribute("src") !== "null"
          ? new URL(image.getAttribute("src"), OFFICIAL_SITE_ORIGIN).href
          : null,
      name: row.querySelector(".card_name")?.textContent.trim() || "",
    }));
};

const createCardPreview = ({ cardId, name, imageUrl }) => ({
  id: cardId,
  cardId,
  name,
  card_images: imageUrl ? [{ id: imageUrl, image_url_small: imageUrl }] : [],
  koreanData: { cardName: name },
  card_sets: [],
  isDetailLoaded: false,
});

export async function fetchReleaseList() {
  const url = new URL(`${OFFICIAL_SITE_ORIGIN}/yugiohdb/card_list.action`);
  url.searchParams.set("request_locale", "ko");
  const document = await fetchOfficialHtml(url);
  const seen = new Set();

  return [...document.querySelectorAll("#CardList .t_row")]
    .map((row) => {
      const path = row.querySelector(".link_value")?.value;
      const name = row.querySelector(".main p")?.textContent.trim();
      return {
        id: path,
        name,
        date: row.querySelector(".time")?.textContent.trim() || "",
        category: row.querySelector(".catergory")?.textContent.replace(/\s+/g, " ").trim() || "기타",
        path,
      };
    })
    .filter((release) => release.path && release.name && !seen.has(release.path) && seen.add(release.path));
}

const parseOfficialCard = (document, fallbackName, imageUrl, cardId) => {
  const root = document.querySelector("#CardSet") || document;
  const read = (selector) => root.querySelector(selector)?.textContent.trim() || null;
  const itemValue = (title) =>
    [...root.querySelectorAll(".item_box")]
      .find((item) => item.querySelector(".item_box_title")?.textContent.trim() === title)
      ?.querySelector(".item_box_value")
      ?.textContent.trim() || null;
  const attribute =
    root
      .querySelector("img[src*='/attribute/']")
      ?.closest(".item_box")
      ?.querySelector(".item_box_value")
      ?.textContent.trim() || null;
  const level =
    root
      .querySelector("img[src*='icon_level']")
      ?.closest(".item_box")
      ?.querySelector(".item_box_value")
      ?.textContent.trim() || null;
  const name = root.querySelector("#cardname h1")?.childNodes[0]?.textContent.trim() || fallbackName;
  const auth = document.documentElement.innerHTML.match(
    /get_image\.action\?type=2&cid=\d+&ciid=\d+&enc=([^&'" )]+)/,
  )?.[1];
  const images = [...root.querySelectorAll("img[id^='card_image']")].map((image, index) => {
    const source = image.getAttribute("src");
    const ciid = image.id.split("_").pop();
    return {
      id: `${name}-${index}`,
      image_url_small:
        source && source !== "null"
          ? new URL(source, OFFICIAL_SITE_ORIGIN).href
          : `${OFFICIAL_SITE_ORIGIN}/yugiohdb/get_image.action?type=2&cid=${cardId}&ciid=${ciid}&enc=${auth}`,
    };
  });
  const cardSets = [...document.querySelectorAll(".t_row")]
    .map((row) => {
      const setCode = row.querySelector(".card_number")?.textContent.trim();
      const setName = row.querySelector(".pack_name")?.textContent.trim();
      const setRarity = row.querySelector(".rarity p")?.textContent.trim();
      const rarityCode = setRarity ? getRarityCode(setRarity) : null;
      const compactRarity = setRarity?.replace(/\s+/g, "");
      const englishRarity = setRarity ? RARITY_ENGLISH.get(setRarity.replace(/\s+/g, " ").trim()) : null;
      return {
        set_date: row.querySelector(".time")?.textContent.trim() || null,
        set_code: setCode,
        set_name: setName,
        set_rarity: setRarity,
        rarity_code: rarityCode,
        price_query: setCode && setRarity ? `${setCode} ${setRarity}` : null,
        price_queries:
          setCode && setRarity
            ? [
                `${setCode} ${setRarity}`,
                `${setCode} ${compactRarity}`,
                `${setCode} ${rarityCode}`,
                englishRarity && `${setCode} ${englishRarity}`,
                `${name} ${setCode} ${setRarity}`,
                `${name} ${setCode} ${compactRarity}`,
                `${name} ${setCode} ${rarityCode}`,
                englishRarity && `${name} ${setCode} ${englishRarity}`,
              ].filter(Boolean)
            : [],
      };
    })
    .filter((set) => set.set_code && set.set_name && set.set_rarity);
  return {
    id: cardId,
    cardId,
    name,
    card_images: images.length ? images : [{ id: imageUrl, image_url_small: imageUrl }],
    koreanData: {
      cardName: name,
      cardAttr: attribute,
      cardLevel: level,
      cardOther: read(".species"),
      cardAtk: itemValue("ATK"),
      cardDef: itemValue("DEF"),
      cardText: readCardText(root, ".top .CardText .text_linebreak"),
    },
    card_sets: cardSets,
    isDetailLoaded: true,
  };
};

export async function fetchOfficialCardById(cardId, fallbackName = "", imageUrl = "") {
  if (!cardId) return null;
  const href = new URL(
    `/yugiohdb/card_search.action?request_locale=ko&ope=2&cid=${encodeURIComponent(cardId)}`,
    OFFICIAL_SITE_ORIGIN,
  );
  return parseOfficialCard(await fetchOfficialHtml(href), fallbackName, imageUrl, String(cardId));
}

export async function hydrateCardPreviews(cards, onHydrated) {
  const pendingCards = cards.filter((card) => !card.isDetailLoaded && !card.card_images?.length);
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < pendingCards.length) {
      const card = pendingCards[nextIndex++];
      try {
        const detailedCard = await fetchOfficialCardById(card.cardId, card.name);
        if (detailedCard) onHydrated(detailedCard);
      } catch {
        // Leave the preview empty if the official detail page is temporarily unavailable.
      }
    }
  };
  await Promise.all(Array.from({ length: Math.min(6, pendingCards.length) }, worker));
}

export async function searchOfficialCards(searchTerm) {
  const releaseCodeResults = await searchCardsByReleaseCode(searchTerm);
  if (releaseCodeResults) return releaseCodeResults;

  const term = normalizeCardName(searchTerm);
  let document = await fetchOfficialHtml(createSearchUrl(searchTerm));
  let entries = findCardEntries(document, term);
  if (!entries.length && term.length > 1) {
    document = await fetchOfficialHtml(createSearchUrl(term.slice(0, 2)));
    entries = findCardEntries(document, term);
  }
  return entries.map(createCardPreview);
}

export async function fetchReleaseCards(path) {
  if (!path) return [];
  const url = new URL(path, OFFICIAL_SITE_ORIGIN);
  url.searchParams.set("request_locale", "ko");
  const document = await fetchOfficialHtml(url);
  const entries = findCardEntries(document, "");
  return entries.map(createCardPreview);
}

const searchCardsByReleaseCode = async (searchTerm) => {
  const rawTerm = searchTerm.trim();
  if (!/^[A-Z0-9-]+$/.test(rawTerm)) return null;
  const normalized = rawTerm.replace(/\s+/g, "");
  const match = normalized.match(/^([A-Z0-9]{2,8})(?:-?KR)?(?:-?(\d{3}))?$/);
  if (!match) return null;

  const [, prefix, number] = match;
  const cardNumbers = number ? [number] : Array.from({ length: 20 }, (_, index) => String(index + 1).padStart(3, "0"));

  for (const cardNumber of cardNumbers) {
    const code = `${prefix}-KR${cardNumber}`;
    const document = await fetchOfficialHtml(createCardNumberSearchUrl(code));
    const [entry] = findCardEntries(document, "");
    if (!entry) continue;

    const card = await fetchOfficialCardById(entry.cardId, entry.name, entry.imageUrl);
    const setName = card?.card_sets?.find((set) => set.set_code?.toUpperCase().startsWith(`${prefix}-`))?.set_name;
    if (!setName) return card ? [card] : [];

    const releases = await fetchReleaseList();
    const release = releases.find((item) => item.name === setName);
    return release ? fetchReleaseCards(release.path) : [card];
  }

  return [];
};
