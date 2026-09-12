export default function ManagementTabs({ activeTab, onTabChange, session, inventoryItems, favoriteCards, onOpenCard }) {
  return (
    <>
      <nav className="app-tabs">
        <button className={activeTab === "search" ? "active" : ""} onClick={() => onTabChange("search")}>
          카드 검색
        </button>
        <button
          className={activeTab === "inventory" ? "active" : ""}
          onClick={() => onTabChange("inventory")}
          disabled={!session}
        >
          내 재고 ({inventoryItems.length})
        </button>
        <button
          className={activeTab === "favorites" ? "active" : ""}
          onClick={() => onTabChange("favorites")}
          disabled={!session}
        >
          찜 관리 ({favoriteCards.length})
        </button>
      </nav>
      {activeTab === "inventory" && session && (
        <section className="management-panel">
          <h2>내 재고 관리</h2>
          {inventoryItems.length ? (
            inventoryItems.map((item) => (
              <button className="managed-card" key={item.id} onClick={() => onOpenCard(item.card_snapshot)}>
                <span>{item.card_name}</span>
                <strong>{item.quantity}장</strong>
              </button>
            ))
          ) : (
            <p>보유 중인 카드가 없습니다.</p>
          )}
        </section>
      )}
      {activeTab === "favorites" && session && (
        <section className="management-panel">
          <h2>찜 관리</h2>
          {favoriteCards.length ? (
            favoriteCards.map((card) => (
              <button className="managed-card" key={card.cardId} onClick={() => onOpenCard(card)}>
                <span>♥ {card.name}</span>
                <strong>상세 보기</strong>
              </button>
            ))
          ) : (
            <p>찜한 카드가 없습니다.</p>
          )}
        </section>
      )}
    </>
  );
}
