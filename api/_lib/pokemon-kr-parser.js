import { load } from "cheerio";

const ORIGIN = "https://pokemoncard.co.kr";
const AJAX_URL = `${ORIGIN}/v2/ajax2_dev2`;
const BROWSE_DEFAULTS = {
  CardTypeNum: "1,2,3",
  CardType: "",
  CardMonType: "풀,불꽃,물,번개,초,격투,악,강철,페어리,드래곤,무색,all",
  Weakness: "풀,불꽃,물,번개,초,격투,악,강철,페어리,드래곤,무색,all",
  Resistance: "풀,불꽃,물,번개,초,격투,악,강철,페어리,드래곤,무색,all",
  TechErg: "풀,불꽃,물,번개,초,격투,악,강철,페어리,드래곤,무색,all",
  ability_label1: "",
  hp: "0,380",
  retreat: "0,5",
  order: "DESC",
  orderby: "order_num",
};

const headers = () => ({
  "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
  "X-Requested-With": "XMLHttpRequest",
  Referer: `${ORIGIN}/cards`,
});

async function postAjax(fields) {
  const form = new FormData();
  Object.entries(fields).forEach(([key, value]) => form.append(key, value));
  const response = await fetch(AJAX_URL, { method: "POST", body: form, headers: headers() });
  if (!response.ok) throw new Error(`포켓몬 카드 DB 요청 실패 (${response.status})`);
  const body = await response.json();
  if (!body.status) throw new Error(body.msg || "포켓몬 카드 검색에 실패했습니다.");
  return Object.values(body.result || {});
}

const toImageUrl = (path) =>
  path?.startsWith("http")
    ? path
    : `${ORIGIN.replace("pokemoncard.co.kr", "cards.image.pokemonkorea.co.kr")}/data/${path}`;

const previewCard = ({ CardNum, feature_image: featureImage }) => ({
  id: CardNum,
  cardId: CardNum,
  game: "pokemon",
  name: "",
  card_images: featureImage ? [{ id: `${CardNum}-1`, image_url_small: toImageUrl(featureImage) }] : [],
  koreanData: { cardName: "" },
  card_sets: [],
  isDetailLoaded: false,
});

export async function searchCards(term, limit = 0) {
  const items = await postAjax({
    action: "search_text_cards",
    search_text: term,
    search_params: "all",
    limit: String(limit),
  });
  return items.map(previewCard);
}

export async function fetchSets() {
  const response = await fetch(`${ORIGIN}/cards`, { headers: headers() });
  if (!response.ok) throw new Error(`포켓몬 카드 DB 요청 실패 (${response.status})`);
  const $ = load(await response.text());
  const seen = new Set();
  const packs = [];
  $('select[name="GoodsName"] option').each((_index, element) => {
    const name = $(element).attr("value")?.trim();
    if (!name || name === "전체" || name.endsWith("전체") || seen.has(name)) return;
    seen.add(name);
    packs.push({ id: name, name, date: "", category: "포켓몬", path: name });
  });
  return packs;
}

export async function fetchSetCards(packName, limit = 0) {
  const items = await postAjax({
    action: "get_more_cards",
    limit: String(limit),
    GoodsName: packName,
    ...BROWSE_DEFAULTS,
  });
  return items.map(previewCard);
}

const textOf = ($, selector) => $(selector).first().text().trim() || null;

export async function fetchCardDetail(cardId, fallbackName = "") {
  const response = await fetch(`${ORIGIN}/cards/detail/${encodeURIComponent(cardId)}`, { headers: headers() });
  if (!response.ok) throw new Error(`포켓몬 카드 DB 요청 실패 (${response.status})`);
  const $ = load(await response.text());

  const name = textOf($, ".card-hp.title") || fallbackName;
  const hp = textOf($, ".hp_num")?.replace(/^HP/i, "") || null;
  const species = textOf($, ".pokemon-info")?.replace(/^\s*카드\s*종류\s*:\s*/, "") || null;
  const attacks = $(".pokemon-abilities .ability")
    .map((_index, element) => {
      const block = $(element);
      const skillName = block.find(".skil_name").text().trim();
      const damage = block.find(".plus").text().trim();
      const text = block.find("p").text().trim();
      return [skillName, damage, text].filter(Boolean).join(" ");
    })
    .get()
    .filter(Boolean)
    .join("\n");
  const stats = {};
  $(".pokemon-stats .stat").each((_index, element) => {
    const block = $(element);
    const label = block.find("h4").text().trim();
    if (label) stats[label] = block.find("span").first().text().trim() || block.attr("title") || null;
  });
  const packName = textOf($, ".pokemon-detail a.search_href");
  const numberBlock = $(".p_num").first();
  const setNumber = numberBlock.clone().children().remove().end().text().trim() || null;
  const rarity = numberBlock.find("#no_wrap_by_admin").text().trim() || null;
  const illustrator =
    textOf($, ".illustrator")
      ?.replace(/^일러스트/, "")
      .trim() || null;
  const imageUrl = $(".feature_image").attr("src") || null;

  return {
    id: String(cardId),
    cardId: String(cardId),
    game: "pokemon",
    name,
    card_images: imageUrl ? [{ id: `${cardId}-1`, image_url_small: imageUrl }] : [],
    koreanData: {
      cardName: name,
      cardAttr: species,
      cardLevel: hp ? `HP${hp}` : null,
      cardOther: species,
      cardAtk: attacks || null,
      cardDef:
        [stats["약점"] && `약점 ${stats["약점"]}`, stats["후퇴"] && `후퇴 ${stats["후퇴"]}`]
          .filter(Boolean)
          .join(" · ") || null,
      cardText: illustrator ? `일러스트: ${illustrator}` : null,
    },
    card_sets: packName
      ? [
          {
            set_date: null,
            set_code: setNumber || cardId,
            set_name: packName,
            set_rarity: rarity,
            rarity_code: rarity,
            price_query: setNumber || cardId,
            price_queries: [setNumber, name].filter(Boolean),
          },
        ]
      : [],
    isDetailLoaded: true,
  };
}
