export const INVENTORY_VARIANT_CONFLICT = "user_id,card_id,set_code,rarity_code,memo_key";

export const normalizeInventoryMemo = (memo) => String(memo ?? "").trim();

export const getInventoryVariantKey = (item) =>
  JSON.stringify([
    String(item.card_id ?? item.cardId ?? ""),
    item.set_code ?? item.card_sets?.[0]?.set_code ?? "",
    item.rarity_code ?? item.card_sets?.[0]?.rarity_code ?? "",
    normalizeInventoryMemo(item.memo),
  ]);
