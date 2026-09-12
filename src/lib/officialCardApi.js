const OFFICIAL_SITE_ORIGIN = "https://www.db.yugioh-card.com";

const normalizeCardName = (name) => name.replace(/\s+/g, "");

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

const findCardEntries = (document, term) => {
  const seen = new Set();
  return [...document.querySelectorAll(".t_row.c_normal")]
    .filter((row) => normalizeCardName(row.querySelector(".card_name")?.textContent || "").includes(term))
    .map((row) => ({ row, cardId: row.querySelector("input.cid")?.value }))
    .filter(
      ({ row, cardId }) =>
        row.querySelector("img[id^='card_image']") && cardId && !seen.has(cardId) && seen.add(cardId),
    )
    .map(({ row, cardId }) => ({
      cardId,
      href: new URL(`/yugiohdb/card_search.action?request_locale=ko&ope=2&cid=${cardId}`, OFFICIAL_SITE_ORIGIN),
      imageUrl: `${OFFICIAL_SITE_ORIGIN}/yugiohdb/get_image.action?type=2&cid=${cardId}&ciid=1`,
      name: row.querySelector(".card_name")?.textContent.trim() || "",
    }));
};

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
    .map((row) => ({
      set_code: row.querySelector(".card_number")?.textContent.trim(),
      set_name: row.querySelector(".pack_name")?.textContent.trim(),
      set_rarity: row.querySelector(".rarity p")?.textContent.trim(),
    }))
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
      cardAtk: itemValue("ATK") ? `공격력 ${itemValue("ATK")}` : null,
      cardDef: itemValue("DEF") ? `수비력 ${itemValue("DEF")}` : null,
      cardText: read(".top .CardText .text_linebreak"),
    },
    card_sets: cardSets,
  };
};

export async function searchOfficialCards(searchTerm) {
  const term = normalizeCardName(searchTerm);
  let document = await fetchOfficialHtml(createSearchUrl(searchTerm));
  let entries = findCardEntries(document, term);
  if (!entries.length && term.length > 1) {
    document = await fetchOfficialHtml(createSearchUrl(term.slice(0, 2)));
    entries = findCardEntries(document, term);
  }
  return Promise.all(
    entries.map(async (entry) =>
      parseOfficialCard(await fetchOfficialHtml(entry.href), entry.name, entry.imageUrl, entry.cardId),
    ),
  );
}
