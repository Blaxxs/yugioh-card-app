const APITCG_BASE = "https://api.apitcg.com/api";

const TCG_SLUGS = { pokemon: "pokemon", onepiece: "one-piece" };

const getApiKey = () => process.env.APITCG_API_KEY;

async function apitcgFetch(path, params) {
  const apiKey = getApiKey();
  if (!apiKey) {
    throw new Error(
      "APITCG_API_KEY 환경변수가 설정되지 않았습니다. https://apitcg.com/register 에서 무료 키를 발급받아 등록해 주세요.",
    );
  }
  const url = new URL(`${APITCG_BASE}${path}`);
  Object.entries(params || {}).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") url.searchParams.set(key, value);
  });
  const upstream = await fetch(url, { headers: { "x-api-key": apiKey } });
  const body = await upstream.json().catch(() => null);
  if (!upstream.ok) throw new Error(body?.error || `APITCG 요청 실패 (${upstream.status})`);
  return body;
}

const asList = (body) => (Array.isArray(body?.data) ? body.data : Array.isArray(body) ? body : []);

const firstImageUrl = (images) =>
  images?.large || images?.small || images?.image || images?.url || (typeof images === "string" ? images : null);

const pickAttribute = (attributes, ...keys) => {
  for (const key of keys) {
    const value = attributes?.[key];
    if (value !== undefined && value !== null && value !== "") return String(value);
  }
  return null;
};

export function normalizeProduct(product, game) {
  const attributes = product.attributes || {};
  const setDoc = typeof product.set === "object" && product.set ? product.set : null;
  const rarity = pickAttribute(attributes, "Rarity", "rarity");
  const setCode =
    product.number || product.cardNumber || pickAttribute(attributes, "Number", "Card Number") || String(product._id);
  const setName = setDoc?.name || product.setName || pickAttribute(attributes, "Set") || "";
  const imageUrl = firstImageUrl(product.images);
  return {
    id: String(product._id),
    cardId: String(product._id),
    game,
    name: product.name,
    card_images: imageUrl ? [{ id: `${product._id}-1`, image_url_small: imageUrl }] : [],
    koreanData: {
      cardName: product.name,
      cardAttr: pickAttribute(attributes, "Type", "Color", "Attribute"),
      cardLevel: pickAttribute(attributes, "Cost", "Stage", "Level"),
      cardOther: pickAttribute(attributes, "Category") || product.type || null,
      cardAtk: pickAttribute(attributes, "Power", "HP", "ATK"),
      cardDef: pickAttribute(attributes, "Counter", "Weakness", "DEF"),
      cardText: pickAttribute(attributes, "Description", "Effect", "Text"),
    },
    card_sets: [
      {
        set_date: product.releaseDate || setDoc?.releaseDate || null,
        set_code: String(setCode),
        set_name: setName,
        set_rarity: rarity,
        rarity_code: rarity,
        price_query: String(setCode),
        price_queries: [String(setCode), product.name].filter(Boolean),
      },
    ],
    isDetailLoaded: true,
  };
}

const requireSlug = (game) => {
  const slug = TCG_SLUGS[game];
  if (!slug) throw new Error("지원하지 않는 카드게임입니다.");
  return slug;
};

export async function searchProducts(game, term) {
  const slug = requireSlug(game);
  const body = await apitcgFetch("/products", { tcg: slug, type: "card", name: term, limit: "40" });
  return asList(body).map((item) => normalizeProduct(item, game));
}

export async function fetchProductById(game, id) {
  const slug = requireSlug(game);
  const body = await apitcgFetch("/products", { tcg: slug, type: "card", _id: id, limit: "1" });
  const [item] = asList(body);
  return item ? normalizeProduct(item, game) : null;
}

export async function fetchSets(game) {
  const slug = requireSlug(game);
  const body = await apitcgFetch(`/${slug}/sets`, { limit: "100" });
  return asList(body).map((set) => ({
    id: String(set._id || set.id),
    name: set.name,
    date: set.releaseDate || "",
    category: game === "pokemon" ? "포켓몬" : "원피스",
    path: String(set._id || set.id),
  }));
}

export async function fetchSetCards(game, setId) {
  const slug = requireSlug(game);
  const body = await apitcgFetch("/products", { tcg: slug, type: "card", set: setId, limit: "100" });
  return asList(body).map((item) => normalizeProduct(item, game));
}
