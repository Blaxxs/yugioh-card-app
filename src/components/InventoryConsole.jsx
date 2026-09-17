import { Download, Minus, PackagePlus, Plus, Search, X } from "lucide-react";
import { useRef, useState } from "react";
import {
  fetchOfficialCardById,
  fetchReleaseCards,
  fetchReleaseList,
  hydrateCardPreviews,
  searchOfficialCards,
  getRarityCode,
  getRarityLabel,
} from "../lib/officialCardApi";

export default function InventoryConsole({ inventoryItems, busy, onBatchIntake, onAddInventory }) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [packQuery, setPackQuery] = useState("");
  const [packMatches, setPackMatches] = useState([]);
  const [packCards, setPackCards] = useState([]);
  const [packModalOpen, setPackModalOpen] = useState(false);
  const [packWindow, setPackWindow] = useState(null);
  const resizeRef = useRef(null);
  const dragRef = useRef(null);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");
  const [addResults, setAddResults] = useState([]);
  const [addCard, setAddCard] = useState(null);
  const [addCode, setAddCode] = useState("");
  const [addRarity, setAddRarity] = useState("");
  const [addImageIndex, setAddImageIndex] = useState(0);
  const [addCondition, setAddCondition] = useState("S급 (신품급)");
  const [addPrice, setAddPrice] = useState("");
  const [addQuantity, setAddQuantity] = useState(1);
  const visibleItems = inventoryItems
    .filter((item) =>
      `${item.card_name} ${item.set_code || ""} ${item.rarity || ""}`.toLowerCase().includes(query.toLowerCase()),
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
  const handlePackSearchKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      findPacks();
    }
  };
  const choosePack = async (release) => {
    const cards = await fetchReleaseCards(release.path);
    setPackCards(cards.map((card) => ({ card, quantity: 0, price: "" })));
    setPackModalOpen(true);
    hydrateCardPreviews(cards, (detailedCard) => {
      const variants = detailedCard.card_sets
        .filter((set) => set.set_name === release.name)
        .map((set) => ({
          ...detailedCard,
          id: `${detailedCard.cardId}-${set.set_code}-${set.rarity_code || set.set_rarity}`,
          card_sets: [set],
        }));
      setPackCards((items) => [
        ...items.filter((item) => item.card.cardId !== detailedCard.cardId),
        ...(variants.length ? variants : [detailedCard]).map((card) => ({ card, quantity: 0, price: "" })),
      ]);
    });
    setPackMatches([]);
    setPackQuery(release.name);
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
    const selected = packCards.filter((item) => item.quantity > 0);
    await onBatchIntake(selected);
    setPackCards([]);
    setPackModalOpen(false);
  };

  const languageOf = (item) => (/JP/i.test(item.set_code || "") ? "일본판" : "한글판");
  const groupOf = () => "유희왕";
  const searchAddCards = async () => setAddResults(await searchOfficialCards(addQuery));
  const chooseAddCard = async (card) => {
    const detailed = card.isDetailLoaded
      ? card
      : await fetchOfficialCardById(card.cardId, card.name, card.card_images?.[0]?.image_url_small);
    setAddCard(detailed);
    const firstSet = detailed.card_sets?.[0];
    setAddCode(firstSet?.set_code || "");
    setAddRarity(firstSet?.rarity_code || firstSet?.set_rarity || "");
  };

  return (
    <section className="inventory-console">
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
                <th>언어</th>
                <th>카드군</th>
                <th>이름</th>
                <th>레어도</th>
                <th>코드</th>
                <th>상태</th>
                <th>수량</th>
                <th>가격</th>
                <th>비고</th>
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
                  <td>{languageOf(item)}</td>
                  <td>{groupOf(item)}</td>
                  <td>{item.card_name}</td>
                  <td>{item.rarity || "-"}</td>
                  <td>{item.set_code || "-"}</td>
                  <td>{item.condition || "-"}</td>
                  <td>
                    <b>{item.quantity}</b>
                  </td>
                  <td>{item.sale_price ? `${Number(item.sale_price).toLocaleString()}원` : "-"}</td>
                  <td>{item.memo || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      {packModalOpen && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="팩 개봉 입고">
          <button
            className="pack-intake-backdrop"
            type="button"
            aria-label="팩 입고 닫기"
            onClick={() => setPackModalOpen(false)}
          />
          <section className={`pack-intake-dialog ${packCards.length ? "pack-cards-dialog" : "pack-search-dialog"}`} style={packWindow ? { ...packWindow, position: "fixed" } : undefined}>
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
            {packMatches.map((release) => (
              <button className="pack-match" type="button" key={release.id} onClick={() => choosePack(release)}>
                {release.name}
                <small>{release.date}</small>
              </button>
            ))}
            <div className="pack-card-list pack-card-album">
              {packCards.map(({ card, quantity, price }) => (
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
                  <strong>{card.name}</strong>
                  <small>
                    {card.card_sets?.[0]?.set_code || "코드 확인 중"} ·{" "}
                    <b
                      className="rarity-chip"
                      title={getRarityLabel(card.card_sets?.[0]?.rarity_code || card.card_sets?.[0]?.set_rarity)}
                    >
                      {getRarityCode(card.card_sets?.[0]?.rarity_code || card.card_sets?.[0]?.set_rarity) || "?"}
                    </b>
                  </small>
                </article>
              ))}
            </div>
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
          <button
            className="pack-intake-backdrop"
            type="button"
            aria-label="재고 추가 닫기"
            onClick={() => setAddModalOpen(false)}
          />
          <section className="pack-intake-dialog inventory-add-dialog">
            <header>
              <div>
                <span>INVENTORY ADD</span>
                <h3>재고 추가</h3>
                <p>카드와 판매 정보를 선택해 저장하세요.</p>
              </div>
              <button type="button" onClick={() => setAddModalOpen(false)}>
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
                  await onAddInventory({
                    card: addCard,
                    set,
                    imageIndex: addImageIndex,
                    condition: addCondition,
                    price: addPrice,
                    quantity: addQuantity,
                  });
                  setAddModalOpen(false);
                  setAddCard(null);
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
                  <select value={addRarity} onChange={(event) => setAddRarity(event.target.value)}>
                    {[
                      ...new Set(
                        (addCard.card_sets || [])
                          .filter((set) => set.set_code === addCode)
                          .map((set) => set.rarity_code || set.set_rarity)
                          .filter(Boolean),
                      ),
                    ].map((rarity) => (
                      <option value={rarity} key={rarity}>
                        {rarity}
                      </option>
                    ))}
                  </select>
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
