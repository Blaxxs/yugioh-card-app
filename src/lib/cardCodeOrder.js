// Shared natural/numeric comparator so every card list (search, 수록, 일괄재고추가, 재고추가)
// is rendered in the same code order. Works for Yu-Gi-Oh ("ABC-KR001"), Pokémon
// ("012/100") and One Piece ("OP01-001") codes because digit runs are compared as
// numbers while the rest is compared as text (Pokémon's slash-delimited collector
// number naturally sorts secret rares like "101/100" after the regular "100/100").
export const compareCardCodes = (a, b) =>
  String(a ?? "").localeCompare(String(b ?? ""), "en", { numeric: true, sensitivity: "base" });

export const getCardSortCode = (card) => {
  const sets = card?.card_sets || [];
  const withCode = sets.find((set) => set?.set_code) || sets[0];
  return (
    withCode?.set_code ||
    (card?.collectorNumber != null ? String(card.collectorNumber) : "") ||
    card?.cardId ||
    card?.id ||
    ""
  );
};

export function sortCardsByCode(cards) {
  if (!Array.isArray(cards) || cards.length < 2) return cards || [];
  return [...cards].sort((left, right) => {
    const codeCompare = compareCardCodes(getCardSortCode(left), getCardSortCode(right));
    if (codeCompare !== 0) return codeCompare;
    return compareCardCodes(left?.name, right?.name);
  });
}
