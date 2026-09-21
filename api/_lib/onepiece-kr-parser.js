import { load } from "cheerio";

const ORIGIN = "https://onepiece-cardgame.kr";

const headers = () => ({ "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0" });

const textOf = (element) => element.text().replace(/\s+/g, " ").trim() || null;

function parseItem($, element) {
  const item = $(element);
  const name = textOf(item.find(".cardName"));
  const cardNumber = textOf(item.find(".cardNumber"));
  if (!name || !cardNumber) return null;
  const rarity = textOf(item.find(".rarity"));
  const imageSrc = item.find("img.image").attr("src");
  const attackType = textOf(item.find(".cardAttr"));
  const text = textOf(item.find(".cardText"));
  const cost = textOf(item.find(".life"));
  const power = textOf(item.find(".power"));
  const counter = textOf(item.find(".cardCounter"));
  const traits = textOf(item.find(".cardPoint"));
  const color = textOf(item.find(".cardColor"));
  const type = textOf(item.find(".cardType"));
  const pack = textOf(item.find(".cardGet"));

  return {
    id: cardNumber,
    cardId: cardNumber,
    game: "onepiece",
    name,
    card_images: imageSrc ? [{ id: `${cardNumber}-1`, image_url_small: new URL(imageSrc, ORIGIN).href }] : [],
    koreanData: {
      cardName: name,
      cardAttr: color,
      cardLevel: cost,
      cardOther: [type, traits].filter(Boolean).join(" / ") || null,
      cardAtk: [power, attackType].filter(Boolean).join(" · ") || null,
      cardDef: counter ? `카운터 ${counter}` : null,
      cardText: text,
    },
    card_sets: pack
      ? [
          {
            set_date: null,
            set_code: cardNumber,
            set_name: pack,
            set_rarity: rarity,
            rarity_code: rarity,
            price_query: cardNumber,
            price_queries: [cardNumber, name].filter(Boolean),
          },
        ]
      : [],
    isDetailLoaded: true,
  };
}

async function fetchCardList(params) {
  const url = new URL(`${ORIGIN}/cardlist.do`);
  Object.entries({
    page: "0",
    size: "100",
    freewords: "",
    categories: "",
    illustrations: "",
    colors: "",
    blockIcons: "",
    series: "",
    ...params,
  }).forEach(([key, value]) => url.searchParams.set(key, value));
  const response = await fetch(url, { headers: headers() });
  if (!response.ok) throw new Error(`원피스 카드 DB 요청 실패 (${response.status})`);
  const $ = load(await response.text());
  return $(".card_sch_list .item")
    .map((_index, element) => parseItem($, element))
    .get()
    .filter(Boolean);
}

export async function searchCards(term) {
  return fetchCardList({ freewords: term });
}

export async function fetchCardById(cardNumber) {
  const cards = await fetchCardList({ freewords: cardNumber });
  return cards.find((card) => card.cardId.toUpperCase() === String(cardNumber).toUpperCase()) || cards[0] || null;
}

export async function fetchSets() {
  const response = await fetch(`${ORIGIN}/cardlist.do`, { headers: headers() });
  if (!response.ok) throw new Error(`원피스 카드 DB 요청 실패 (${response.status})`);
  const $ = load(await response.text());
  const seen = new Set();
  const packs = [];
  $("select option").each((_index, element) => {
    const value = $(element).attr("value")?.trim();
    if (!value || value === "all" || seen.has(value)) return;
    seen.add(value);
    packs.push({ id: value, name: value, date: "", category: "원피스", path: value });
  });
  return packs;
}

export async function fetchSetCards(seriesName) {
  return fetchCardList({ series: seriesName });
}
