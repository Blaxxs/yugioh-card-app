export const INVENTORY_VARIANT_CONFLICT = "user_id,card_id,set_code,rarity_code,memo_key";
export const UNKNOWN_POKEMON_RARITY = "레어도 확인 필요";

export const normalizeInventoryMemo = (memo) => String(memo ?? "").trim();

export const isPokemonRarityUnconfirmed = (card) => {
  const set = card.card_sets?.[0];
  return card.game === "pokemon" && !(set?.rarity_code || set?.set_rarity);
};

export const getInventoryRarity = (card, allowUnknownPokemonRarity = false) => {
  const set = card.card_sets?.[0];
  if (set?.set_rarity) return set.set_rarity;
  return allowUnknownPokemonRarity && isPokemonRarityUnconfirmed(card) ? UNKNOWN_POKEMON_RARITY : null;
};

export const getInventoryVariantKey = (item) =>
  JSON.stringify([
    String(item.card_id ?? item.cardId ?? ""),
    item.set_code ?? item.card_sets?.[0]?.set_code ?? "",
    item.rarity_code ?? item.card_sets?.[0]?.rarity_code ?? "",
    normalizeInventoryMemo(item.memo),
  ]);
