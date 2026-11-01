import assert from "node:assert/strict";
import test from "node:test";
import { getCardReleaseSets, sortCardsByReleaseCode } from "./cardCodeOrder.js";

const release = { name: "HISTORY ARCHIVE COLLECTION" };
const card = (cardId, code, otherCode) => ({
  cardId,
  name: cardId,
  card_sets: [
    { set_name: "Other release", set_code: otherCode },
    { set_name: release.name, set_code: code },
  ],
});

test("release sorting uses the selected pack rather than card IDs or the first printing", () => {
  const cards = [
    card("1", "HC01-JP010", "AAA-JP001"),
    card("900", "HC01-JP002", "ZZZ-JP999"),
    card("20", "HC01-JP001", "MMM-JP100"),
  ];
  const sorted = sortCardsByReleaseCode(cards, release);
  assert.deepEqual(sorted.map((item) => item.cardId), ["20", "900", "1"]);
  assert.deepEqual(cards.map((item) => item.cardId), ["1", "900", "20"]);
  assert.equal(sorted[0].card_sets.length, 2);
});

test("release matching handles whitespace and full-width characters in official pack names", () => {
  const item = {
    card_sets: [{ set_name: " ＨＩＳＴＯＲＹ　ARCHIVE \n COLLECTION ", set_code: "HC01-JP001" }],
  };
  assert.deepEqual(getCardReleaseSets(item, release), item.card_sets);
});

test("missing selected-pack codes sort last even when another printing has a code", () => {
  const missing = { cardId: "1", name: "Missing", card_sets: [{ set_name: "Other", set_code: "000-JP001" }] };
  const confirmed = card("900", "HC01-JP002", "ZZZ-JP999");
  assert.deepEqual(sortCardsByReleaseCode([missing, confirmed], release), [confirmed, missing]);
});

test("Korean release codes sort numerically as well", () => {
  const koreanRelease = { name: "테스트 팩" };
  const cards = [10, 2, 1].map((number) => ({
    name: String(number),
    card_sets: [{ set_name: koreanRelease.name, set_code: `TEST-KR${number}` }],
  }));
  assert.deepEqual(sortCardsByReleaseCode(cards, koreanRelease).map((item) => item.name), ["1", "2", "10"]);
});
