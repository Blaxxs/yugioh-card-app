import { CARD_GAMES, getGameById } from "./cardGames.js";

const GAME_ORDER = new Map(CARD_GAMES.map((game, index) => [game.id, index]));
const LANGUAGE_ORDER = new Map([
  ["ko", 0],
  ["ja", 1],
]);
const GAME_RARITY_ORDER = {
  yugioh: [
    "N",
    "P",
    "R",
    "SR",
    "UR",
    "GR",
    "M",
    "CR",
    "UL",
    "SE",
    "HR",
    "PG",
    "EXSE",
    "P+UR",
    "P+ES",
    "PSE",
    "OFUR",
    "OFPSE",
    "QCSE",
    "GMR",
  ],
  pokemon: [
    "N",
    "C",
    "U",
    "R",
    "RR",
    "RRR",
    "SR",
    "AR",
    "CHR",
    "CSR",
    "S",
    "SSR",
    "SAR",
    "UR",
    "HR",
    "ACE",
    "K",
    "MA",
    "MUR",
    "BWR",
    "PROMO",
  ],
  onepiece: ["L", "C", "UC", "R", "SR", "SEC", "P", "SP", "TR"],
};
const RARITY_ALIASES = new Map([
  ["노멀", "N"],
  ["노말", "N"],
  ["커먼", "C"],
  ["언커먼", "U"],
  ["레어", "R"],
  ["슈퍼 레어", "SR"],
  ["울트라 레어", "UR"],
  ["시크릿 레어", "SE"],
  ["홀로그래픽 레어", "HR"],
  ["얼티미트 레어", "UL"],
  ["더블 레어", "RR"],
  ["트리플 레어", "RRR"],
  ["아트 레어", "AR"],
  ["스페셜 아트 레어", "SAR"],
  ["normal", "N"],
  ["common", "C"],
  ["uncommon", "U"],
  ["rare", "R"],
  ["super rare", "SR"],
  ["ultra rare", "UR"],
  ["secret rare", "SE"],
  ["holographic rare", "HR"],
  ["ultimate rare", "UL"],
  ["collectors rare", "CR"],
  ["collector's rare", "CR"],
  ["gold rare", "GR"],
  ["millennium rare", "M"],
  ["premium gold rare", "PG"],
  ["extra secret rare", "EXSE"],
  ["parallel rare", "P"],
  ["parallel ultra rare", "P+UR"],
  ["parallel extra secret rare", "P+ES"],
  ["prismatic secret rare", "PSE"],
  ["quarter century secret rare", "QCSE"],
  ["double rare", "RR"],
  ["triple rare", "RRR"],
  ["illustration rare", "AR"],
  ["special illustration rare", "SAR"],
  ["shiny rare", "S"],
  ["shiny ultra rare", "SSR"],
  ["ace spec rare", "ACE"],
  ["promo", "PROMO"],
]);
const collator = new Intl.Collator("en", { numeric: true, sensitivity: "base" });

const getLanguageId = (item) =>
  item.card_snapshot?.language === "ja" || (!item.card_snapshot?.language && /JP/i.test(item.set_code || ""))
    ? "ja"
    : !item.card_snapshot?.language &&
        (item.card_snapshot?.card_images || []).some((image) =>
          String(image.image_url_small || "").includes("www.pokemon-card.com"),
        )
      ? "ja"
      : "ko";
const getGameId = (item) =>
  item.card_snapshot?.game ||
  ((item.card_snapshot?.card_images || []).some((image) =>
    String(image.image_url_small || "").includes("www.pokemon-card.com"),
  )
    ? "pokemon"
    : "yugioh");
const getRarity = (item) =>
  String(item.rarity_code || item.card_snapshot?.card_sets?.[0]?.rarity_code || item.rarity || "").trim();
const normalizeRarity = (rarity) => RARITY_ALIASES.get(rarity.toLowerCase()) || rarity.toUpperCase();

export function sortInventoryForExport(items) {
  return [...items].sort((left, right) => {
    const languageDifference = LANGUAGE_ORDER.get(getLanguageId(left)) - LANGUAGE_ORDER.get(getLanguageId(right));
    if (languageDifference) return languageDifference;
    const gameDifference =
      (GAME_ORDER.get(getGameId(left)) ?? GAME_ORDER.get("yugioh")) -
      (GAME_ORDER.get(getGameId(right)) ?? GAME_ORDER.get("yugioh"));
    if (gameDifference) return gameDifference;

    const codeDifference = collator.compare(left.set_code || "", right.set_code || "");
    if (codeDifference) return codeDifference;

    const gameId = getGameId(left);
    const rarityOrder = GAME_RARITY_ORDER[gameId] || [];
    const leftRarity = normalizeRarity(getRarity(left));
    const rightRarity = normalizeRarity(getRarity(right));
    const leftRank = rarityOrder.indexOf(leftRarity);
    const rightRank = rarityOrder.indexOf(rightRarity);
    if (leftRank !== rightRank) {
      if (leftRank < 0) return 1;
      if (rightRank < 0) return -1;
      return leftRank - rightRank;
    }
    const rarityDifference = collator.compare(leftRarity, rightRarity);
    return rarityDifference || collator.compare(left.card_name || "", right.card_name || "");
  });
}

export async function downloadInventoryWorkbook(items, fileName = "tcg-inventory.xlsx") {
  const { default: ExcelJS } = await import("exceljs");
  const workbook = new ExcelJS.Workbook();
  workbook.creator = "Yu-Gi-Oh Card App";
  workbook.created = new Date();
  const sheet = workbook.addWorksheet("재고 목록", { views: [{ state: "frozen", ySplit: 1 }], autoFilter: "A1:I1" });
  sheet.columns = [
    { header: "언어", key: "language", width: 12 },
    { header: "카드 종류", key: "game", width: 14 },
    { header: "카드명", key: "name", width: 30 },
    { header: "수록코드", key: "code", width: 20 },
    { header: "레어도", key: "rarity", width: 18 },
    { header: "수량", key: "quantity", width: 10 },
    { header: "가격", key: "price", width: 14 },
    { header: "상태", key: "condition", width: 16 },
    { header: "비고", key: "memo", width: 32 },
  ];
  sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
  sheet.getRow(1).fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF147B70" } };
  for (const item of sortInventoryForExport(items)) {
    const language = getLanguageId(item);
    const gameId = getGameId(item);
    sheet.addRow({
      language: language === "ja" ? "일본어" : "한국어",
      game: getGameById(gameId).label,
      name: item.card_name || "",
      code: item.set_code || "",
      rarity: item.rarity || item.rarity_code || item.card_snapshot?.card_sets?.[0]?.set_rarity || "",
      quantity: Number(item.quantity) || 0,
      price: item.purchase_price ?? item.sale_price ?? "",
      condition: item.condition || "",
      memo: item.memo || "",
    });
  }
  const buffer = await workbook.xlsx.writeBuffer();
  const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}
