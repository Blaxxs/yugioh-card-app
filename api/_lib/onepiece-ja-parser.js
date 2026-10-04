import { load } from "cheerio";

const ORIGIN = "https://www.onepiece-cardgame.com";
const CARD_LIST_URL = `${ORIGIN}/cardlist/`;

const baseHeaders = {
  Accept: "text/html",
  "Accept-Language": "ja-JP,ja;q=0.9",
  Referer: CARD_LIST_URL,
  "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
};

const textOf = (element) =>
  element
    .clone()
    .find("h3, .getInfoBtnCol, button")
    .remove()
    .end()
    .text()
    .replace(/\s+/g, " ")
    .trim() || null;

function parseCard($, element) {
  const modal = $(element);
  const cardId = modal.attr("id");
  const name = modal.find(".cardName").first().text().replace(/\s+/g, " ").trim();
  if (!cardId || !name) return null;
  const info = modal.find(".infoCol span").map((_index, item) => $(item).text().trim()).get();
  const imageElement = modal.find(".frontCol img").first();
  const imagePath = imageElement.attr("data-src") || imageElement.attr("src");
  const imageUrl = imagePath ? new URL(imagePath, `${ORIGIN}/cardlist/`).href : null;
  const getInfo = textOf(modal.find(".getInfo").first());
  const cardNumber = info[0] || cardId;
  const rarity = info[1] || null;
  return {
    id: cardId,
    cardId,
    game: "onepiece",
    language: "ja",
    name,
    card_images: imageUrl ? [{ id: `${cardId}-1`, image_url_small: imageUrl }] : [],
    koreanData: {
      cardName: name,
      cardAttr: textOf(modal.find(".color").first()),
      cardLevel: textOf(modal.find(".cost").first()),
      cardOther: [info[2], textOf(modal.find(".feature").first())].filter(Boolean).join(" / ") || null,
      cardAtk: [textOf(modal.find(".power").first()), modal.find(".attribute img").first().attr("alt")]
        .filter(Boolean)
        .join(" · ") || null,
      cardDef: textOf(modal.find(".counter").first()),
      cardText: textOf(modal.find(".text").first()),
    },
    card_sets: getInfo
      ? [{ set_date: null, set_code: cardNumber, set_name: getInfo, set_rarity: rarity, rarity_code: rarity, price_query: cardNumber, price_queries: [cardNumber, name] }]
      : [],
    isDetailLoaded: true,
  };
}

async function fetchCardList({ term = "", series = "" }) {
  const params = new URLSearchParams({
    freewords: term,
    series,
    "cost[min]": "",
    "cost[max]": "",
    "power[min]": "",
    "power[max]": "",
  });
  const response = await fetch(CARD_LIST_URL, {
    method: "POST",
    headers: { ...baseHeaders, "Content-Type": "application/x-www-form-urlencoded" },
    body: params,
  });
  if (!response.ok) throw new Error(`일본 원피스 카드 검색 실패 (${response.status})`);
  const $ = load(await response.text());
  const cards = $(".resultCol dl.modalCol")
    .map((_index, element) => parseCard($, element))
    .get()
    .filter(Boolean);
  return { cards, nextOffset: null };
}

export async function searchCards(term) {
  return fetchCardList({ term: String(term || "").trim() });
}

export async function fetchCardById(cardId) {
  const { cards } = await fetchCardList({ term: cardId });
  const exact = cards.find((card) => card.cardId.toUpperCase() === String(cardId).toUpperCase());
  return exact || cards[0] || null;
}

export async function fetchSets() {
  const response = await fetch(CARD_LIST_URL, { headers: baseHeaders });
  if (!response.ok) throw new Error(`일본 원피스 팩 목록 요청 실패 (${response.status})`);
  const $ = load(await response.text());
  return $("#series option")
    .map((_index, element) => {
      const id = $(element).attr("value")?.trim();
      const name = $(element)
        .text()
        .replace(/<br\s*[^>]*>/gi, " ")
        .replace(/\s+/g, " ")
        .trim();
      return id ? { id, name, date: "", category: "ワンピース", path: id } : null;
    })
    .get()
    .filter(Boolean);
}

export async function fetchSetCards(series) {
  return fetchCardList({ series: String(series) });
}