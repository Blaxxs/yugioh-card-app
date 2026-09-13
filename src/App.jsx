import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { fetchOfficialCardById, searchOfficialCards } from "./lib/officialCardApi";
import CardDetail from "./components/CardDetail";
import CardResult from "./components/CardResult";
import ManagementTabs from "./components/ManagementTabs";

export default function App() {
  const savedView = (() => {
    try {
      return JSON.parse(sessionStorage.getItem("ygo-view-state") || "null") || {};
    } catch {
      return {};
    }
  })();
  const [searchTerm, setSearchTerm] = useState(savedView.searchTerm || "");
  const [cards, setCards] = useState(savedView.cards || []);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedCard, setSelectedCard] = useState(savedView.selectedCard || null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [favoriteCards, setFavoriteCards] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [inventoryTransactions, setInventoryTransactions] = useState([]);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(savedView.activeTab || "search");
  const [viewModes, setViewModes] = useState(
    savedView.viewModes || { search: "album", inventory: "album", favorites: "album" },
  );
  const [actionError, setActionError] = useState("");

  useEffect(() => {
    sessionStorage.setItem("ygo-view-state", JSON.stringify({ searchTerm, cards, selectedCard, activeTab, viewModes }));
  }, [searchTerm, cards, selectedCard, activeTab, viewModes]);

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
  }, []);

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
    ]).then(async ([favoritesResult, inventoryResult]) => {
      if (favoritesResult.error) setActionError(`찜 목록 오류: ${favoritesResult.error.message}`);
      if (inventoryResult.error) setActionError(`재고 목록 오류: ${inventoryResult.error.message}`);
      setFavoriteIds(new Set((favoritesResult.data || []).map((item) => item.card_id)));
      const savedCards = (favoritesResult.data || [])
        .map((item) => ({ snapshot: item.card_snapshot, cardId: item.card_id }))
        .filter(({ snapshot }) => snapshot);
      const refreshedCards = await Promise.all(
        savedCards.map(async ({ snapshot, cardId }) => {
          const savedName = snapshot.name || snapshot.koreanData?.cardName;
          try {
            const freshCard = await fetchOfficialCardById(
              cardId,
              savedName,
              snapshot.card_images?.[0]?.image_url_small,
            );
            return freshCard || snapshot;
          } catch {
            return snapshot;
          }
        }),
      );
      setFavoriteCards(refreshedCards);
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
        if (data)
          supabase
            .from("inventory_transactions")
            .select("*")
            .eq("user_id", session.user.id)
            .eq("inventory_item_id", data.id)
            .order("occurred_at", { ascending: false })
            .then(({ data: transactions }) => setInventoryTransactions(transactions || []));
      });
    return undefined;
  }, [session, selectedCard]);

  const loginWithGoogle = () =>
    supabase?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const logout = () => supabase?.auth.signOut();

  const closeCardDetail = () => setSelectedCard(null);

  const openCardWindow = (card) => {
    if (!card) return;
    setSelectedCard((current) => (current?.cardId === card.cardId ? current : card));
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
      quantity,
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
      if (quantityDelta !== 0) {
        const { error: transactionError } = await supabase
          .from("inventory_transactions")
          .insert({
            user_id: session.user.id,
            inventory_item_id: data.id,
            type: quantityDelta > 0 ? "purchase" : "sale",
            quantity: Math.abs(quantityDelta),
            unit_price: null,
          });
        if (transactionError) setActionError(`거래 이력 저장 오류: ${transactionError.message}`);
        const { data: transactions } = await supabase
          .from("inventory_transactions")
          .select("*")
          .eq("user_id", session.user.id)
          .eq("inventory_item_id", data.id)
          .order("occurred_at", { ascending: false });
        setInventoryTransactions(transactions || []);
      }
    }
    setInventoryBusy(false);
  };

  const cancelTransaction = async (transaction) => {
    if (!supabase || !session) return;
    const nextQuantity = Math.max(
      0,
      (inventory?.quantity || 0) + (transaction.type === "purchase" ? -transaction.quantity : transaction.quantity),
    );
    const { error: inventoryError } = await supabase
      .from("inventory_items")
      .update({ quantity: nextQuantity, updated_at: new Date().toISOString() })
      .eq("id", inventory.id)
      .eq("user_id", session.user.id);
    if (inventoryError) return setActionError(`재고 조정 오류: ${inventoryError.message}`);
    const { error } = await supabase
      .from("inventory_transactions")
      .update({ canceled_at: new Date().toISOString() })
      .eq("id", transaction.id)
      .eq("user_id", session.user.id);
    if (error) return setActionError(`거래 취소 오류: ${error.message}`);
    setInventoryTransactions((items) =>
      items.map((item) => (item.id === transaction.id ? { ...item, canceled_at: new Date().toISOString() } : item)),
    );
    setInventory((item) => ({ ...item, quantity: nextQuantity }));
  };

  const updateTransaction = async (transaction, unitPrice) => {
    if (!supabase || !session) return;
    const value = unitPrice === "" ? null : Number(unitPrice);
    const { error } = await supabase
      .from("inventory_transactions")
      .update({ unit_price: value })
      .eq("id", transaction.id)
      .eq("user_id", session.user.id);
    if (error) return setActionError(`거래 금액 수정 오류: ${error.message}`);
    setInventoryTransactions((items) =>
      items.map((item) => (item.id === transaction.id ? { ...item, unit_price: value } : item)),
    );
  };

  const searchCard = async () => {
    setSelectedCard(null);
    setActiveTab("search");
    if (!searchTerm.trim()) return;
    setLoading(true);
    setActionError("");
    try {
      const results = await searchOfficialCards(searchTerm);
      setCards(results);
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
      <form
        className="search-bar"
        onSubmit={(event) => {
          event.preventDefault();
          searchCard();
        }}
      >
        <input
          value={searchTerm}
          onChange={(event) => setSearchTerm(event.target.value)}
          placeholder="카드 이름을 입력하세요 (예: 푸른 눈의 백룡)"
        />
        <button type="submit">검색</button>
      </form>
      {!selectedCard && (
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
      )}
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
          <section className={`card-grid search-results view-${viewModes.search}`}>
            {cards.map((card) => (
              <CardResult
                key={card.id}
                card={card}
                onOpen={openCardWindow}
                viewMode={viewModes.search}
                showFavorite={false}
                showCardName={false}
              />
            ))}
          </section>
        </>
      )}
      {selectedCard && (
        <CardDetail
          key={selectedCard.cardId}
          card={selectedCard}
          session={session}
          inventory={inventory}
          inventoryBusy={inventoryBusy}
          isFavorite={favoriteIds.has(selectedCard.cardId)}
          onFavorite={toggleFavorite}
          onClose={closeCardDetail}
          onInventory={saveInventory}
          inventoryTransactions={inventoryTransactions}
          onCancelTransaction={cancelTransaction}
          onUpdateTransaction={updateTransaction}
        />
      )}
    </main>
  );
}
