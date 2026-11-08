import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { compareCardCodes } from "./cardCodeOrder.js";

const source = readFileSync(new URL("../components/InventoryConsole.jsx", import.meta.url), "utf8");
const createVariantsSource = source.slice(
  source.indexOf("const createVariants ="),
  source.indexOf("const variants = createVariants(cards)"),
);
const sortingSource = source.slice(
  source.indexOf("const comparePackCards ="),
  source.indexOf("const resizeHandles ="),
);
const mergeDetailSource = source.slice(
  source.indexOf("const mergePokemonPackDetail ="),
  source.indexOf("const comparePackCards ="),
);
const handlersSource = source.slice(
  source.indexOf("const packKey ="),
  source.indexOf("const startPackResize ="),
);
const rarityRanks = new Map([["UR", 0], ["SE", 1]]);
const sortPackCards = new Function(
  "compareCardCodes",
  "RARITY_SORT_ORDER",
  `${sortingSource}; return sortPackCards;`,
)(compareCardCodes, rarityRanks);
const mergePokemonPackDetail = new Function(
  `${mergeDetailSource}; return mergePokemonPackDetail;`,
)();
const release = { name: "Test pack" };
const printing = (code, rarity) => ({ set_name: release.name, set_code: code, rarity_code: rarity });
const createVariants = new Function(
  "release",
  "getRarityCode",
  "sortPackCards",
  "intakeGame",
  `${createVariantsSource}; return createVariants;`,
)(release, (rarity) => rarity, sortPackCards, "yugioh");

test("one click creates exactly one independent row next to the clicked code and rarity", () => {
  let items = createVariants([
    {
      id: "card",
      cardId: "card",
      card_sets: [
        printing("TEST-JP001", "UR"),
        printing("TEST-JP001", "UR"),
        printing("TEST-JP001", "SE"),
      ],
    },
    { id: "other", cardId: "other", card_sets: [printing("TEST-JP002", "UR")] },
  ]);
  assert.equal(items.length, 3, "duplicate official printing must not generate duplicate originals");
  assert.equal(new Set(items.map((item) => item.rowId)).size, 3);
  const handlers = new Function(
    "setPackCards",
    "packPendingRarities",
    `${handlersSource}; return { addPackRow, changePackQuantity, changePackMemo };`,
  )((update) => { items = update(items); }, new Set());
  const original = items[0];
  const untouched = items.slice(1);
  handlers.addPackRow(original.rowId);
  assert.equal(items.length, 4);
  assert.equal(items[1].card, original.card);
  assert.equal(items[1].rarity, original.rarity);
  assert.notEqual(items[1].rowId, original.rowId);
  assert.equal(items[1].quantity, 0);
  assert.equal(items[1].isAdditional, true);
  assert.deepEqual(items.slice(2), untouched);
  const duplicate = items[1];
  handlers.changePackQuantity(duplicate.rowId, 7);
  handlers.changePackMemo(duplicate.rowId, "alternate art");
  assert.equal(items[0].quantity, 0);
  assert.equal(items[0].memo, "");
  assert.equal(items[1].quantity, 7);
  assert.deepEqual(items.slice(2), untouched);
  handlers.addPackRow(duplicate.rowId);
  assert.equal(items.length, 5);
  assert.equal(items[2].card, duplicate.card);
  assert.deepEqual(
    sortPackCards(items, "yugioh").map((item) => item.rowId),
    items.map((item) => item.rowId),
  );
  assert.equal(new Set(items.map((item) => item.rowId)).size, 5);
  assert.equal(items.filter((item) => !item.isAdditional).length, 3);
});

test("resolving a Pokemon pack code preserves its already loaded official pack image", () => {
  const preview = {
    id: "pokemon-123-123/150",
    cardId: "pokemon-123",
    name: "",
    card_images: [{ id: "preview", image_url_small: "https://cards.image.pokemonkorea.co.kr/preview.png" }],
    koreanData: { cardName: "" },
    card_sets: [],
  };
  const detail = {
    id: "pokemon-123",
    cardId: "pokemon-123",
    name: "Test Pokemon",
    card_images: [{ id: "detail", image_url_small: "/public-assets/detail-image.webp" }],
    koreanData: { cardName: "Test Pokemon", cardAttr: "물" },
  };
  const detailSet = { set_name: "Test pack", set_code: "123/150", rarity_code: "SR", set_rarity: "SR" };
  const merged = mergePokemonPackDetail(preview, detail, detailSet);
  assert.equal(merged.id, preview.id);
  assert.deepEqual(merged.card_images, preview.card_images);
  assert.equal(merged.koreanData.cardName, "Test Pokemon");
  assert.equal(merged.koreanData.cardAttr, "물");
  assert.equal(merged.card_sets[0].set_code, "123/150");
  assert.equal(merged.card_sets[0].rarity_code, "SR");
});
