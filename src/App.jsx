import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { searchOfficialCards } from "./lib/officialCardApi";
import CardDetail from "./components/CardDetail";
import CardResult from "./components/CardResult";
import ManagementTabs from "./components/ManagementTabs";

function readStoredCard() {
  const cardId = new URLSearchParams(window.location.search).get("card");
  if (!cardId) return null;
  try {
    return JSON.parse(localStorage.getItem(`ygo-card-${cardId}`)) || null;
  } catch {
    return null;
  }
}

function readStoredSearchResults() {
  try {
    return JSON.parse(localStorage.getItem("ygo-search-results")) || [];
  } catch {
    return [];
  }
}

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [cards, setCards] = useState(readStoredSearchResults);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedCard, setSelectedCard] = useState(readStoredCard);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [favoriteCards, setFavoriteCards] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [condition, setCondition] = useState("미등록");
  const [activeTab, setActiveTab] = useState("search");
  const [viewModes, setViewModes] = useState({ search: "album", inventory: "album", favorites: "album" });
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    if (!supabase) return undefined;
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => setSession(nextSession));
    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) return undefined;
    Promise.all([
      supabase.from("favorites").select("card_id, card_snapshot"),
      supabase.from("inventory_items").select("*").gt("quantity", 0).order("updated_at", { ascending: false }),
    ]).then(([favoritesResult, inventoryResult]) => {
      if (favoritesResult.error) setActionError(`찜 목록 오류: ${favoritesResult.error.message}`);
      if (inventoryResult.error) setActionError(`재고 목록 오류: ${inventoryResult.error.message}`);
      setFavoriteIds(new Set((favoritesResult.data || []).map((item) => item.card_id)));
      setFavoriteCards((favoritesResult.data || []).map((item) => item.card_snapshot).filter(Boolean));
      setInventoryItems(inventoryResult.data || []);
    });
    return undefined;
  }, [session]);

  useEffect(() => {
    if (!supabase || !session || !selectedCard) return undefined;
    supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("card_id", selectedCard.cardId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) setActionError(`재고 조회 오류: ${error.message}`);
        setInventory(data);
        setPurchasePrice(data?.purchase_price ?? "");
        setCondition(data?.condition || "미등록");
      });
    return undefined;
  }, [session, selectedCard]);

  const loginWithGoogle = () =>
    supabase?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const logout = () => supabase?.auth.signOut();

  const openCardWindow = (card) => {
    if (!card) return;
    localStorage.setItem("ygo-search-results", JSON.stringify(cards));
    setSelectedCard(card);
  };

  const toggleFavorite = async (card) => {
    if (!supabase || !session) return setActionError("찜 기능은 로그인 후 사용할 수 있습니다.");
    const isFavorite = favoriteIds.has(card.cardId);
    const result = isFavorite
      ? await supabase.from("favorites").delete().eq("user_id", session.user.id).eq("card_id", card.cardId)
      : await supabase
          .from("favorites")
          .upsert({ user_id: session.user.id, card_id: card.cardId, card_name: card.name, card_snapshot: card });
    if (result.error) return setActionError(`찜 저장 오류: ${result.error.message}`);
    setFavoriteIds((ids) => {
      const next = new Set(ids);
      isFavorite ? next.delete(card.cardId) : next.add(card.cardId);
      return next;
    });
    setFavoriteCards((items) =>
      isFavorite
        ? items.filter((item) => item.cardId !== card.cardId)
        : [...items.filter((item) => item.cardId !== card.cardId), card],
    );
  };

  const saveInventory = async (quantityDelta) => {
    if (!supabase || !session || !selectedCard || inventoryBusy)
      return setActionError("재고 기능은 로그인 후 사용할 수 있습니다.");
    setInventoryBusy(true);
    const quantity = Math.max(0, (inventory?.quantity || 0) + quantityDelta);
    const payload = {
      user_id: session.user.id,
      card_id: selectedCard.cardId,
      card_name: selectedCard.name,
      card_snapshot: selectedCard,
      rarity: selectedCard.card_sets?.[0]?.set_rarity || null,
      condition,
      quantity,
      purchase_price: purchasePrice === "" ? null : Number(purchasePrice),
      memo: null,
    };
    const { data, error } = await supabase
      .from("inventory_items")
      .upsert(payload, { onConflict: "user_id,card_id" })
      .select()
      .single();
    if (error) setActionError(`재고 저장 오류: ${error.message}`);
    else {
      setInventory(data);
      setInventoryItems((items) => [
        data,
        ...items.filter((item) => item.card_id !== selectedCard.cardId && data.quantity > 0),
      ]);
    }
    setInventoryBusy(false);
  };

  const searchCard = async () => {
    if (!searchTerm.trim()) return;
    setLoading(true);
    setActionError("");
    try {
      const results = await searchOfficialCards(searchTerm);
      setCards(results);
      localStorage.setItem("ygo-search-results", JSON.stringify(results));
    } catch (error) {
      setActionError(error.message);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };


  return (
    <main className="app-shell">
      <header className="app-header">
        <h1>🃏 유희왕 카드 & 시세 검색</h1>
        {session ? (
          <button onClick={logout}>로그아웃 ({session.user.email})</button>
        ) : (
          <button onClick={loginWithGoogle} disabled={!isSupabaseConfigured}>
            Google 로그인
          </button>
        )}
      </header>
      {!isSupabaseConfigured && (
        <p className="setup-message">Supabase 환경변수를 설정하면 로그인을 사용할 수 있습니다.</p>
      )}
      <div className="search-bar">
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && searchCard()}
          placeholder="카드 이름을 입력하세요 (예: 푸른 눈의 백룡)"
        />
        <button onClick={searchCard}>검색</button>
      </div>
      <ManagementTabs
        activeTab={activeTab}
        onTabChange={setActiveTab}
        session={session}
        inventoryItems={inventoryItems}
        favoriteCards={favoriteCards}
        onOpenCard={openCardWindow}
        viewMode={viewModes[activeTab]}
        onViewModeChange={(mode) => setViewModes((current) => ({ ...current, [activeTab]: mode }))}
        favoriteIds={favoriteIds}
        onFavorite={toggleFavorite}
      />
      {loading && <p>카드를 검색하고 있습니다...</p>}
      {actionError && (
        <p className="action-error" role="alert">
          {actionError}
        </p>
      )}
      {activeTab === "search" && !selectedCard && (
        <>
          <div className="results-toolbar">
            <strong>검색 결과 {cards.length}개</strong>
            <div className="view-filters" aria-label="검색 결과 보기 방식">
              <button
                className={viewModes.search === "album" ? "active" : ""}
                onClick={() => setViewModes((current) => ({ ...current, search: "album" }))}
                aria-label="앨범형 보기"
                title="앨범형 보기"
              >
                ▦
              </button>
              <button
                className={viewModes.search === "expanded" ? "active" : ""}
                onClick={() => setViewModes((current) => ({ ...current, search: "expanded" }))}
                aria-label="펼쳐 보기"
                title="펼쳐 보기"
              >
                ⊞
              </button>
              <button
                className={viewModes.search === "list" ? "active" : ""}
                onClick={() => setViewModes((current) => ({ ...current, search: "list" }))}
                aria-label="목록형 보기"
                title="목록형 보기"
              >
                ☷
              </button>
            </div>
          </div>
          <section className={`card-grid view-${viewModes.search}`}>
            {cards.map((card) => (
              <CardResult
                key={card.id}
                card={card}
                isFavorite={favoriteIds.has(card.cardId)}
                onFavorite={toggleFavorite}
                onOpen={openCardWindow}
                viewMode={viewModes.search}
              />
            ))}
          </section>
        </>
      )}
      {selectedCard && (
        <CardDetail
          card={selectedCard}
          session={session}
          inventory={inventory}
          condition={condition}
          purchasePrice={purchasePrice}
          inventoryBusy={inventoryBusy}
          onClose={() => setSelectedCard(null)}
          onConditionChange={setCondition}
          onPurchasePriceChange={setPurchasePrice}
          onInventory={saveInventory}
        />
      )}
    </main>
  );
}
