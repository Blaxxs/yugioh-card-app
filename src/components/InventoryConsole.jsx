import { Download, Minus, PackagePlus, Plus, Search, X } from "lucide-react";
import { useState } from "react";
import { fetchReleaseCards, fetchReleaseList, hydrateCardPreviews } from "../lib/officialCardApi";

export default function InventoryConsole({ inventoryItems, busy, onBatchIntake }) {
  const [message, setMessage] = useState("");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("updated");
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [packQuery, setPackQuery] = useState("");
  const [packMatches, setPackMatches] = useState([]);
  const [packCards, setPackCards] = useState([]);
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
  const choosePack = async (release) => {
    const cards = await fetchReleaseCards(release.path);
    setPackCards(cards.map((card) => ({ card, quantity: 0 })));
    hydrateCardPreviews(cards, (detailedCard) => {
      setPackCards((items) =>
        items.map((item) => (item.card.cardId === detailedCard.cardId ? { ...item, card: detailedCard } : item)),
      );
    });
    setPackMatches([]);
    setPackQuery(release.name);
  };
  const changePackQuantity = (cardId, nextQuantity) =>
    setPackCards((items) =>
      items.map((item) =>
        item.card.cardId === cardId ? { ...item, quantity: Math.max(0, Number(nextQuantity) || 0) } : item,
      ),
    );
  const savePack = async () => {
    const selected = packCards.filter((item) => item.quantity > 0);
    await onBatchIntake(selected);
    setPackCards([]);
    setMessage(`팩 입고 완료: ${selected.length}종`);
  };

  const languageOf = (item) => (/JP/i.test(item.set_code || "") ? "일본판" : "한글판");
  const groupOf = () => "유희왕";

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
      <section className="pack-intake">
        <div className="bulk-intake-heading">
          <PackagePlus size={19} aria-hidden="true" />
          <div>
            <strong>팩 개봉 일괄 입고</strong>
            <span>수록 팩을 찾아 카드별 수량을 조정하세요.</span>
          </div>
        </div>
        <div className="pack-search">
          <input value={packQuery} onChange={(event) => setPackQuery(event.target.value)} placeholder="수록 팩 이름" />
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
        {message && <p className="bulk-intake-message">{message}</p>}
      </section>
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
      {packCards.length > 0 && (
        <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="팩 개봉 입고">
          <button
            className="pack-intake-backdrop"
            type="button"
            aria-label="팩 입고 닫기"
            onClick={() => setPackCards([])}
          />
          <section className="pack-intake-dialog">
            <header>
              <div>
                <span>PACK INTAKE</span>
                <h3>{packQuery}</h3>
                <p>카드 이미지 위 수량을 조정한 뒤 저장하세요.</p>
              </div>
              <button type="button" aria-label="팩 입고 닫기" onClick={() => setPackCards([])}>
                <X size={19} />
              </button>
            </header>
            <div className="pack-card-list pack-card-album">
              {packCards.map(({ card, quantity }) => (
                <article className="pack-card" key={card.cardId}>
                  <div className="pack-card-image">
                    <img src={card.card_images[0]?.image_url_small} alt={card.name} />
                    <div>
                      <button type="button" onClick={() => changePackQuantity(card.cardId, quantity - 1)}>
                        <Minus size={14} />
                      </button>
                      <input
                        type="number"
                        min="0"
                        value={quantity}
                        onChange={(event) => changePackQuantity(card.cardId, event.target.value)}
                      />
                      <button type="button" onClick={() => changePackQuantity(card.cardId, quantity + 1)}>
                        <Plus size={14} />
                      </button>
                    </div>
                  </div>
                  <strong>{card.name}</strong>
                  <small>
                    {card.card_sets?.[0]?.set_code || "코드 확인 중"} · {card.card_sets?.[0]?.rarity_code || "레어도"}
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
          </section>
        </div>
      )}
    </section>
  );
}
