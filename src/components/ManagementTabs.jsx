import CardResult from "./CardResult";
import InventoryConsole from "./InventoryConsole";
import { Boxes, Heart, LibraryBig, Search } from "lucide-react";

const modes = [
  ["album", "▦", "앨범형 보기"],
  ["expanded", "⊞", "펼쳐 보기"],
  ["list", "☷", "목록형 보기"],
];

function ViewFilters({ value, onChange }) {
  return (
    <div className="view-filters" aria-label="목록 보기 방식">
      {modes.map(([mode, icon, label]) => (
        <button
          key={mode}
          className={value === mode ? "active" : ""}
          onClick={() => onChange(mode)}
          aria-label={label}
          title={label}
        >
          {icon}
        </button>
      ))}
    </div>
  );
}

export default function ManagementTabs({
  activeTab,
  onTabChange,
  session,
  inventoryItems,
  favoriteCards,
  onOpenCard,
  viewMode,
  onViewModeChange,
  favoriteIds,
  onFavorite,
  showContent = true,
  inventoryBusy,
  onBatchIntake,
  onAddInventory,
  onDeleteInventory,
  onUpdateInventory,
  onSellInventory,
}) {
  const cards =
    activeTab === "inventory" ? inventoryItems.map((item) => item.card_snapshot).filter(Boolean) : favoriteCards;
  const emptyMessage = activeTab === "inventory" ? "보유 중인 카드가 없습니다." : "찜한 카드가 없습니다.";

  return (
    <>
      <nav className="app-tabs bottom-nav">
        <button className={activeTab === "search" ? "active" : ""} onClick={() => onTabChange("search")}>
          <Search size={20} aria-hidden="true" />
          <span>검색</span>
        </button>
        <button className={activeTab === "releases" ? "active" : ""} onClick={() => onTabChange("releases")}>
          <LibraryBig size={20} aria-hidden="true" />
          <span>수록</span>
        </button>
        <button
          className={activeTab === "inventory" ? "active" : ""}
          onClick={() => onTabChange("inventory")}
          disabled={!session}
        >
          <Boxes size={20} aria-hidden="true" />
          <span>재고</span>
          <b>{inventoryItems.length}</b>
        </button>
        <button
          className={activeTab === "favorites" ? "active" : ""}
          onClick={() => onTabChange("favorites")}
          disabled={!session}
        >
          <Heart size={20} aria-hidden="true" />
          <span>찜</span>
          <b>{favoriteCards.length}</b>
        </button>
      </nav>
      {showContent && ["inventory", "favorites"].includes(activeTab) && session && (
        <section className="management-panel">
          {activeTab === "inventory" && (
            <InventoryConsole
              inventoryItems={inventoryItems}
              busy={inventoryBusy}
              onBatchIntake={onBatchIntake}
              onAddInventory={onAddInventory}
              onDeleteInventory={onDeleteInventory}
              onUpdateInventory={onUpdateInventory}
              onSellInventory={onSellInventory}
            />
          )}
          {activeTab === "favorites" && (
            <>
              <div className="management-heading">
                <ViewFilters value={viewMode} onChange={onViewModeChange} />
              </div>
              <div className={`card-grid management-results view-${viewMode}`}>
                {cards.length ? (
                  cards.map((card) => (
                    <CardResult
                      key={card.cardId}
                      card={card}
                      isFavorite={favoriteIds?.has(card.cardId) || activeTab === "favorites"}
                      onFavorite={onFavorite}
                      onOpen={onOpenCard}
                      viewMode={viewMode}
                      showCardName={viewMode !== "album"}
                    />
                  ))
                ) : (
                  <p>{emptyMessage}</p>
                )}
              </div>
            </>
          )}
        </section>
      )}
    </>
  );
}
