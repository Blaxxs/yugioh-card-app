import CardResult from "./CardResult";

const modes = [
  ["album", "▦", "앨범형 보기"],
  ["expanded", "⊞", "펼쳐 보기"],
  ["list", "☷", "목록형 보기"],
];

function ViewFilters({ value, onChange }) {
  return (
    <div className="view-filters" aria-label="목록 보기 방식">
      {modes.map(([mode, icon, label]) => (
        <button key={mode} className={value === mode ? "active" : ""} onClick={() => onChange(mode)} aria-label={label} title={label}>
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function ManagementTabs({ activeTab, onTabChange, session, inventoryItems, favoriteCards, onOpenCard, viewMode, onViewModeChange, favoriteIds, onFavorite }) {
  const cards = activeTab === "inventory" ? inventoryItems.map((item) => item.card_snapshot).filter(Boolean) : favoriteCards;
  const emptyMessage = activeTab === "inventory" ? "보유 중인 카드가 없습니다." : "찜한 카드가 없습니다.";

  return (
    <>
      <nav className="app-tabs">
        <button className={activeTab === "search" ? "active" : ""} onClick={() => onTabChange("search")}>카드 검색</button>
        <button className={activeTab === "inventory" ? "active" : ""} onClick={() => onTabChange("inventory")} disabled={!session}>내 재고 ({inventoryItems.length})</button>
        <button className={activeTab === "favorites" ? "active" : ""} onClick={() => onTabChange("favorites")} disabled={!session}>찜 관리 ({favoriteCards.length})</button>
      </nav>
      {activeTab !== "search" && session && (
        <section className="management-panel">
          <div className="management-heading"><h2>{activeTab === "inventory" ? "내 재고 관리" : "찜 관리"}</h2><ViewFilters value={viewMode} onChange={onViewModeChange} /></div>
          <div className={`card-grid view-${viewMode}`}>
            {cards.length ? cards.map((card) => <CardResult key={card.cardId} card={card} isFavorite={favoriteIds?.has(card.cardId) || activeTab === "favorites"} onFavorite={onFavorite} onOpen={onOpenCard} viewMode={viewMode} />) : <p>{emptyMessage}</p>}
          </div>
        </section>
      )}
    </>
  );
}
