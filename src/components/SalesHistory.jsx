import { X } from "lucide-react";
import { useState } from "react";

const DEFAULT_COLUMNS = [
  { id: "occurred_at", label: "판매일시", visible: true },
  { id: "name", label: "이름", visible: true },
  { id: "code", label: "코드", visible: true },
  { id: "rarity", label: "레어도", visible: true },
  { id: "quantity", label: "수량", visible: true },
  { id: "price", label: "판매 가격", visible: true },
  { id: "condition", label: "카드 상태", visible: false },
  { id: "memo", label: "비고", visible: false },
  { id: "saleStatus", label: "판매 상태", visible: false },
];

const cellValue = (entry, id) => {
  const item = entry.inventory_items || {};
  switch (id) {
    case "occurred_at":
      return new Date(entry.occurred_at).toLocaleString("ko-KR");
    case "name":
      return item.card_name || "-";
    case "code":
      return item.set_code || "-";
    case "rarity":
      return item.rarity_code || item.rarity || "-";
    case "quantity":
      return entry.quantity;
    case "price":
      return entry.unit_price != null ? `${Number(entry.unit_price).toLocaleString("ko-KR")}원` : "-";
    case "condition":
      return item.condition || "-";
    case "memo":
      return entry.memo || "-";
    case "saleStatus":
      return entry.canceled_at ? "취소됨" : "판매완료";
    default:
      return "-";
  }
};

export default function SalesHistory({ open, onClose, salesHistory, busy, onCancelSales }) {
  const [columns, setColumns] = useState(DEFAULT_COLUMNS);
  const [columnMenu, setColumnMenu] = useState(false);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const visibleColumns = columns.filter((column) => column.visible);
  const activeEntries = salesHistory.filter((entry) => !entry.canceled_at);

  if (!open) return null;

  const toggleSelected = (id) =>
    setSelectedIds((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const cancelSelected = async () => {
    const targets = salesHistory.filter((entry) => selectedIds.has(entry.id) && !entry.canceled_at);
    if (!targets.length) return;
    if (!window.confirm(`선택한 ${targets.length}건의 판매를 취소할까요? 재고 수량이 복원됩니다.`)) return;
    await onCancelSales(targets);
    setSelectedIds(new Set());
  };

  return (
    <div className="pack-intake-modal" role="dialog" aria-modal="true" aria-label="판매 내역">
      <button className="pack-intake-backdrop" type="button" aria-label="판매 내역 닫기" onClick={onClose} />
      <section className="pack-intake-dialog sales-history-dialog">
        <header>
          <div>
            <span>SALES HISTORY</span>
            <h3>판매 내역</h3>
            <p>판매된 카드 내역을 확인하고 필요 시 취소하세요.</p>
          </div>
          <button type="button" aria-label="판매 내역 닫기" onClick={onClose}>
            <X size={19} />
          </button>
        </header>
        <div className="inventory-table-toolbar">
          <strong>판매 {activeEntries.length}건</strong>
          <button type="button" disabled={!selectedIds.size || busy} onClick={cancelSelected}>
            선택 판매 취소
          </button>
          <button type="button" onClick={() => setColumnMenu((value) => !value)}>
            열 설정
          </button>
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
        <div className="inventory-table-wrap sales-history-wrap">
          <table className="inventory-table">
            <thead>
              <tr>
                <th />
                {visibleColumns.map((column) => (
                  <th key={column.id}>{column.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {salesHistory.length === 0 ? (
                <tr>
                  <td colSpan={visibleColumns.length + 1}>판매 내역이 없습니다.</td>
                </tr>
              ) : (
                salesHistory.map((entry) => (
                  <tr key={entry.id} className={entry.canceled_at ? "sale-canceled-row" : ""}>
                    <td>
                      <input
                        type="checkbox"
                        aria-label="판매 내역 선택"
                        disabled={!!entry.canceled_at}
                        checked={selectedIds.has(entry.id)}
                        onChange={() => toggleSelected(entry.id)}
                      />
                    </td>
                    {visibleColumns.map((column) => (
                      <td key={column.id}>{cellValue(entry, column.id)}</td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
