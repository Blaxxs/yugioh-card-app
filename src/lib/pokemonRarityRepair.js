import { getInventoryVariantKey } from "./inventoryVariants.js";

const normalizeCode = (value) => {
  const match = String(value || "")
    .replace(/\s/g, "")
    .toUpperCase()
    .match(/^(\d+)\/(\d+|[A-Z][A-Z0-9-]*)$/);
  return match ? `${Number(match[1])}/${/^\d+$/.test(match[2]) ? Number(match[2]) : match[2]}` : "";
};

const needsHighClassCorrection = (item) =>
  ["C", "U"].includes(item.rarity_code) &&
  (item.card_snapshot?.card_images || []).some((image) => {
    try {
      const url = new URL(image.image_url_small);
      return url.hostname === "www.pokemon-card.com" && url.pathname.includes("/card_images/large/SV4a/");
    } catch {
      return false;
    }
  }) &&
  (item.card_snapshot?.card_sets || []).some((set) => set.rarity_source === "pokellector-ja");

export function isPokemonRarityRepairCandidate(item) {
  const snapshot = item.card_snapshot || {};
  const officialImage = (snapshot.card_images || []).some((image) => {
    try {
      return new URL(image.image_url_small).hostname === "www.pokemon-card.com";
    } catch {
      return false;
    }
  });
  return (
    item.quantity > 0 &&
    (!String(item.rarity_code || "").trim() ||
      !String(item.rarity || "").trim() ||
      needsHighClassCorrection(item) ||
      (item.rarity_code === "N" &&
        (String(item.rarity || "").trim() === "N" || String(item.rarity || "").includes("기호 없음")))) &&
    (snapshot.game === "pokemon" || (!snapshot.game && officialImage)) &&
    (snapshot.language === "ja" || (!snapshot.language && officialImage))
  );
}

export function planPokemonRarityRepair(item, detail, inventory) {
  if (!isPokemonRarityRepairCandidate(item)) return { reason: "대상 아님" };
  const cardId = String(item.card_id);
  const snapshot = item.card_snapshot || {};
  if (
    !/^\d+$/.test(cardId) ||
    String(detail?.cardId) !== cardId ||
    (snapshot.cardId && String(snapshot.cardId) !== cardId)
  )
    return { reason: "카드 ID 확인 필요" };
  const code = normalizeCode(item.set_code);
  if (!code) return { reason: "수록 코드 확인 필요" };
  const imageIds = (snapshot.card_images || []).flatMap((image) => {
    const match = String(image.image_url_small || "").match(/pokemon-card\.com\/.*\/large\/[^/]+\/(\d+)_/);
    return match ? [String(Number(match[1]))] : [];
  });
  if (imageIds.some((id) => id !== String(Number(cardId)))) return { reason: "카드 이미지 ID 불일치" };
  const codeMatches = (detail.card_sets || []).filter((set) => normalizeCode(set.set_code) === code);
  if (!codeMatches.length) return { reason: "공식 수록 코드와 불일치" };
  const matches = codeMatches.filter((set) => set.rarity_code);
  if (!matches.length) return { reason: "해당 인쇄판의 레어도 데이터 미확인" };
  const rarities = [...new Set(matches.map((set) => set.rarity_code))];
  if (rarities.length !== 1) return { reason: "여러 레어도 인쇄판 · 실물 확인 필요" };
  const set = matches[0];
  if (
    item.rarity_code &&
    item.rarity_code !== set.rarity_code &&
    !(needsHighClassCorrection(item) && set.rarity_code === "N")
  )
    return { reason: "기존 레어도와 불일치" };
  const variant = getInventoryVariantKey({ ...item, rarity_code: set.rarity_code });
  if (inventory.some((other) => other.id !== item.id && getInventoryVariantKey(other) === variant)) {
    return { reason: "기존 재고와 중복" };
  }
  const storedSets = snapshot.card_sets || [];
  if (storedSets.length > 1 && storedSets.some((entry) => normalizeCode(entry.set_code) !== code)) {
    return { reason: "스냅샷 인쇄판 확인 필요" };
  }
  const updatedSets = storedSets.length
    ? storedSets.map((entry) => ({
        ...entry,
        set_code: item.set_code,
        rarity_code: set.rarity_code,
        set_rarity: set.set_rarity || set.rarity_code,
        rarity_source: set.rarity_source,
        rarity_metadata_id: set.rarity_metadata_id,
        rarity_has_printed_symbol: set.rarity_has_printed_symbol,
      }))
    : [{ ...set, set_code: item.set_code }];
  return {
    rarity: set.rarity_code,
    patch: {
      rarity_code: set.rarity_code,
      rarity: set.set_rarity || set.rarity_code,
      card_snapshot: { ...snapshot, card_sets: updatedSets },
    },
  };
}

export async function scanPokemonRarityRepairs(inventory, fetchDetail, onProgress = () => {}) {
  const candidates = inventory.filter(isPokemonRarityRepairCandidate);
  const plans = new Array(candidates.length);
  const details = new Map();
  let nextIndex = 0;
  let completed = 0;
  const worker = async () => {
    while (nextIndex < candidates.length) {
      const index = nextIndex++;
      const item = candidates[index];
      try {
        if (!details.has(item.card_id)) details.set(item.card_id, fetchDetail(item));
        plans[index] = { item, detail: await details.get(item.card_id) };
      } catch (error) {
        plans[index] = { item, reason: error.message || "상세 조회 실패" };
      }
      onProgress(++completed, candidates.length);
    }
  };
  await Promise.all([worker(), worker()]);
  const projected = [...inventory];
  return plans.map((plan) => {
    if (plan.reason) return plan;
    const result = planPokemonRarityRepair(plan.item, plan.detail, projected);
    if (result.patch) {
      const index = projected.findIndex((item) => item.id === plan.item.id);
      projected[index] = { ...plan.item, ...result.patch };
    }
    return { item: plan.item, ...result };
  });
}
