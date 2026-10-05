import { Download, Minus, PackagePlus, Plus, Save, Search, ShoppingCart, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { hydrateCardPreviews, getRarityCode, getRarityLabel, ALL_RARITY_CODES } from "../lib/officialCardApi";
import { CARD_GAMES, getGameById } from "../lib/cardGames";
import {
  fetchGameCardById,
  fetchGameReleaseCards,
  fetchGameReleaseCardsPage,
  fetchGameReleaseList,
  localizeJapaneseCards,
  searchGameCards,
  translateJapaneseReleaseQuery,
} from "../lib/tcgApi";
import SalesHistory from "./SalesHistory";

const MAX_IMPORT_FILE_SIZE = 5 * 1024 * 1024;
const MAX_IMPORT_ROWS = 500;
const resizeHandles = [
  ["right", "오른쪽 크기 조절"],
  ["left", "왼쪽 크기 조절"],
  ["bottom", "아래쪽 크기 조절"],
  ["bottom-left", "왼쪽 아래 크기 조절"],
  ["bottom-right", "오른쪽 아래 크기 조절"],
  ["top", "위쪽 크기 조절"],
  ["top-left", "왼쪽 위 크기 조절"],
  ["top-right", "오른쪽 위 크기 조절"],
];

export default function InventoryConsole({
  activeGame,
  activeLanguage,
  inventoryItems,
  busy,
  onBatchIntake,
  onAddInventory,
  onDeleteInventory,
  onUpdateInventory,
  onSellInventory,
  salesHistory,
  onCancelSales,
}) {
  const [query, setQuery] = useState("");
  const [intakeGame, setIntakeGame] = useState(activeGame);
  const [intakeLanguage, setIntakeLanguage] = useState(activeLanguage);
  const [sort, setSort] = useState("updated");
  const [rowDensity, setRowDensity] = useState("compact");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [packQuery, setPackQuery] = useState("");
  const [packMatches, setPackMatches] = useState([]);
  const [packCards, setPackCards] = useState([]);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packLoading, setPackLoading] = useState(false);
  const [packWindow, setPackWindow] = useState(null);
  const [addWindow, setAddWindow] = useState(null);
  const [importOpen, setImportOpen] = useState(false);
  const [importRows, setImportRows] = useState([]);
  const [importLoading, setImportLoading] = useState(false);
  const [importFileName, setImportFileName] = useState("");
  const importFileRef = useRef(null);
  const resizeRef = useRef(null);
  const dragRef = useRef(null);
  const packLoadVersion = useRef(0);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addCard, setAddCard] = useState(null);
  const [addCode, setAddCode] = useState("");
  const [addRarity, setAddRarity] = useState("");
  const [addRarityEditing, setAddRarityEditing] = useState(false);
  const rarityFieldRef = useRef(null);
  const [addImageIndex, setAddImageIndex] = useState(0);
  const [addCondition, setAddCondition] = useState("S급 (신품급)");
  const [addPrice, setAddPrice] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const [addMemo, setAddMemo] = useState("");
  const [sellModalOpen, setSellModalOpen] = useState(false);
  const [sellItems, setSellItems] = useState([]);
  const [salesHistoryOpen, setSalesHistoryOpen] = useState(false);
  const [columns, setColumns] = useState(() => {
    const isMobile = typeof window !== "undefined" && window.innerWidth <= 700;
    return [
      { id: "language", label: "언어", visible: !isMobile, width: 104 },
      { id: "group", label: "카드군", visible: !isMobile, width: 104 },
      { id: "name", label: "이름", visible: true, width: 220 },
      { id: "rarity", label: "레어도", visible: true, width: 104 },
      { id: "code", label: "코드", visible: true, width: 120 },
      { id: "condition", label: "상태", visible: !isMobile, width: 110 },
      { id: "quantity", label: "수량", visible: true, width: 84 },
      { id: "price", label: "가격", visible: true, width: 100 },
      { id: "memo", label: "비고", visible: !isMobile, width: 140 },
    ];
  });
  const [columnFilters, setColumnFilters] = useState({});
  const [columnMenu, setColumnMenu] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const [filterSelections, setFilterSelections] = useState({});
  const [filterSearch, setFilterSearch] = useState("");
  const [viewItem, setViewItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editDrafts, setEditDrafts] = useState({});
  const [editItemId, setEditItemId] = useState(null);
  const [editError, setEditError] = useState("");
  const editDialogRef = useRef(null);
  const editItems = useMemo(
    () => inventoryItems.filter((item) => selectedIds.has(item.id)),
    [inventoryItems, selectedIds],
  );
  const editItem = editItems.find((item) => item.id === editItemId) || editItems[0];
  const editDraft = editDrafts[editItem?.id];
  const visibleItems = useMemo(() => {
    const normalizedQuery = query.toLowerCase();
    const filters = Object.entries(columnFilters);
    return inventoryItems
      .filter(
        (item) =>
          `${item.card_name} ${item.set_code || ""} ${item.rarity || ""}`.toLowerCase().includes(normalizedQuery) &&
          filters.every(([key, value]) => {
            const raw = String(item[key === "name" ? "card_name" : key === "code" ? "set_code" : key] || "");
            return Array.isArray(value)
              ? !value.length || value.includes(raw)
              : !value || raw.toLowerCase().includes(value.toLowerCase());
          }),
      )
      .sort((left, right) =>
        sort === "name"
          ? left.card_name.localeCompare(right.card_name, "ko")
          : sort === "quantity"
            ? right.quantity - left.quantity
            : new Date(right.updated_at) - new Date(left.updated_at),
      );
  }, [inventoryItems, query, columnFilters, sort]);
  const exportCsv = (selectedOnly) => {
    const items = selectedOnly ? visibleItems.filter((item) => selectedIds.has(item.id)) : visibleItems;
    const rows = [
      ["카드명", "수록 코드", "레어도", "수량", "최종 수정"],
      ...items.map((item) => [
        item.card_name,
        item.set_code || "",
        item.rarity || "",
        item.quantity,
        new Date(item.updated_at).toLocaleString("ko-KR"),
      ]),
    ];
    const blob = new Blob(
      [`\uFEFF${rows.map((row) => row.map((value) => `"${String(value).replace(/"/g, '""')}"`).join(",")).join("\n")}`],
      { type: "text/csv;charset=utf-8" },
    );
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "ygo-inventory.csv";
    link.click();
    URL.revokeObjectURL(link.href);
  };
  const downloadImportTemplate = () => {
    const link = document.createElement("a");
    link.href = "/templates/inventory-import-template.xlsx";
    link.download = "inventory-import-template.xlsx";
    link.click();
  };
  const findPacks = async () => {
    setPackWindow(null);
    const releases = await fetchGameReleaseList(intakeGame, intakeLanguage);
    const query = packQuery.trim();
    const terms = [query];
    if (intakeLanguage === "ja" && /[\uac00-\ud7a3]/.test(query)) {
      const translatedTerms = await translateJapaneseReleaseQuery(intakeGame, query).catch(() => []);
      terms.push(...translatedTerms);
    }
    const normalize = (value) =>
      String(value || "")
        .normalize("NFKC")
        .replace(/[\s・._-]/g, "")
        .toLowerCase();
    const normalizedTerms = terms.map(normalize).filter(Boolean);
    setPackMatches(
      releases
        .filter((release) =>
          normalizedTerms.some(
            (term) => normalize(release.name).includes(term) || normalize(release.localizedName).includes(term),
          ),
        )
        .slice(0, 12),
    );
  };
  const changeIntakeGame = (game) => {
    packLoadVersion.current += 1;
    setIntakeGame(game);
    setPackWindow(null);
    setAddWindow(null);
    setPackMatches([]);
    setPackCards([]);
    setAddResults([]);
    setAddCard(null);
    setImportRows([]);
  };
  const changeIntakeLanguage = (language) => {
    packLoadVersion.current += 1;
    setIntakeLanguage(language);
    setPackWindow(null);
    setAddWindow(null);
    setPackMatches([]);
    setPackCards([]);
    setAddResults([]);
    setAddCard(null);
    setImportRows([]);
  };
  const renderIntakeSelectors = (disabled = false) => (
    <div className="inventory-intake-selectors">
      <label>
        카드 종류
        <select value={intakeGame} disabled={disabled} onChange={(event) => changeIntakeGame(event.target.value)}>
          {CARD_GAMES.map((game) => (
            <option value={game.id} key={game.id}>
              {game.label}
            </option>
          ))}
        </select>
      </label>
      <label>
        언어
        <select
          value={intakeLanguage}
          disabled={disabled}
          onChange={(event) => changeIntakeLanguage(event.target.value)}
        >
          <option value="ko">한글판</option>
          <option value="ja">일본판</option>
        </select>
      </label>
    </div>
  );
  useEffect(
    () => () => {
      packLoadVersion.current += 1;
    },
    [],
  );
  useEffect(() => {
    if (!editOpen) return undefined;
    const previousFocus = document.activeElement;
    editDialogRef.current?.querySelector("input:not([readonly])")?.focus();
    return () => previousFocus?.focus();
  }, [editOpen]);
  useEffect(() => {
    if (!addRarityEditing) return undefined;
    const closeIfOutside = (event) => {
      if (rarityFieldRef.current && !rarityFieldRef.current.contains(event.target)) setAddRarityEditing(false);
    };
    document.addEventListener("mousedown", closeIfOutside);
    return () => document.removeEventListener("mousedown", closeIfOutside);
  }, [addRarityEditing]);
  const handlePackSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      findPacks();
    }
  };
  const choosePack = async (release) => {
    const loadVersion = ++packLoadVersion.current;
    let listReady = false;
    setPackWindow(null);
    setPackLoading(true);
    setPackCards([]);
    setPackModalOpen(true);
    try {
      let cards;
      if (intakeGame === "pokemon" || intakeGame === "onepiece") {
        cards = [];
        let offset = 0;
        while (offset != null) {
          const page = await fetchGameReleaseCardsPage(intakeGame, release.path, offset, intakeLanguage);
          cards.push(...page.cards);
          if (!page.cards.length) break;
          offset = page.nextOffset;
        }
        cards = [...new Map(cards.map((card) => [card.cardId, card])).values()];
      } else {
        cards = await fetchGameReleaseCards(intakeGame, release.path, intakeLanguage);
      }
      let detailedCards = cards;
      if (intakeGame === "yugioh") {
        detailedCards = [];
        await hydrateCardPreviews(cards, (detailedCard) => detailedCards.push(detailedCard), intakeLanguage);
      }
      if (intakeLanguage === "ja") detailedCards = await localizeJapaneseCards(intakeGame, detailedCards);
      if (packLoadVersion.current !== loadVersion) return;
      const variants = detailedCards.flatMap((detailedCard) => {
        const sets = detailedCard.card_sets.filter((set) => set.set_name === release.name);
        return (sets.length ? sets : [null]).map((set) => ({
          card: set
            ? {
                ...detailedCard,
                id: `${detailedCard.cardId}-${set.set_code}-${set.rarity_code || set.set_rarity}`,
                card_sets: [set],
              }
            : detailedCard,
          quantity: 0,
          price: "",
          memo: "",
          rarity: getRarityCode(set?.rarity_code || set?.set_rarity) || "",
        }));
      });
      if (intakeGame === "yugioh") {
        variants.sort((left, right) => {
          const leftCode = left.card.card_sets?.[0]?.set_code || left.card.cardId;
          const rightCode = right.card.card_sets?.[0]?.set_code || right.card.cardId;
          return leftCode.localeCompare(rightCode, "en", { numeric: true, sensitivity: "base" });
        });
      }
      setPackCards(variants);
      setPackMatches([]);
      setPackQuery(release.name);
      setPackLoading(false);
      listReady = true;
      if (intakeGame === "pokemon" && intakeLanguage === "ja") {
        const pending = variants.filter((item) => !item.card.card_sets?.[0]?.set_code);
        let nextIndex = 0;
        const resolveCodes = async () => {
          while (nextIndex < pending.length && packLoadVersion.current === loadVersion) {
            const card = pending[nextIndex++].card;
            try {
              const detail = await fetchGameCardById(
                intakeGame,
                card.cardId,
                card.name,
                card.card_images?.[0]?.image_url_small,
                intakeLanguage,
                { localize: false },
              );
              if (packLoadVersion.current !== loadVersion) return;
              const detailSet =
                detail?.card_sets?.find((set) => set.set_name === release.name && set.set_code) ||
                detail?.card_sets?.find((set) => set.set_code);
              if (!detailSet) continue;
              setPackCards((items) =>
                items.map((item) =>
                  item.card.id === card.id
                    ? {
                        ...item,
                        card: {
                          ...item.card,
                          ...detail,
                          id: item.card.id,
                          localizedName: item.card.localizedName || detail.localizedName,
                          koreanData: { ...detail.koreanData, ...item.card.koreanData },
                          card_sets: [
                            {
                              ...detailSet,
                              ...item.card.card_sets?.[0],
                              set_code: item.card.card_sets?.[0]?.set_code || detailSet.set_code,
                            },
                          ],
                        },
                      }
                    : item,
                ),
              );
            } catch {
              continue;
            }
          }
        };
        await Promise.all([resolveCodes(), resolveCodes()]);
      }
    } finally {
      if (!listReady && packLoadVersion.current === loadVersion) setPackLoading(false);
    }
  };
  const packKey = (card) => card.id || card.cardId;
  const changePackQuantity = (key, nextQuantity) =>
    setPackCards((items) =>
      items.map((item) =>
        packKey(item.card) === key ? { ...item, quantity: Math.max(0, Number(nextQuantity) || 0) } : item,
      ),
    );
  const changePackPrice = (key, price) =>
    setPackCards((items) => items.map((item) => (packKey(item.card) === key ? { ...item, price } : item)));
  const changePackMemo = (key, memo) =>
    setPackCards((items) => items.map((item) => (packKey(item.card) === key ? { ...item, memo } : item)));
  const changePackCode = (key, code) =>
    setPackCards((items) =>
      items.map((item) =>
        packKey(item.card) === key
          ? {
              ...item,
              card: { ...item.card, card_sets: [{ ...(item.card.card_sets?.[0] || {}), set_code: code.trim() }] },
            }
          : item,
      ),
    );
  const startPackResize = (event, direction, setWindow = setPackWindow) => {
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    resizeRef.current = { startX: event.clientX, startY: event.clientY, rect, direction, setWindow };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizePack = (event) => {
    if (!resizeRef.current) return;
    const { rect, startX, startY, direction, setWindow } = resizeRef.current;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    const maxWidth = Math.max(420, window.innerWidth - 48);
    const maxHeight = Math.max(420, window.innerHeight - 48);
    const width = Math.min(
      maxWidth,
      Math.max(
        420,
        direction.includes("left")
          ? rect.width - deltaX
          : direction.includes("right")
            ? rect.width + deltaX
            : rect.width,
      ),
    );
    const height = Math.min(
      maxHeight,
      Math.max(
        420,
        direction.includes("top")
          ? rect.height - deltaY
          : direction.includes("bottom")
            ? rect.height + deltaY
            : rect.height,
      ),
    );
    setWindow({
      left: Math.max(
        24,
        Math.min(window.innerWidth - width - 24, direction.includes("left") ? rect.left + deltaX : rect.left),
      ),
      top: Math.max(
        24,
        Math.min(window.innerHeight - height - 24, direction.includes("top") ? rect.top + deltaY : rect.top),
      ),
      width,
      height,
    });
  };
  const startPackDrag = (event, setWindow = setPackWindow) => {
    if (event.target.closest("button, input, select, textarea")) return;
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    dragRef.current = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top, setWindow };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragPack = (event) => {
    const drag = dragRef.current;
    if (!drag) return;
    drag.setWindow((current) => ({
      ...(current || {}),
      left: drag.left + event.clientX - drag.startX,
      top: drag.top + event.clientY - drag.startY,
    }));
  };
  const stopPackDrag = (event) => {
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const stopPackResize = (event) => {
    resizeRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId))
      event.currentTarget.releasePointerCapture(event.pointerId);
  };
  const savePack = async () => {
    const selected = packCards.filter((item) => item.quantity > 0);
    if (!selected.length) return;
    setPackLoading(true);
    try {
      const resolved = [];
      for (const item of selected) {
        let card = item.card;
        let set = card.card_sets?.[0] || {};
        if (!set.set_code) {
          const detail = await fetchGameCardById(
            intakeGame,
            card.cardId,
            card.name,
            card.card_images?.[0]?.image_url_small,
            intakeLanguage,
          );
          const detailedSet =
            detail?.card_sets?.find((candidate) => candidate.set_name === set.set_name && candidate.set_code) ||
            detail?.card_sets?.find((candidate) => candidate.set_code);
          if (!detailedSet?.set_code) {
            window.alert(`${card.name} 카드 코드를 확인하지 못해 입고를 중단했습니다.`);
            return;
          }
          card = detail;
          set = detailedSet;
        }
        resolved.push({
          ...item,
          card: {
            ...card,
            game: intakeGame,
            language: intakeLanguage,
            card_sets: [
              { ...set, rarity_code: item.rarity || set.rarity_code, set_rarity: item.rarity || set.set_rarity },
            ],
          },
        });
      }
      await onBatchIntake(resolved);
      setPackCards([]);
      setPackModalOpen(false);
    } finally {
      setPackLoading(false);
    }
  };
  const normalizeImportRow = (row) => {
    const values = Object.fromEntries(
      Object.entries(row).map(([key, value]) => [String(key).trim().toLowerCase(), value]),
    );
    const pick = (...keys) => keys.map((key) => values[key]).find((value) => value !== undefined && value !== "");
    return {
      name: String(pick("카드명", "카드 이름", "이름", "card_name", "name") || "").trim(),
      setCode: String(pick("수록 코드", "세트 코드", "코드", "set_code") || "").trim(),
      rarity: String(pick("레어도", "rarity") || "").trim(),
      quantity: Math.max(0, Number(pick("수량", "quantity")) || 0),
      price: pick("가격", "매입가", "purchase_price", "price") ?? "",
      memo: String(pick("비고", "메모", "memo") || "").trim(),
    };
  };
  const importSpreadsheet = async (event) => {
    const [file] = event.target.files || [];
    if (!file) return;
    setImportFileName(file.name);
    setImportLoading(true);
    setImportOpen(true);
    try {
      if (!file.name.toLowerCase().endsWith(".xlsx")) throw new Error(".xlsx 파일만 업로드할 수 있습니다.");
      if (file.size > MAX_IMPORT_FILE_SIZE) throw new Error("파일 크기는 5MB 이하여야 합니다.");
      const { readSheet } = await import("read-excel-file/browser");
      const [headerRow = [], ...dataRows] = await readSheet(file);
      const rows = dataRows
        .filter((row) => row.some((value) => value !== null && value !== ""))
        .map((row) =>
          Object.fromEntries(headerRow.map((header, index) => [String(header || "").trim(), row[index] ?? ""])),
        );
      if (rows.length > MAX_IMPORT_ROWS) throw new Error(`한 번에 최대 ${MAX_IMPORT_ROWS}행까지 업로드할 수 있습니다.`);
      const resolved = [];
      for (const sourceRow of rows) {
        const row = normalizeImportRow(sourceRow);
        if (!row.name || !row.quantity) {
          resolved.push({ ...row, error: "카드명 또는 수량이 없습니다." });
          continue;
        }
        try {
          const [match] = await searchGameCards(intakeGame, row.setCode || row.name, intakeLanguage);
          const candidates = match ? [match] : await searchGameCards(intakeGame, row.name, intakeLanguage);
          const preview = candidates[0];
          if (!preview) {
            resolved.push({ ...row, error: "공식 카드 검색 결과가 없습니다." });
            continue;
          }
          const detail = await fetchGameCardById(
            intakeGame,
            preview.cardId,
            preview.name,
            preview.card_images?.[0]?.image_url_small,
            intakeLanguage,
          );
          const set =
            detail.card_sets?.find((item) => row.setCode && item.set_code === row.setCode) || detail.card_sets?.[0];
          resolved.push({
            ...row,
            card: { ...detail, game: intakeGame, language: intakeLanguage, card_sets: set ? [set] : detail.card_sets },
            error: row.setCode && !set ? "수록 코드가 일치하지 않습니다." : "",
          });
        } catch {
          resolved.push({ ...row, error: "카드 검색 중 오류가 발생했습니다." });
        }
      }
      setImportRows(resolved);
    } catch (error) {
      setImportRows([{ name: file.name, setCode: "", quantity: 0, error: error.message || "파일을 읽지 못했습니다." }]);
    } finally {
      setImportLoading(false);
      event.target.value = "";
    }
  };
  const saveImportedRows = async () => {
    const items = importRows
      .filter((row) => row.card && !row.error)
      .map((row) => ({ card: row.card, quantity: row.quantity, price: row.price, memo: row.memo }));
    await onBatchIntake(items);
    setImportRows([]);
    setImportOpen(false);
  };
  const closePackModal = () => {
    setPackModalOpen(false);
    setPackWindow(null);
    setPackQuery("");
    setPackMatches([]);
    setPackCards([]);
    setPackLoading(false);
  };
  const openPackModal = () => {
    setPackModalOpen(true);
  };
  const openAddModal = () => {
    setAddModalOpen(true);
  };

  const languageOf = (item) =>
    item.card_snapshot?.language === "ja"
      ? "일본판"
      : item.card_snapshot?.language === "ko" || !/JP/i.test(item.set_code || "")
        ? "한글판"
        : "일본판";
  const groupOf = (item) => getGameById(item.card_snapshot?.game).label;
  const cellValue = (item, id) =>
    ({
      language: languageOf(item),
      group: groupOf(item),
      name: item.card_name,
      rarity: item.rarity || "-",
      code: item.set_code || "-",
      condition: item.condition || "-",
      quantity: item.quantity,
      price: item.purchase_price || item.sale_price || "-",
      memo: item.memo || "-",
    })[id];
  const visibleColumns = columns.filter((column) => column.visible);
  const tableWidthTotal = visibleColumns.reduce((total, column) => total + column.width, 0) + 84;
  const moveColumn = (fromId, toId) =>
    setColumns((current) => {
      const next = [...current];
      const from = next.findIndex((item) => item.id === fromId);
      const to = next.findIndex((item) => item.id === toId);
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
  const resizeColumn = (id, width) =>
    setColumns((current) =>
      current.map((column) => (column.id === id ? { ...column, width: Math.max(60, width) } : column)),
    );
  const toggleItemSelected = (id) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm("선택한 재고를 삭제할까요?")) return;
    if (!window.confirm("삭제하면 되돌릴 수 없습니다. 정말 삭제할까요?")) return;
    await onDeleteInventory([...selectedIds]);
    setSelectedIds(new Set());
  };
  const editSelected = async (event) => {
    event.preventDefault();
    if (busy) return;
    setEditError("");
    const invalidItem = editItems.find((item) => {
      const draft = editDrafts[item.id];
      const quantity = Number(draft?.quantity);
      const price = Number(draft?.price);
      return (
        !draft ||
        draft.quantity === "" ||
        !Number.isSafeInteger(quantity) ||
        quantity < 0 ||
        (draft.price !== "" && (!Number.isFinite(price) || price < 0))
      );
    });
    if (invalidItem) {
      setEditItemId(invalidItem.id);
      setEditError("수량은 0 이상의 정수, 가격은 0 이상의 숫자로 입력해 주세요.");
      return;
    }
    try {
      const saved = await onUpdateInventory(
        editItems.map((item) => {
          const draft = editDrafts[item.id];
          return {
            id: item.id,
            changes: {
              quantity: Number(draft.quantity),
              condition: draft.condition || null,
              purchase_price: draft.price === "" ? null : Number(draft.price),
              memo: draft.memo,
            },
          };
        }),
      );
      if (saved === false) {
        setEditError("저장하지 못했습니다. 같은 카드·코드·레어도·비고의 재고가 이미 있는지 확인해 주세요.");
        return;
      }
      setEditOpen(false);
    } catch (error) {
      setEditError(error.message || "재고를 수정하지 못했습니다.");
    }
  };
  const openEditModal = () => {
    const selected = inventoryItems.filter((item) => selectedIds.has(item.id));
    if (!selected.length) return;
    setEditDrafts(
      Object.fromEntries(
        selected.map((item) => [
          item.id,
          {
            quantity: String(item.quantity),
            condition: item.condition || "",
            price: item.purchase_price == null ? "" : String(item.purchase_price),
            memo: item.memo || "",
          },
        ]),
      ),
    );
    setEditItemId(selected[0].id);
    setEditError("");
    setEditOpen(true);
  };
  const changeEditField = (field, value) =>
    setEditDrafts((drafts) => ({ ...drafts, [editItem.id]: { ...drafts[editItem.id], [field]: value } }));
  const searchAddCards = async () => {
    const query = addQuery.trim();
    setAddWindow(null);
    setAddCard(null);
    if (!query) {
      setAddResults([]);
      return;
    }
    const cards = await searchGameCards(intakeGame, query, intakeLanguage);
    const normalizeCode = (value) =>
      String(value || "")
        .replace(/[^a-z0-9]/gi, "")
        .toUpperCase();
    const exactCodeMatches = cards.filter((card) =>
      [card.cardId, card.id, ...(card.card_sets || []).map((set) => set.set_code)].some(
        (code) => normalizeCode(code) === normalizeCode(query),
      ),
    );
    setAddResults(exactCodeMatches.length ? exactCodeMatches : cards);
  };
  const chooseAddCard = async (card) => {
    const detailed = card.isDetailLoaded
      ? card
      : await fetchGameCardById(
          intakeGame,
          card.cardId,
          card.name,
          card.card_images?.[0]?.image_url_small,
          intakeLanguage,
        );
    setAddCard({ ...detailed, game: intakeGame, language: intakeLanguage });
    const firstSet = detailed.card_sets?.find((set) => set.set_code) || detailed.card_sets?.[0];
    setAddCode(firstSet?.set_code || "");
    setAddRarity(firstSet?.rarity_code || firstSet?.set_rarity || "");
    setAddRarityEditing(false);
    setAddMemo("");
  };
  const closeAddModal = () => {
    setAddModalOpen(false);
    setAddWindow(null);
    setAddResults([]);
    setAddCard(null);
    setAddRarityEditing(false);
    setAddMemo("");
  };

  const openSellModal = () => {
    const selected = inventoryItems.filter((item) => selectedIds.has(item.id) && item.quantity > 0);
    setSellItems(
      selected.map((item) => ({
        id: item.id,
        cardName: item.card_name,
        setCode: item.set_code,
        image: item.card_snapshot?.card_images?.[0]?.image_url_small,
        price: item.sale_price ?? item.purchase_price ?? "",
        quantity: 1,
        maxQuantity: item.quantity,
      })),
    );
    setSellModalOpen(true);
  };
  const closeSellModal = () => {
    setSellModalOpen(false);
    setSellItems([]);
  };
  const changeSellPrice = (id, price) =>
    setSellItems((items) => items.map((item) => (item.id === id ? { ...item, price } : item)));
  const changeSellQuantity = (id, quantity) =>
    setSellItems((items) =>
      items.map((item) =>
        item.id === id ? { ...item, quantity: Math.min(Math.max(1, Number(quantity) || 1), item.maxQuantity) } : item,
      ),
    );
  const confirmSell = async () => {
    await onSellInventory(sellItems.map(({ id, price, quantity }) => ({ id, price, quantity })));
    setSelectedIds(new Set());
    closeSellModal();
  };

  return (
    <section className={`inventory-console density-${rowDensity}`}>
      <div className="inventory-metrics">
        <div>
          <span>보유 종류</span>
          <strong>{inventoryItems.length}</strong>
        </div>
        <div>
          <span>총 수량</span>
          <strong>{inventoryItems.reduce((total, item) => total + item.quantity, 0)}</strong>
        </div>
      </div>
      <div className="inventory-action-buttons">
        <button className="pack-intake-open" type="button" onClick={openPackModal}>
          일괄 재고 추가
        </button>
        <button className="inventory-add-open" type="button" onClick={openAddModal}>
          재고 추가
        </button>
        <button className="inventory-sell-open" type="button" disabled={!selectedIds.size} onClick={openSellModal}>
          판매
        </button>
        <button className="inventory-sales-history-open" type="button" onClick={() => setSalesHistoryOpen(true)}>
          판매 내역
        </button>
      </div>
      <section className="inventory-table-section">
        <div className="inventory-table-toolbar">
          <div className="inventory-table-toolbar-main">
            <strong>보유 재고</strong>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="카드명 · 코드 · 레어도 검색"
              aria-label="재고 검색"
            />
            <select value={sort} onChange={(event) => setSort(event.target.value)} aria-label="재고 정렬">
              <option value="updated">최근 수정순</option>
              <option value="name">카드명순</option>
              <option value="quantity">수량 많은순</option>
            </select>
          </div>
          <div className="inventory-table-toolbar-actions">
            <div className="inventory-import-intake">{renderIntakeSelectors()}</div>
            <div className="inventory-toolbar-group">
              <button type="button" onClick={() => importFileRef.current?.click()}>
                엑셀 업로드
              </button>
              <button type="button" onClick={downloadImportTemplate}>
                양식 다운
              </button>
              <span className="inventory-import-filename" title={importFileName || "선택된 파일 없음"}>
                {importFileName || "선택된 파일 없음"}
              </span>
              <input
                ref={importFileRef}
                className="inventory-import-input"
                type="file"
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                onChange={importSpreadsheet}
                aria-label="스프레드시트 업로드"
                hidden
              />
            </div>
            <div className="inventory-toolbar-group">
              <button type="button" onClick={() => exportCsv(false)}>
                <Download size={16} aria-hidden="true" /> 전체 CSV
              </button>
              <button type="button" disabled={!selectedIds.size} onClick={() => exportCsv(true)}>
                <Download size={16} aria-hidden="true" /> 선택 CSV
              </button>
            </div>
            <div className="inventory-toolbar-group">
              <button type="button" disabled={!selectedIds.size} onClick={openEditModal}>
                선택 수정
              </button>
              <button type="button" disabled={!selectedIds.size} onClick={deleteSelected}>
                선택 삭제
              </button>
            </div>
            <div className="inventory-toolbar-group">
              <button type="button" onClick={() => setColumnMenu((value) => !value)}>
                열 설정
              </button>
              <select value={rowDensity} onChange={(event) => setRowDensity(event.target.value)} aria-label="행 높이">
                <option value="compact">행 높이: 압축</option>
                <option value="normal">행 높이: 기본</option>
                <option value="comfortable">행 높이: 여유</option>
              </select>
            </div>
          </div>
          {columnMenu && (
            <div className="column-menu">
              <div className="column-menu-heading">
                <strong>표시할 열</strong>
                <button type="button" aria-label="열 설정 닫기" onClick={() => setColumnMenu(false)}>
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
              {columns.map((column) => (
                <label key={column.id}>
                  <input
                    type="checkbox"
                    checked={column.visible}
                    onChange={() =>
                      setColumns((current) =>
                        current.map((item) => (item.id === column.id ? { ...item, visible: !item.visible } : item)),
                      )
                    }
                  />{" "}
                  {column.label}
                </label>
              ))}
            </div>
          )}
        </div>
        <div className="inventory-table-wrap">
          <table className="inventory-table" style={{ width: tableWidthTotal, minWidth: tableWidthTotal }}>
            <thead>
              <tr>
                <th className="inventory-select-cell">
                  <input
                    type="checkbox"
                    aria-label="전체 선택"
                    checked={visibleItems.length > 0 && visibleItems.every((item) => selectedIds.has(item.id))}
                    onChange={(event) =>
                      setSelectedIds(event.target.checked ? new Set(visibleItems.map((item) => item.id)) : new Set())
                    }
                  />
                </th>
                {visibleColumns.map((column) => (
                  <th
                    key={column.id}
                    className={`inventory-column-${column.id}`}
                    onDrop={(event) => {
                      event.preventDefault();
                      moveColumn(event.dataTransfer.getData("column"), column.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    style={{ width: column.width }}
                  >
                    <span
                      className="column-label"
                      draggable
                      onDragStart={(event) => {
                        event.stopPropagation();
                        event.dataTransfer.setData("column", column.id);
                      }}
                    >
                      {" "}
                      {column.label}{" "}
                    </span>
                    {openFilter === column.id &&
                      (() => {
                        const field =
                          column.id === "name" ? "card_name" : column.id === "code" ? "set_code" : column.id;
                        const values = [...new Set(inventoryItems.map((item) => String(item[field] || "")))].filter(
                          (value) => value.toLowerCase().includes(filterSearch.toLowerCase()),
                        );
                        const selected = filterSelections[column.id] || [];
                        return (
                          <div
                            className="column-filter-popover spreadsheet-filter-menu"
                            onClick={(event) => event.stopPropagation()}
                          >
                            <div className="filter-sort-actions">
                              <button
                                type="button"
                                onClick={() => setSort(column.id === "quantity" ? "quantity" : "name")}
                              >
                                정렬, 오름차순
                              </button>
                              <button
                                type="button"
                                onClick={() => setSort(column.id === "quantity" ? "quantity" : "updated")}
                              >
                                정렬, 내림차순
                              </button>
                            </div>
                            <hr />
                            <input
                              autoFocus
                              value={filterSearch}
                              onChange={(event) => setFilterSearch(event.target.value)}
                              placeholder="값 검색"
                            />
                            <div className="filter-values">
                              {values.map((value) => (
                                <label key={value}>
                                  <input
                                    type="checkbox"
                                    checked={!selected.length || selected.includes(value)}
                                    onChange={() =>
                                      setFilterSelections((current) => {
                                        const all = [
                                          ...new Set(inventoryItems.map((item) => String(item[field] || ""))),
                                        ];
                                        const currentValues = current[column.id] || [];
                                        const next = currentValues.length
                                          ? currentValues.includes(value)
                                            ? currentValues.filter((item) => item !== value)
                                            : [...currentValues, value]
                                          : all.filter((item) => item !== value);
                                        return { ...current, [column.id]: next };
                                      })
                                    }
                                  />{" "}
                                  {value || "(공백)"}
                                </label>
                              ))}
                            </div>
                            <div className="filter-menu-footer">
                              <button
                                type="button"
                                onClick={() => {
                                  setColumnFilters((current) => ({
                                    ...current,
                                    [column.id]: filterSelections[column.id] || [],
                                  }));
                                  setOpenFilter(null);
                                }}
                              >
                                확인
                              </button>
                              <button type="button" onClick={() => setOpenFilter(null)}>
                                취소
                              </button>
                            </div>
                          </div>
                        );
                      })()}
                    <span
                      className="column-resize"
                      onPointerDown={(event) => {
                        const start = event.clientX;
                        const initial = column.width;
                        const move = (moveEvent) => resizeColumn(column.id, initial + moveEvent.clientX - start);
                        const stop = () => {
                          window.removeEventListener("pointermove", move);
                          window.removeEventListener("pointerup", stop);
                        };
                        window.addEventListener("pointermove", move);
                        window.addEventListener("pointerup", stop);
                      }}
                    />
                  </th>
                ))}
                <th className="inventory-view-cell">보기</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr
                  key={item.id}
                  className={selectedIds.has(item.id) ? "selected" : ""}
                  onClick={(event) => {
                    if (event.target.closest("button, input, a")) return;
                    toggleItemSelected(item.id);
                  }}
                >
                  <td className="inventory-select-cell">
                    <input
                      type="checkbox"
                      aria-label={`${item.card_name} 선택`}
                      checked={selectedIds.has(item.id)}
                      onChange={() => toggleItemSelected(item.id)}
                    />
                  </td>
                  {visibleColumns.map((column) => (
                    <td key={column.id} className={`inventory-column-${column.id}`}>
                      {column.id === "quantity" ? <b>{cellValue(item, column.id)}</b> : cellValue(item, column.id)}
                    </td>
                  ))}
                  <td className="inventory-view-cell">
                    <button type="button" className="inventory-view-button" onClick={() => setViewItem(item)}>
                      보기
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {viewItem && (
        <div className="inventory-view-modal" role="dialog" aria-modal="true">
          <button className="pack-intake-backdrop" onClick={() => setViewItem(null)} />
          <section>
            <button onClick={() => setViewItem(null)}>
              <X size={18} />
            </button>
            <img src={viewItem.card_snapshot?.card_images?.[0]?.image_url_small} alt={viewItem.card_name} />
            <h3>{viewItem.card_name}</h3>
            <p>
              {viewItem.set_code || "-"} · {viewItem.rarity || "-"} · 수량 {viewItem.quantity}
            </p>
          </section>
        </div>
      )}
      {editOpen && (
        <div
          className="pack-intake-modal"
          role="dialog"
          aria-modal="true"
          aria-labelledby="inventory-edit-title"
          onKeyDown={(event) => {
            if (event.key === "Escape" && !busy) setEditOpen(false);
            if (event.key !== "Tab") return;
            const controls = editDialogRef.current?.querySelectorAll(
              "button:not(:disabled), input:not(:disabled), select:not(:disabled), textarea:not(:disabled)",
            );
            if (!controls?.length) return;
            const first = controls[0];
            const last = controls[controls.length - 1];
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first.focus();
            }
          }}
        >
          <button className="pack-intake-backdrop" type="button" aria-label="재고 수정 배경" tabIndex={-1} />
          <form
            className="pack-intake-dialog inventory-edit-dialog"
            onSubmit={editSelected}
            ref={editDialogRef}
            aria-busy={busy}
          >
            <header className="pack-intake-header">
              <div className="pack-intake-title">
                <span>INVENTORY EDIT</span>
                <h3 id="inventory-edit-title">재고 수정</h3>
              </div>
              <button type="button" aria-label="재고 수정 닫기" disabled={busy} onClick={() => setEditOpen(false)}>
                <X size={19} />
              </button>
            </header>
            <div className={`inventory-edit-layout ${editItems.length > 1 ? "has-item-list" : ""}`}>
              {editItems.length > 1 && (
                <nav className="inventory-edit-list" aria-label="수정할 재고">
                  {editItems.map((item) => (
                    <button
                      type="button"
                      key={item.id}
                      className={editItem?.id === item.id ? "selected" : ""}
                      aria-current={editItem?.id === item.id ? "true" : undefined}
                      onClick={() => setEditItemId(item.id)}
                    >
                      <img
                        src={item.card_snapshot?.card_images?.[0]?.image_url_small}
                        alt=""
                        loading="lazy"
                        decoding="async"
                      />
                      <span>
                        <strong>{item.card_name}</strong>
                        <small>
                          {item.set_code || "-"} · {item.rarity_code || item.rarity || "-"}
                        </small>
                        <small>
                          {editDrafts[item.id]?.memo.trim() || "비고 없음"} ·{" "}
                          {editDrafts[item.id]?.quantity ?? item.quantity}개
                        </small>
                      </span>
                    </button>
                  ))}
                </nav>
              )}
              {editItem && editDraft && (
                <div className="inventory-edit-details" key={editItem.id}>
                  <div className="inventory-edit-preview">
                    {editItem.card_snapshot?.card_images?.[0]?.image_url_small ? (
                      <img
                        src={editItem.card_snapshot.card_images[0].image_url_small}
                        alt={editItem.card_name}
                        decoding="async"
                      />
                    ) : (
                      <PackagePlus size={48} aria-hidden="true" />
                    )}
                    <strong>{editItem.card_name}</strong>
                  </div>
                  <fieldset className="inventory-edit-fields" disabled={busy}>
                    <label>
                      카드 코드
                      <input readOnly value={editItem.set_code || "-"} />
                    </label>
                    <label>
                      레어도
                      <input readOnly value={editItem.rarity_code || editItem.rarity || "-"} />
                    </label>
                    <label className="inventory-edit-wide">
                      상태
                      <select
                        value={editDraft.condition}
                        onChange={(event) => changeEditField("condition", event.target.value)}
                      >
                        <option value="">미지정</option>
                        {["S급 (신품급)", "S-급 (미품급)", "A급", "B급", "C급"].map((condition) => (
                          <option key={condition}>{condition}</option>
                        ))}
                        {editDraft.condition &&
                          !["S급 (신품급)", "S-급 (미품급)", "A급", "B급", "C급"].includes(editDraft.condition) && (
                            <option>{editDraft.condition}</option>
                          )}
                      </select>
                    </label>
                    <label>
                      가격
                      <input
                        className="price-input"
                        type="number"
                        min="0"
                        step="any"
                        value={editDraft.price}
                        onChange={(event) => changeEditField("price", event.target.value)}
                      />
                    </label>
                    <label>
                      수량
                      <input
                        required
                        type="number"
                        min="0"
                        step="1"
                        value={editDraft.quantity}
                        onChange={(event) => changeEditField("quantity", event.target.value)}
                      />
                    </label>
                    <label className="inventory-edit-wide">
                      비고
                      <textarea
                        rows={3}
                        value={editDraft.memo}
                        onChange={(event) => changeEditField("memo", event.target.value)}
                      />
                    </label>
                  </fieldset>
                </div>
              )}
            </div>
            {editError && (
              <p className="inventory-edit-error" role="alert">
                {editError}
              </p>
            )}
            <footer className="inventory-edit-footer">
              <span>{editItems.length}개 항목</span>
              <button type="button" disabled={busy} onClick={() => setEditOpen(false)}>
                취소
              </button>
              <button className="pack-save" type="submit" disabled={busy || !editItems.length}>
                <Save size={16} /> {busy ? "저장 중" : "저장"}
              </button>
            </footer>
          </form>
        </div>
      )}
      {packModalOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="팩 개봉 입고">
          <button className="pack-intake-backdrop" type="button" aria-label="팩 입고 닫기" />
          <section
            className={`pack-intake-dialog ${packCards.length || packMatches.length || packLoading ? "pack-cards-dialog" : "pack-search-dialog"}`}
            style={packWindow ? { ...packWindow, position: "fixed" } : undefined}
          >
            <header
              className="pack-intake-header"
              onPointerDown={startPackDrag}
              onPointerMove={dragPack}
              onPointerUp={stopPackDrag}
              onPointerCancel={stopPackDrag}
            >
              <div className="pack-intake-title">
                <span>PACK INTAKE</span>
                <h3>팩 개봉 일괄 입고</h3>
                <p>카드 이미지 위 수량을 조정한 뒤 저장하세요.</p>
              </div>
              <button type="button" aria-label="팩 입고 닫기" onClick={closePackModal}>
                <X size={19} />
              </button>
            </header>
            <div className="inventory-intake-toolbar">
              {renderIntakeSelectors(packLoading)}
              <div className="pack-search pack-modal-search">
                <input
                  value={packQuery}
                  disabled={packLoading}
                  onChange={(event) => setPackQuery(event.target.value)}
                  onKeyDown={handlePackSearchKeyDown}
                  placeholder="수록 팩 이름"
                />
                <button type="button" disabled={packLoading} onClick={findPacks}>
                  <Search size={16} aria-hidden="true" /> 찾기
                </button>
              </div>
            </div>
            <div className="pack-intake-content">
              {!packLoading && packMatches.length > 0 && (
                <div className="pack-match-list">
                  {packMatches.map((release) => (
                    <button className="pack-match" type="button" key={release.id} onClick={() => choosePack(release)}>
                      {release.localizedName || release.name}
                      <small>{release.date}</small>
                    </button>
                  ))}
                </div>
              )}
              <div className="pack-intake-main">
                {packLoading ? (
                  <div className="pack-loading-state">
                    <span className="pack-loading-spinner" />
                    <strong>카드 이미지를 준비하는 중입니다</strong>
                    <small>잠시만 기다려 주세요.</small>
                  </div>
                ) : (
                  <div className="pack-card-list pack-card-album">
                    {packCards.map(({ card, quantity, price, memo, rarity }) => (
                      <article className="pack-card" key={card.id || card.cardId}>
                        <div className="pack-card-image">
                          <img
                            src={card.card_images[0]?.image_url_small}
                            alt={card.name}
                            loading="lazy"
                            decoding="async"
                          />
                          <div>
                            <button type="button" onClick={() => changePackQuantity(packKey(card), quantity - 1)}>
                              <Minus size={14} />
                            </button>
                            <input
                              type="number"
                              min="0"
                              value={quantity}
                              onChange={(event) => changePackQuantity(packKey(card), event.target.value)}
                            />
                            <button type="button" onClick={() => changePackQuantity(packKey(card), quantity + 1)}>
                              <Plus size={14} />
                            </button>
                          </div>
                        </div>
                        <div className="pack-card-row">
                          <input
                            className="pack-card-price price-input"
                            type="number"
                            min="0"
                            placeholder="가격"
                            value={price}
                            onChange={(event) => changePackPrice(packKey(card), event.target.value)}
                          />
                        </div>
                        <input
                          className="pack-card-memo"
                          type="text"
                          placeholder="비고"
                          value={memo || ""}
                          onChange={(event) => changePackMemo(packKey(card), event.target.value)}
                        />
                        <strong>{card.koreanData?.cardName || card.localizedName || card.name}</strong>
                        <small>
                          {card.card_sets?.[0]?.set_code || "코드 없음"}
                          {rarity && (
                            <span
                              className={`rarity-chip rarity-${getRarityCode(rarity)
                                .replace(/[^a-z0-9+]/gi, "")
                                .toLowerCase()}`}
                              title={getRarityLabel(rarity)}
                            >
                              {rarity}
                            </span>
                          )}
                        </small>
                        {intakeGame === "pokemon" && intakeLanguage === "ja" && (
                          <input
                            className="pack-card-memo"
                            type="text"
                            aria-label={`${card.name} 카드 코드`}
                            placeholder="카드 코드 (예: 001/193)"
                            value={card.card_sets?.[0]?.set_code || ""}
                            onChange={(event) => changePackCode(packKey(card), event.target.value)}
                          />
                        )}
                      </article>
                    ))}
                  </div>
                )}
              </div>
            </div>
            {packCards.length > 0 && (
              <footer className="pack-intake-footer">
                <span>선택 {packCards.filter((item) => item.quantity > 0).length}종</span>
                <button
                  className="pack-save"
                  type="button"
                  disabled={busy || packLoading || !packCards.some((item) => item.quantity)}
                  onClick={savePack}
                >
                  <PackagePlus size={17} /> 선택 수량 저장
                </button>
              </footer>
            )}
            {packCards.length > 0 && (
              <>
                <button
                  className="pack-window-resizer resize-right"
                  type="button"
                  aria-label="오른쪽 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "right")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-left"
                  type="button"
                  aria-label="왼쪽 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "left")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-bottom"
                  type="button"
                  aria-label="아래쪽 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "bottom")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-bottom-left"
                  type="button"
                  aria-label="왼쪽 아래 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "bottom-left")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-bottom-right"
                  type="button"
                  aria-label="오른쪽 아래 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "bottom-right")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-top"
                  type="button"
                  aria-label="위쪽 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "top")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-top-left"
                  type="button"
                  aria-label="왼쪽 위 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "top-left")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
                <button
                  className="pack-window-resizer resize-top-right"
                  type="button"
                  aria-label="오른쪽 위 크기 조절"
                  onPointerDown={(event) => startPackResize(event, "top-right")}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
              </>
            )}
          </section>
        </div>
      )}
      {importOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="스프레드시트 일괄 입고">
          <button
            className="pack-intake-backdrop"
            type="button"
            aria-label="업로드 닫기"
            onClick={() => setImportOpen(false)}
          />
          <section className="pack-intake-dialog inventory-import-dialog">
            <header>
              <div>
                <span>SPREADSHEET IMPORT</span>
                <h3>스프레드시트 일괄 입고</h3>
                <p>카드명, 수록 코드, 수량, 가격 열을 읽어 공식 카드와 매칭합니다.</p>
              </div>
              <button type="button" aria-label="업로드 닫기" onClick={() => setImportOpen(false)}>
                <X size={19} />
              </button>
            </header>
            {importLoading ? (
              <div className="inventory-import-status">
                {CARD_GAMES.find((game) => game.id === intakeGame)?.label} ·{" "}
                {intakeLanguage === "ja" ? "일본판" : "한글판"}
                기준으로 스프레드시트를 읽고 카드를 매칭하는 중입니다...
              </div>
            ) : (
              <>
                <div className="inventory-import-status">
                  입고 기준: {CARD_GAMES.find((game) => game.id === intakeGame)?.label} ·{" "}
                  {intakeLanguage === "ja" ? "일본판" : "한글판"}
                </div>
                <div className="inventory-import-summary">
                  전체 {importRows.length}행 · 성공 {importRows.filter((row) => row.card && !row.error).length}행 · 확인
                  필요 {importRows.filter((row) => row.error).length}행
                </div>
                <div className="inventory-import-preview">
                  {importRows.map((row, index) => (
                    <div className={row.error ? "error" : "ok"} key={`${row.name}-${index}`}>
                      <strong>{row.name || "이름 없음"}</strong>
                      <span>
                        {row.setCode || "코드 없음"} · 수량 {row.quantity}
                      </span>
                      {row.error && <small>{row.error}</small>}
                    </div>
                  ))}
                </div>
                <button
                  className="pack-save inventory-import-save"
                  type="button"
                  disabled={busy || !importRows.some((row) => row.card && !row.error)}
                  onClick={saveImportedRows}
                >
                  <PackagePlus size={17} /> 매칭된 항목 입고
                </button>
              </>
            )}
          </section>
        </div>
      )}
      {addModalOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="재고 추가">
          <button className="pack-intake-backdrop" type="button" aria-label="재고 추가 배경" />
          <section
            className={`pack-intake-dialog inventory-add-dialog ${addResults.length || addCard ? "pack-cards-dialog" : "pack-search-dialog"}`}
            style={addWindow ? { ...addWindow, position: "fixed" } : undefined}
          >
            <header
              className="pack-intake-header inventory-add-drag-handle"
              onPointerDown={(event) => startPackDrag(event, setAddWindow)}
              onPointerMove={dragPack}
              onPointerUp={stopPackDrag}
              onPointerCancel={stopPackDrag}
            >
              <div className="pack-intake-title">
                <span>INVENTORY ADD</span>
                <h3>재고 추가</h3>
                <p>카드와 판매 정보를 선택해 저장하세요.</p>
              </div>
              <button type="button" aria-label="재고 추가 닫기" onClick={closeAddModal}>
                <X size={19} />
              </button>
            </header>
            <div className="inventory-intake-toolbar">
              {renderIntakeSelectors()}
              <div className="pack-search pack-modal-search">
                <input
                  value={addQuery}
                  onChange={(event) => setAddQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      event.preventDefault();
                      searchAddCards();
                    }
                  }}
                  placeholder="카드명 또는 카드 코드 검색"
                />
                <button type="button" disabled={!addQuery.trim()} onClick={searchAddCards}>
                  <Search size={16} /> 검색
                </button>
              </div>
            </div>
            <div className="inventory-add-content">
              {!addCard ? (
                <div className="add-search-results add-search-album">
                  {addResults.map((card) => (
                    <button type="button" key={card.cardId} onClick={() => chooseAddCard(card)}>
                      {card.card_images?.[0]?.image_url_small ? (
                        <img src={card.card_images[0].image_url_small} alt="" loading="lazy" />
                      ) : (
                        <span className="add-search-image-placeholder" aria-hidden="true">
                          <PackagePlus size={18} />
                        </span>
                      )}
                      <span>{card.koreanData?.cardName || card.localizedName || card.name}</span>
                    </button>
                  ))}
                </div>
              ) : (
                <form
                  className="inventory-add-form"
                  onSubmit={async (event) => {
                    event.preventDefault();
                    if (!addCode.trim()) {
                      window.alert("카드 코드를 확인하거나 입력해 주세요.");
                      return;
                    }
                    const set =
                      addCard.card_sets?.find(
                        (item) => item.set_code === addCode && (item.rarity_code || item.set_rarity) === addRarity,
                      ) ||
                      addCard.card_sets?.find((item) => item.set_code === addCode) ||
                      {};
                    const selectedSet = { ...set, set_code: addCode, set_rarity: addRarity, rarity_code: addRarity };
                    await onAddInventory({
                      card: addCard,
                      set: selectedSet,
                      imageIndex: addImageIndex,
                      condition: addCondition,
                      price: addPrice,
                      quantity: addQuantity,
                      memo: addMemo,
                    });
                    closeAddModal();
                  }}
                >
                  <div className="add-card-preview">
                    <img src={addCard.card_images?.[addImageIndex]?.image_url_small} alt={addCard.name} />
                    <div>
                      {addCard.card_images?.map((image, index) => (
                        <button
                          type="button"
                          key={image.id}
                          className={index === addImageIndex ? "selected" : ""}
                          onClick={() => setAddImageIndex(index)}
                        >
                          <img src={image.image_url_small} alt="" />
                        </button>
                      ))}
                    </div>
                  </div>
                  <strong>{addCard.name}</strong>
                  <label>
                    코드
                    {(() => {
                      const codes = [...new Set((addCard.card_sets || []).map((set) => set.set_code).filter(Boolean))];
                      return codes.length ? (
                        <select
                          required
                          value={addCode}
                          onChange={(event) => {
                            setAddCode(event.target.value);
                            const next = addCard.card_sets?.find((item) => item.set_code === event.target.value);
                            setAddRarity(next?.rarity_code || next?.set_rarity || "");
                          }}
                        >
                          {codes.map((code) => (
                            <option value={code} key={code}>
                              {code}
                            </option>
                          ))}
                        </select>
                      ) : (
                        <input
                          required
                          type="text"
                          value={addCode}
                          placeholder="카드 코드를 입력하세요"
                          onChange={(event) => setAddCode(event.target.value)}
                        />
                      );
                    })()}
                  </label>
                  <label>
                    레어도
                    <div className="rarity-value" ref={rarityFieldRef}>
                      <span>{addRarity || "-"}</span>
                      <button type="button" onClick={() => setAddRarityEditing((value) => !value)}>
                        변경
                      </button>
                      {addRarityEditing && (
                        <ul className="rarity-options">
                          {ALL_RARITY_CODES.map((rarity) => (
                            <li key={rarity}>
                              <button
                                type="button"
                                className={rarity === addRarity ? "selected" : ""}
                                onClick={() => {
                                  setAddRarity(rarity);
                                  setAddRarityEditing(false);
                                }}
                              >
                                {rarity}
                              </button>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </label>
                  <label>
                    상태
                    <select value={addCondition} onChange={(event) => setAddCondition(event.target.value)}>
                      <option>S급 (신품급)</option>
                      <option>S-급 (미품급)</option>
                      <option>A급</option>
                      <option>B급</option>
                      <option>C급</option>
                    </select>
                  </label>
                  <label>
                    가격
                    <input
                      className="price-input"
                      type="number"
                      min="0"
                      value={addPrice}
                      onChange={(event) => setAddPrice(event.target.value)}
                    />
                  </label>
                  <label>
                    수량
                    <input
                      type="number"
                      min="1"
                      value={addQuantity}
                      onChange={(event) => setAddQuantity(event.target.value)}
                    />
                  </label>
                  <label>
                    비고
                    <input type="text" value={addMemo} onChange={(event) => setAddMemo(event.target.value)} />
                  </label>
                  <button className="pack-save" type="submit">
                    재고 저장
                  </button>
                </form>
              )}
            </div>
            {(addResults.length > 0 || addCard) &&
              resizeHandles.map(([direction, label]) => (
                <button
                  className={`pack-window-resizer resize-${direction}`}
                  type="button"
                  key={direction}
                  aria-label={label}
                  onPointerDown={(event) => startPackResize(event, direction, setAddWindow)}
                  onPointerMove={resizePack}
                  onPointerUp={stopPackResize}
                  onPointerCancel={stopPackResize}
                />
              ))}
          </section>
        </div>
      )}
      {sellModalOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="선택 재고 판매">
          <button className="pack-intake-backdrop" type="button" aria-label="판매 닫기" onClick={closeSellModal} />
          <section className="pack-intake-dialog pack-cards-dialog sell-intake-dialog">
            <header>
              <div>
                <span>INVENTORY SELL</span>
                <h3>선택 재고 판매</h3>
                <p>판매 가격과 수량을 입력한 뒤 판매하세요.</p>
              </div>
              <button type="button" aria-label="판매 닫기" onClick={closeSellModal}>
                <X size={19} />
              </button>
            </header>
            <div className="pack-card-list pack-card-album">
              {sellItems.map((sale) => (
                <article className="pack-card" key={sale.id}>
                  <div className="pack-card-image">
                    <img src={sale.image} alt={sale.cardName} />
                  </div>
                  <div className="pack-card-row">
                    <input
                      className="pack-card-price price-input"
                      type="number"
                      min="0"
                      placeholder="가격"
                      value={sale.price}
                      onChange={(event) => changeSellPrice(sale.id, event.target.value)}
                      aria-label={`${sale.cardName} 판매 가격`}
                    />
                    <input
                      className="pack-card-rarity"
                      type="number"
                      min="1"
                      max={sale.maxQuantity}
                      value={sale.quantity}
                      onChange={(event) => changeSellQuantity(sale.id, event.target.value)}
                      aria-label={`${sale.cardName} 판매 수량`}
                    />
                  </div>
                  <strong>{sale.cardName}</strong>
                  <small>
                    {sale.setCode || "코드 미상"} · 재고 {sale.maxQuantity}개
                  </small>
                </article>
              ))}
            </div>
            <button className="pack-save" type="button" disabled={busy || !sellItems.length} onClick={confirmSell}>
              <ShoppingCart size={17} /> 판매하기
            </button>
          </section>
        </div>
      )}
      <SalesHistory
        open={salesHistoryOpen}
        onClose={() => setSalesHistoryOpen(false)}
        salesHistory={salesHistory}
        busy={busy}
        onCancelSales={onCancelSales}
      />
    </section>
  );
}
