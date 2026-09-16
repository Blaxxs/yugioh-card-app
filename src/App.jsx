import { useEffect, useRef, useState } from "react";
import { LoaderCircle, LogIn, LogOut, PackagePlus, Search, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import {
  fetchOfficialCardById,
  fetchOfficialCardBySetCode,
  fetchReleaseCards,
  fetchReleaseList,
  hydrateCardPreviews,
  searchOfficialCards,
} from "./lib/officialCardApi";
import CardDetail from "./components/CardDetail";
import CardResult from "./components/CardResult";
import ManagementTabs from "./components/ManagementTabs";

export default function App() {
  const savedHistory = window.history.state?.ygoView;
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
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedCard, setSelectedCard] = useState(savedHistory?.selectedCard || savedView.selectedCard || null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [favoriteCards, setFavoriteCards] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [inventoryTransactions, setInventoryTransactions] = useState([]);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [activeTab, setActiveTab] = useState(savedHistory?.activeTab || savedView.activeTab || "search");
  const [viewModes, setViewModes] = useState(
    savedView.viewModes || { search: "album", inventory: "album", favorites: "album" },
  );
  const [actionError, setActionError] = useState("");
  const [releases, setReleases] = useState([]);
  const [releaseQuery, setReleaseQuery] = useState("");
  const [selectedRelease, setSelectedRelease] = useState(savedHistory?.selectedRelease || null);
  const [releaseCards, setReleaseCards] = useState([]);
  const [releaseLoading, setReleaseLoading] = useState(false);
  const historyIndex = useRef(savedHistory?.index || 0);
  const viewRef = useRef({ activeTab, selectedCard, selectedRelease });
  const loadedReleasePath = useRef(null);

  const hydratePreviews = (previews, setPreviewCards) => {
    hydrateCardPreviews(previews, (detailedCard) => {
      setPreviewCards((currentCards) =>
        currentCards.map((card) => (card.cardId === detailedCard.cardId ? detailedCard : card)),
      );
    });
  };

  useEffect(() => {
    sessionStorage.setItem("ygo-view-state", JSON.stringify({ searchTerm, cards, selectedCard, activeTab, viewModes }));
  }, [searchTerm, cards, selectedCard, activeTab, viewModes]);

  useEffect(() => {
    viewRef.current = { activeTab, selectedCard, selectedRelease };
  }, [activeTab, selectedCard, selectedRelease]);

  useEffect(() => {
    if (window.location.search) window.history.replaceState({}, "", window.location.pathname);
  }, []);

  useEffect(() => {
    if (!window.history.state?.ygoView) {
      window.history.replaceState({ ...window.history.state, ygoView: { index: 0, ...viewRef.current } }, "");
    }

    const restoreHistoryView = (event) => {
      const view = event.state?.ygoView;
      if (!view) return;
      historyIndex.current = view.index || 0;
      setActiveTab(view.activeTab);
      setSelectedCard(view.selectedCard || null);
      setSelectedRelease(view.selectedRelease || null);
    };
    window.addEventListener("popstate", restoreHistoryView);
    return () => window.removeEventListener("popstate", restoreHistoryView);
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

  useEffect(() => {
    if (activeTab !== "releases" || releases.length || releaseLoading) return;
    const loadReleases = async () => {
      await Promise.resolve();
      setReleaseLoading(true);
      try {
        setReleases(await fetchReleaseList());
      } catch (error) {
        setActionError(error.message);
      } finally {
        setReleaseLoading(false);
      }
    };
    loadReleases();
  }, [activeTab, releaseLoading, releases.length]);

  useEffect(() => {
    if (!selectedRelease || loadedReleasePath.current === selectedRelease.path) return;
    const loadReleaseCards = async () => {
      await Promise.resolve();
      loadedReleasePath.current = selectedRelease.path;
      setReleaseCards([]);
      setReleaseLoading(true);
      try {
        const previews = await fetchReleaseCards(selectedRelease.path);
        setReleaseCards(previews);
        hydratePreviews(previews, setReleaseCards);
      } catch (error) {
        loadedReleasePath.current = null;
        setActionError(error.message);
      } finally {
        setReleaseLoading(false);
      }
    };
    loadReleaseCards();
  }, [selectedRelease]);

  const loginWithGoogle = () =>
    supabase?.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  const logout = () => supabase?.auth.signOut();

  const pushView = (nextView) => {
    const view = { ...viewRef.current, ...nextView };
    historyIndex.current += 1;
    window.history.pushState({ ...window.history.state, ygoView: { index: historyIndex.current, ...view } }, "");
    setActiveTab(view.activeTab);
    setSelectedCard(view.selectedCard || null);
    setSelectedRelease(view.selectedRelease || null);
  };

  const goBack = (fallback) => {
    if (historyIndex.current > 0) {
      window.history.back();
      return;
    }
    setSelectedCard(fallback.selectedCard || null);
    setSelectedRelease(fallback.selectedRelease || null);
    setActiveTab(fallback.activeTab || activeTab);
  };

  const closeCardDetail = () => goBack({ selectedCard: null });

  const closeRelease = () => goBack({ selectedRelease: null });

  const changeTab = (tab) => {
    if (tab === activeTab && !selectedCard && !selectedRelease) return;
    pushView({ activeTab: tab, selectedCard: null, selectedRelease: null });
  };

  const openRelease = (release) => {
    setActionError("");
    pushView({ activeTab: "releases", selectedCard: null, selectedRelease: release });
  };

  const openReleaseByName = async (releaseName) => {
    let release = releases.find((item) => item.name === releaseName);
    if (!release) {
      try {
        const fetchedReleases = await fetchReleaseList();
        setReleases(fetchedReleases);
        release = fetchedReleases.find((item) => item.name === releaseName);
      } catch (error) {
        setActionError(error.message);
        return;
      }
    }
    if (!release) {
      setActionError("해당 수록 팩 정보를 찾을 수 없습니다.");
      return;
    }
    openRelease(release);
  };

  const openCardWindow = async (card) => {
    if (!card) return;
    if (selectedCard?.cardId === card.cardId || cardDetailLoading) return;
    if (card.isDetailLoaded) {
      pushView({ selectedCard: card });
      return;
    }
    setCardDetailLoading(true);
    setActionError("");
    try {
      const detailedCard = await fetchOfficialCardById(card.cardId, card.name, card.card_images?.[0]?.image_url_small);
      if (detailedCard) pushView({ selectedCard: detailedCard });
    } catch (error) {
      setActionError(error.message);
    } finally {
      setCardDetailLoading(false);
    }
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
    const set = selectedCard.card_sets?.[0];
    const payload = {
      user_id: session.user.id,
      card_id: selectedCard.cardId,
      card_name: selectedCard.name,
      card_snapshot: selectedCard,
      rarity: set?.set_rarity || null,
      set_code: set?.set_code || "",
      rarity_code: set?.rarity_code || "",
      quantity,
      memo: null,
    };
    const { data, error } = await supabase
      .from("inventory_items")
      .upsert(payload, { onConflict: "user_id,card_id,set_code,rarity_code" })
      .select()
      .single();
    if (error) setActionError(`재고 저장 오류: ${error.message}`);
    else {
      setInventory(data);
      setInventoryItems((items) => [data, ...items.filter((item) => item.id !== data.id && data.quantity > 0)]);
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

  const addInventoryCards = async (cardsToAdd, quantity) => {
    if (!supabase || !session || inventoryBusy) throw new Error("재고 기능은 로그인 후 사용할 수 있습니다.");
    const uniqueCards = [...new Map(cardsToAdd.filter(Boolean).map((card) => [card.cardId, card])).values()];
    setInventoryBusy(true);
    try {
      const currentByVariant = new Map(
        inventoryItems.map((item) => [`${item.card_id}:${item.set_code}:${item.rarity_code}`, item]),
      );
      const savedItems = [];
      for (const card of uniqueCards) {
        const set = card.card_sets?.[0];
        const setCode = set?.set_code || "";
        const rarityCode = set?.rarity_code || "";
        const current = currentByVariant.get(`${card.cardId}:${setCode}:${rarityCode}`);
        const { data, error } = await supabase
          .from("inventory_items")
          .upsert(
            {
              user_id: session.user.id,
              card_id: card.cardId,
              card_name: card.name,
              card_snapshot: card,
              rarity: set?.set_rarity || null,
              set_code: setCode,
              rarity_code: rarityCode,
              quantity: (current?.quantity || 0) + quantity,
            },
            { onConflict: "user_id,card_id,set_code,rarity_code" },
          )
          .select()
          .single();
        if (error) throw error;
        savedItems.push(data);
      }
      if (savedItems.length) {
        const { error } = await supabase
          .from("inventory_transactions")
          .insert(
            savedItems.map((item) => ({
              user_id: session.user.id,
              inventory_item_id: item.id,
              type: "purchase",
              quantity,
            })),
          );
        if (error) throw error;
      }
      setInventoryItems((items) => [
        ...savedItems,
        ...items.filter((item) => !savedItems.some((saved) => saved.id === item.id)),
      ]);
      return savedItems.length;
    } finally {
      setInventoryBusy(false);
    }
  };

  const bulkIntakeByCode = async (rawCodes, quantity) => {
    const codes = [
      ...new Set(
        rawCodes
          .split(/\r?\n|,/)
          .map((code) => code.trim())
          .filter(Boolean),
      ),
    ];
    const cardsToAdd = [];
    for (const code of codes) {
      const card = await fetchOfficialCardBySetCode(code);
      if (card) cardsToAdd.push(card);
    }
    const added = await addInventoryCards(cardsToAdd, quantity);
    return { added, missing: codes.length - cardsToAdd.length };
  };

  const batchIntake = async (items) => {
    for (const { card, quantity } of items) {
      await addInventoryCards([card], quantity);
    }
  };

  const stockSelectedRelease = async () => {
    try {
      await addInventoryCards(releaseCards, 1);
      setActionError("");
    } catch (error) {
      setActionError(`팩 입고 오류: ${error.message}`);
    }
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
      hydratePreviews(results, setCards);
    } catch (error) {
      setActionError(error.message);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <main className={`app-shell auth-state ${session ? "logged-in" : "logged-out"}`}>
      <header className="app-header">
        <div className="app-title">
          <span className="app-mark" aria-hidden="true">
            YG
          </span>
          <h1>카드 도감</h1>
        </div>
        {session ? (
          <button className="auth-button logout-button" onClick={logout} title="로그아웃">
            <LogOut size={18} aria-hidden="true" />
            <span>로그아웃</span>
          </button>
        ) : (
          <button className="auth-button login-btn" onClick={loginWithGoogle} disabled={!isSupabaseConfigured}>
            <LogIn size={18} aria-hidden="true" />
            <span>로그인</span>
          </button>
        )}
      </header>
      {!isSupabaseConfigured && (
        <p className="setup-message">Supabase 환경변수를 설정하면 로그인을 사용할 수 있습니다.</p>
      )}
      {activeTab === "search" && (
        <form
          className="search-bar"
          onSubmit={(event) => {
            event.preventDefault();
            searchCard();
          }}
        >
          <label className="search-input-wrap">
            <Search size={20} aria-hidden="true" />
            <input
              value={searchTerm}
              onChange={(event) => setSearchTerm(event.target.value)}
              placeholder="카드 이름을 검색하세요"
              aria-label="카드 이름 검색"
            />
          </label>
          <button className="search-submit" type="submit">
            검색
          </button>
        </form>
      )}
      <ManagementTabs
        activeTab={activeTab}
        onTabChange={changeTab}
        session={session}
        inventoryItems={inventoryItems}
        favoriteCards={favoriteCards}
        onOpenCard={openCardWindow}
        viewMode={viewModes[activeTab]}
        onViewModeChange={(mode) => setViewModes((current) => ({ ...current, [activeTab]: mode }))}
        favoriteIds={favoriteIds}
        onFavorite={toggleFavorite}
        showContent={!selectedCard}
        inventoryBusy={inventoryBusy}
        onBulkIntake={bulkIntakeByCode}
        onBatchIntake={batchIntake}
      />
      {loading && <p>카드를 검색하고 있습니다...</p>}
      {cardDetailLoading && <p>카드 상세를 불러오는 중입니다...</p>}
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
                showCardName={viewModes.search !== "album"}
              />
            ))}
          </section>
        </>
      )}
      {activeTab === "releases" && !selectedCard && (
        <section className="release-panel">
          {selectedRelease ? (
            <>
              <div className="release-heading">
                <div>
                  <span>{selectedRelease.category}</span>
                  <h2>{selectedRelease.name}</h2>
                  <p>{selectedRelease.date} 발매</p>
                </div>
                <button
                  className="release-back"
                  type="button"
                  aria-label="상품 목록으로 닫기"
                  title="상품 목록으로 닫기"
                  onClick={closeRelease}
                >
                  <X size={18} aria-hidden="true" />
                </button>
              </div>
              {session && (
                <button
                  className="release-stock-button"
                  type="button"
                  disabled={releaseLoading || inventoryBusy || !releaseCards.length}
                  onClick={stockSelectedRelease}
                >
                  <PackagePlus size={17} aria-hidden="true" /> 이 팩 전체 +1 입고
                </button>
              )}
              {releaseLoading ? (
                <p className="release-loading">
                  <LoaderCircle size={18} aria-hidden="true" /> 수록 카드를 불러오는 중입니다.
                </p>
              ) : (
                <>
                  <div className="results-toolbar">
                    <strong>수록 카드 {releaseCards.length}장</strong>
                  </div>
                  <div className="card-grid release-results view-album">
                    {releaseCards.map((card) => (
                      <CardResult
                        key={card.cardId}
                        card={card}
                        isFavorite={favoriteIds.has(card.cardId)}
                        onFavorite={toggleFavorite}
                        onOpen={openCardWindow}
                        viewMode="album"
                        showCardName={false}
                      />
                    ))}
                  </div>
                </>
              )}
            </>
          ) : (
            <>
              <div className="release-heading">
                <div>
                  <span>OFFICIAL DATABASE</span>
                  <h2>수록 카드</h2>
                  <p>상품을 선택해 수록 카드를 확인하세요.</p>
                </div>
              </div>
              <label className="release-search">
                <Search size={18} aria-hidden="true" />
                <input
                  value={releaseQuery}
                  onChange={(event) => setReleaseQuery(event.target.value)}
                  placeholder="상품명 검색"
                />
              </label>
              {releaseLoading ? (
                <p className="release-loading">
                  <LoaderCircle size={18} aria-hidden="true" /> 상품 목록을 불러오는 중입니다.
                </p>
              ) : (
                <div className="release-list">
                  {releases
                    .filter((release) => release.name.includes(releaseQuery.trim()))
                    .map((release) => (
                      <button
                        className="release-item"
                        type="button"
                        key={release.id}
                        onClick={() => openRelease(release)}
                      >
                        <span>{release.date}</span>
                        <strong>{release.name}</strong>
                        <small>{release.category}</small>
                      </button>
                    ))}
                </div>
              )}
            </>
          )}
        </section>
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
          onOpenRelease={openReleaseByName}
        />
      )}
    </main>
  );
}
