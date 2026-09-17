import { Download, Filter, Minus, PackagePlus, Plus, Search, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  fetchOfficialCardById,
  fetchReleaseCards,
  fetchReleaseList,
  hydrateCardPreviews,
  searchOfficialCards,
  getRarityCode,
} from "../lib/officialCardApi";

export default function InventoryConsole({
  inventoryItems,
  busy,
  onBatchIntake,
  onAddInventory,
  onDeleteInventory,
  onUpdateInventory,
}) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [rowDensity, setRowDensity] = useState("compact");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [packQuery, setPackQuery] = useState("");
  const [packMatches, setPackMatches] = useState([]);
  const [packCards, setPackCards] = useState([]);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packLoading, setPackLoading] = useState(false);
  const [packWindow, setPackWindow] = useState(null);
  const resizeRef = useRef(null);
  const dragRef = useRef(null);
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
  const [columns, setColumns] = useState([
    { id: "language", label: "언어", visible: true, width: 90 },
    { id: "group", label: "카드군", visible: true, width: 90 },
    { id: "name", label: "이름", visible: true, width: 220 },
    { id: "rarity", label: "레어도", visible: true, width: 90 },
    { id: "code", label: "코드", visible: true, width: 120 },
    { id: "condition", label: "상태", visible: true, width: 110 },
    { id: "quantity", label: "수량", visible: true, width: 70 },
    { id: "price", label: "가격", visible: true, width: 100 },
    { id: "memo", label: "비고", visible: true, width: 140 },
  ]);
  const [columnFilters, setColumnFilters] = useState({});
  const [columnMenu, setColumnMenu] = useState(false);
  const [openFilter, setOpenFilter] = useState(null);
  const [filterSelections, setFilterSelections] = useState({});
  const [filterSearch, setFilterSearch] = useState("");
  const [viewItem, setViewItem] = useState(null);
  const [editOpen, setEditOpen] = useState(false);
  const [editQuantity, setEditQuantity] = useState(1);
  const [editCondition, setEditCondition] = useState("S급 (신품급)");
  const [editPrice, setEditPrice] = useState("");
  const visibleItems = inventoryItems
    .filter(
      (item) =>
        `${item.card_name} ${item.set_code || ""} ${item.rarity || ""}`.toLowerCase().includes(query.toLowerCase()) &&
        Object.entries(columnFilters).every(([key, value]) => {
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
  const findPacks = async () => {
    const releases = await fetchReleaseList();
    setPackMatches(releases.filter((release) => release.name.includes(packQuery)).slice(0, 12));
  };
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
    setPackLoading(true);
    setPackCards([]);
    setPackModalOpen(true);
    try {
      const cards = await fetchReleaseCards(release.path);
      const detailedCards = [];
      await hydrateCardPreviews(cards, (detailedCard) => detailedCards.push(detailedCard));
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
          rarity: getRarityCode(set?.rarity_code || set?.set_rarity) || "",
        }));
      });
      setPackCards(variants);
      setPackMatches([]);
      setPackQuery(release.name);
    } finally {
      setPackLoading(false);
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
  const changePackRarity = (key, rarity) =>
    setPackCards((items) => items.map((item) => (packKey(item.card) === key ? { ...item, rarity } : item)));
  const startPackResize = (event, direction) => {
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    resizeRef.current = { startX: event.clientX, startY: event.clientY, rect, direction };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const resizePack = (event) => {
    if (!resizeRef.current) return;
    const { rect, startX, startY, direction } = resizeRef.current;
    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;
    setPackWindow({
      left: direction.includes("left") ? rect.left + deltaX : rect.left,
      top: direction.includes("top") ? rect.top + deltaY : rect.top,
      width: Math.max(
        420,
        direction.includes("left")
          ? rect.width - deltaX
          : direction.includes("right")
            ? rect.width + deltaX
            : rect.width,
      ),
      height: Math.max(
        420,
        direction.includes("top")
          ? rect.height - deltaY
          : direction.includes("bottom")
            ? rect.height + deltaY
            : rect.height,
      ),
    });
  };
  const startPackDrag = (event) => {
    if (event.target.closest("button")) return;
    const rect = event.currentTarget.parentElement.getBoundingClientRect();
    dragRef.current = { startX: event.clientX, startY: event.clientY, left: rect.left, top: rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
  };
  const dragPack = (event) => {
    if (!dragRef.current) return;
    setPackWindow((current) => ({
      ...(current || {}),
      left: dragRef.current.left + event.clientX - dragRef.current.startX,
      top: dragRef.current.top + event.clientY - dragRef.current.startY,
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
    const selected = packCards
      .filter((item) => item.quantity > 0)
      .map((item) => ({
        ...item,
        card: {
          ...item.card,
          card_sets: [{ ...(item.card.card_sets?.[0] || {}), rarity_code: item.rarity, set_rarity: item.rarity }],
        },
      }));
    await onBatchIntake(selected);
    setPackCards([]);
    setPackModalOpen(false);
  };

  const languageOf = (item) => (/JP/i.test(item.set_code || "") ? "일본판" : "한글판");
  const groupOf = () => "유희왕";
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
  const deleteSelected = async () => {
    if (!selectedIds.size) return;
    if (!window.confirm("선택한 재고를 삭제할까요?")) return;
    if (!window.confirm("삭제하면 되돌릴 수 없습니다. 정말 삭제할까요?")) return;
    await onDeleteInventory([...selectedIds]);
    setSelectedIds(new Set());
  };
  const editSelected = async (event) => {
    event.preventDefault();
    await onUpdateInventory([...selectedIds], {
      quantity: Number(editQuantity),
      condition: editCondition,
      purchase_price: editPrice === "" ? null : Number(editPrice),
    });
    setEditOpen(false);
  };
  const searchAddCards = async () => setAddResults(await searchOfficialCards(addQuery));
  const chooseAddCard = async (card) => {
    const detailed = card.isDetailLoaded
      ? card
      : await fetchOfficialCardById(card.cardId, card.name, card.card_images?.[0]?.image_url_small);
    setAddCard(detailed);
    const firstSet = detailed.card_sets?.[0];
    setAddCode(firstSet?.set_code || "");
    setAddRarity(firstSet?.rarity_code || firstSet?.set_rarity || "");
    setAddRarityEditing(false);
  };
  const closeAddModal = () => {
    setAddModalOpen(false);
    setAddCard(null);
    setAddRarityEditing(false);
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
        <button className="pack-intake-open" type="button" onClick={() => setPackModalOpen(true)}>
          <PackagePlus size={18} aria-hidden="true" /> 팩 개봉 일괄 입고
        </button>
        <button className="inventory-add-open" type="button" onClick={() => setAddModalOpen(true)}>
          <Plus size={18} aria-hidden="true" /> 재고 추가
        </button>
      </div>
      <section className="inventory-table-section">
        <div className="inventory-table-toolbar">
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
          <button type="button" onClick={() => exportCsv(false)}>
            <Download size={16} aria-hidden="true" /> 전체 CSV
          </button>
          <button type="button" disabled={!selectedIds.size} onClick={() => exportCsv(true)}>
            <Download size={16} aria-hidden="true" /> 선택 CSV
          </button>
          <button type="button" disabled={!selectedIds.size} onClick={() => setEditOpen(true)}>
            선택 수정
          </button>
          <button type="button" disabled={!selectedIds.size} onClick={deleteSelected}>
            선택 삭제
          </button>
          <button type="button" onClick={() => setColumnMenu((value) => !value)}>
            열 설정
          </button>
          <select value={rowDensity} onChange={(event) => setRowDensity(event.target.value)} aria-label="행 높이">
            <option value="compact">행 높이: 압축</option>
            <option value="normal">행 높이: 기본</option>
            <option value="comfortable">행 높이: 여유</option>
          </select>
          {columnMenu && (
            <div className="column-menu">
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
          <table className="inventory-table">
            <thead>
              <tr>
                <th>
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
                    onDrop={(event) => {
                      event.preventDefault();
                      moveColumn(event.dataTransfer.getData("column"), column.id);
                    }}
                    onDragOver={(event) => event.preventDefault()}
                    style={{ width: `${(column.width / tableWidthTotal) * 100}%` }}
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
                    <button
                      className={`column-filter-button ${columnFilters[column.id]?.length ? "active" : ""}`}
                      type="button"
                      aria-label={`${column.label} 필터`}
                      onClick={(event) => {
                        event.stopPropagation();
                        setFilterSearch("");
                        setFilterSelections((current) => ({ ...current, [column.id]: columnFilters[column.id] || [] }));
                        setOpenFilter((current) => (current === column.id ? null : column.id));
                      }}
                    >
                      <Filter size={13} aria-hidden="true" />
                    </button>
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
                <th>보기</th>
              </tr>
            </thead>
            <tbody>
              {visibleItems.map((item) => (
                <tr key={item.id}>
                  <td>
                    <input
                      type="checkbox"
                      aria-label={`${item.card_name} 선택`}
                      checked={selectedIds.has(item.id)}
                      onChange={() =>
                        setSelectedIds((current) => {
                          const next = new Set(current);
                          next.has(item.id) ? next.delete(item.id) : next.add(item.id);
                          return next;
                        })
                      }
                    />
                  </td>
                  {visibleColumns.map((column) => (
                    <td key={column.id}>
                      {column.id === "quantity" ? <b>{cellValue(item, column.id)}</b> : cellValue(item, column.id)}
                    </td>
                  ))}
                  <td>
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
        <div className="inventory-edit-modal" role="dialog" aria-modal="true">
          <button className="pack-intake-backdrop" onClick={() => setEditOpen(false)} />
          <form onSubmit={editSelected}>
            <header>
              <h3>선택 재고 수정</h3>
              <button type="button" onClick={() => setEditOpen(false)}>
                <X size={18} />
              </button>
            </header>
            {visibleItems
              .filter((item) => selectedIds.has(item.id))
              .map((item) => (
                <div className="inventory-edit-row" key={item.id}>
                  <img src={item.card_snapshot?.card_images?.[0]?.image_url_small} alt="" />
                  <strong>{item.card_name}</strong>
                  <input
                    type="number"
                    min="0"
                    defaultValue={item.quantity}
                    onChange={(event) => setEditQuantity(event.target.value)}
                  />
                  <select value={editCondition} onChange={(event) => setEditCondition(event.target.value)}>
                    <option>S급 (신품급)</option>
                    <option>S-급 (미품급)</option>
                    <option>A급</option>
                    <option>B급</option>
                    <option>C급</option>
                  </select>
                  <input
                    type="number"
                    min="0"
                    placeholder="가격"
                    value={editPrice}
                    onChange={(event) => setEditPrice(event.target.value)}
                  />
                </div>
              ))}
            <button type="submit">선택 항목 저장</button>
          </form>
        </div>
      )}
      {packModalOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="팩 개봉 입고">
          <button
            className="pack-intake-backdrop"
            type="button"
            aria-label="팩 입고 닫기"
            onClick={() => setPackModalOpen(false)}
          />
          <section
            className={`pack-intake-dialog ${packCards.length ? "pack-cards-dialog" : "pack-search-dialog"}`}
            style={packWindow ? { ...packWindow, position: "fixed" } : undefined}
          >
            <header
              onPointerDown={startPackDrag}
              onPointerMove={dragPack}
              onPointerUp={stopPackDrag}
              onPointerCancel={stopPackDrag}
            >
              <div>
                <span>PACK INTAKE</span>
                <h3>팩 개봉 일괄 입고</h3>
                <p>카드 이미지 위 수량을 조정한 뒤 저장하세요.</p>
              </div>
              <button type="button" aria-label="팩 입고 닫기" onClick={() => setPackModalOpen(false)}>
                <X size={19} />
              </button>
            </header>
            {!packLoading && (
              <div className="pack-search pack-modal-search">
                <input
                  value={packQuery}
                  onChange={(event) => setPackQuery(event.target.value)}
                  onKeyDown={handlePackSearchKeyDown}
                  placeholder="수록 팩 이름"
                />
                <button type="button" onClick={findPacks}>
                  <Search size={16} aria-hidden="true" /> 찾기
                </button>
              </div>
            )}
            {!packLoading &&
              packMatches.map((release) => (
                <button className="pack-match" type="button" key={release.id} onClick={() => choosePack(release)}>
                  {release.name}
                  <small>{release.date}</small>
                </button>
              ))}
            {packLoading ? (
              <div className="pack-loading-state">
                <span className="pack-loading-spinner" />
                <strong>카드 이미지를 준비하는 중입니다</strong>
                <small>잠시만 기다려 주세요.</small>
              </div>
            ) : (
              <div className="pack-card-list pack-card-album">
                {packCards.map(({ card, quantity, price, rarity }) => (
                  <article className="pack-card" key={card.id || card.cardId}>
                    <div className="pack-card-image">
                      <img src={card.card_images[0]?.image_url_small} alt={card.name} />
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
                    <input
                      className="pack-card-price"
                      type="number"
                      min="0"
                      placeholder="가격"
                      value={price}
                      onChange={(event) => changePackPrice(packKey(card), event.target.value)}
                    />
                    <input
                      className="pack-card-rarity"
                      value={rarity}
                      onChange={(event) => changePackRarity(packKey(card), event.target.value)}
                      placeholder="레어도"
                      aria-label={`${card.name} 레어도`}
                    />
                    <strong>{card.name}</strong>
                    <small>{card.card_sets?.[0]?.set_code || "코드 확인 중"}</small>
                  </article>
                ))}
              </div>
            )}
            <button
              className="pack-save"
              type="button"
              disabled={busy || !packCards.some((item) => item.quantity)}
              onClick={savePack}
            >
              <PackagePlus size={17} /> 선택 수량 저장
            </button>
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
          </section>
        </div>
      )}
      {addModalOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="재고 추가">
          <button className="pack-intake-backdrop" type="button" aria-label="재고 추가 닫기" onClick={closeAddModal} />
          <section className="pack-intake-dialog inventory-add-dialog">
            <header>
              <div>
                <span>INVENTORY ADD</span>
                <h3>재고 추가</h3>
                <p>카드와 판매 정보를 선택해 저장하세요.</p>
              </div>
              <button type="button" onClick={closeAddModal}>
                <X size={19} />
              </button>
            </header>
            {!addCard ? (
              <>
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
                    placeholder="카드명 검색"
                  />
                  <button type="button" onClick={searchAddCards}>
                    <Search size={16} /> 검색
                  </button>
                </div>
                <div className="add-search-results">
                  {addResults.map((card) => (
                    <button type="button" key={card.cardId} onClick={() => chooseAddCard(card)}>
                      {card.name}
                    </button>
                  ))}
                </div>
              </>
            ) : (
              <form
                className="inventory-add-form"
                onSubmit={async (event) => {
                  event.preventDefault();
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
                  <select
                    value={addCode}
                    onChange={(event) => {
                      setAddCode(event.target.value);
                      const next = addCard.card_sets?.find((item) => item.set_code === event.target.value);
                      setAddRarity(next?.rarity_code || next?.set_rarity || "");
                    }}
                  >
                    {[...new Set((addCard.card_sets || []).map((set) => set.set_code).filter(Boolean))].map((code) => (
                      <option value={code} key={code}>
                        {code}
                      </option>
                    ))}
                  </select>
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
                        {[
                          ...new Set(
                            (addCard.card_sets || []).map((set) => set.rarity_code || set.set_rarity).filter(Boolean),
                          ),
                        ].map((rarity) => (
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
                  <input type="number" min="0" value={addPrice} onChange={(event) => setAddPrice(event.target.value)} />
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
                <button className="pack-save" type="submit">
                  재고 저장
                </button>
              </form>
            )}
          </section>
        </div>
      )}
    </section>
  );
}
