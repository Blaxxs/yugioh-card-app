// Shared helpers for the card-list completeness check used by 검색/수록/일괄재고추가/재고추가.
// Each official site declares its own authoritative result count somewhere in the
// response (Yu-Gi-Oh's "검색결과 N건", Pokémon Japan's `hitCnt`, One Piece Korea's
// pagination links). We compare that declared count against what we actually parsed
// so incomplete scrapes/pagination bugs are surfaced instead of silently truncating
// a pack's card list.
const DECLARED_TOTAL_PATTERN = /([\d,]+)\s*(?:건|件)/;

export function parseDeclaredResultTotal(text) {
  const match = DECLARED_TOTAL_PATTERN.exec(String(text || ""));
  if (!match) return null;
  const value = Number(match[1].replace(/,/g, ""));
  return Number.isFinite(value) && value > 0 ? value : null;
}

// `source` documents how trustworthy the expected total is:
// - "official": the site itself declared the exact total for this exact query/pack.
// - "self": no independent total is available; this is just the crawl's own result
//   count after pagination was exhausted (still useful to show "N장 확인" to staff).
export function evaluateCompleteness(expectedTotal, actualCount, source = "official") {
  if (!Number.isFinite(expectedTotal) || expectedTotal <= 0) {
    return { expectedTotal: null, actualCount, missing: 0, ok: null, source: "unknown" };
  }
  const missing = Math.max(expectedTotal - actualCount, 0);
  return { expectedTotal, actualCount, missing, ok: missing === 0, source };
}

export function mergeCompleteness(...results) {
  const valid = results.filter((result) => result && result.expectedTotal != null);
  if (!valid.length) return results.find((result) => result) || null;
  return valid.reduce((worst, current) => (current.missing > (worst?.missing ?? -1) ? current : worst));
}
