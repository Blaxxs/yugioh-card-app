import { useEffect, useRef, useState } from "react";
import { ArrowRight, ChevronLeft, ChevronRight, LoaderCircle, LogIn, LogOut, Search, X } from "lucide-react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";
import { getReleaseSetVariants, hydrateCardPreviews, isQuarterCenturyChronicleRelease } from "./lib/officialCardApi";
import { CARD_GAMES, DEFAULT_GAME_ID, getGameById } from "./lib/cardGames";
import {
  fetchGameCardById,
  fetchGameReleaseCards,
  fetchGameReleaseCardsPage,
  fetchGameReleaseList,
  searchGameCards,
  searchGameCardsPage,
} from "./lib/tcgApi";
import CardDetail from "./components/CardDetail";
import CardResult from "./components/CardResult";
import ManagementTabs from "./components/ManagementTabs";

const getPokemonCollectorNumber = (card) => {
  if (Number.isFinite(card.collectorNumber)) return card.collectorNumber;
  const setCode = card.card_sets?.[0]?.set_code || "";
  const match = String(setCode).match(/^(\d+)/);
  return match ? Number(match[1]) : null;
};

const sortPokemonReleaseCards = (cards) =>
  [...cards].sort((left, right) => {
    const leftNumber = getPokemonCollectorNumber(left);
    const rightNumber = getPokemonCollectorNumber(right);
    if (leftNumber == null && rightNumber != null) return 1;
    if (leftNumber != null && rightNumber == null) return -1;
    if (leftNumber != null && rightNumber != null && leftNumber !== rightNumber) return leftNumber - rightNumber;
    return String(left.cardId).localeCompare(String(right.cardId), "en", { numeric: true, sensitivity: "base" });
  });

function GameSwitcher({ activeGame, compact = false, pending = false, onSelect }) {
  return (
    <div
      className={`game-switcher ${compact ? "compact" : "expanded"}${pending ? " pending" : ""}`}
      role="radiogroup"
      aria-label="카드 선택"
      aria-hidden={pending || undefined}
    >
      {CARD_GAMES.map((game) => (
        <button
          key={game.id}
          type="button"
          role="radio"
          aria-checked={activeGame === game.id}
          data-game-id={game.id}
          className={`game-switcher-item ${activeGame === game.id ? "active" : ""}`}
          aria-label={game.label}
          title={game.label}
          onClick={() => onSelect(game.id)}
        >
          <img
            src={game.cardBack}
            alt=""
            aria-hidden="true"
            onError={(event) => {
              event.currentTarget.style.visibility = "hidden";
            }}
          />
          <span>{game.label}</span>
        </button>
      ))}
    </div>
  );
}

function LanguageSwitcher({ activeLanguage, onSelect }) {
  return (
    <div className="language-switcher" role="group" aria-label="카드 판본">
      <span>판본</span>
      {[{ id: "ko", label: "한글판" }, { id: "ja", label: "일본판" }].map((language) => (
        <button
          key={language.id}
          type="button"
          aria-pressed={activeLanguage === language.id}
          className={activeLanguage === language.id ? "active" : ""}
          onClick={() => onSelect(language.id)}
        >
          {language.label}
        </button>
      ))}
    </div>
  );
}

function GamePicker({ activeGame, isConfirming, onConfirm }) {
  const [selectedGameId, setSelectedGameId] = useState(activeGame);
  const [dragOffset, setDragOffset] = useState(0);
  const pointerStart = useRef(null);
  const suppressClick = useRef(false);
  const selectedCardRef = useRef(null);
  const selectedGame = CARD_GAMES.find((game) => game.id === selectedGameId) || CARD_GAMES[0];
  const selectedIndex = CARD_GAMES.findIndex((game) => game.id === selectedGame.id);
  const dragAdvanceThreshold = window.innerWidth <= 700 ? 58 : 72;

  const moveSelection = (direction) => {
    const nextIndex = (selectedIndex + direction + CARD_GAMES.length) % CARD_GAMES.length;
    setSelectedGameId(CARD_GAMES[nextIndex].id);
    setDragOffset(0);
  };

  const handlePointerDown = (event, gameIndex) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    pointerStart.current = { pointerId: event.pointerId, startX: event.clientX, gameIndex };
    setSelectedGameId(CARD_GAMES[gameIndex].id);
    setDragOffset(0);
  };

  const handlePointerMove = (event) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const distance = event.clientX - start.startX;
    if (Math.abs(distance) >= dragAdvanceThreshold) {
      const direction = distance < 0 ? 1 : -1;
      const nextIndex = (start.gameIndex + direction + CARD_GAMES.length) % CARD_GAMES.length;
      pointerStart.current = { ...start, startX: event.clientX, gameIndex: nextIndex, advanced: true };
      suppressClick.current = true;
      setSelectedGameId(CARD_GAMES[nextIndex].id);
      setDragOffset(0);
      return;
    }
    setDragOffset(Math.max(-dragAdvanceThreshold, Math.min(dragAdvanceThreshold, distance)));
  };

  const handlePointerEnd = (event) => {
    const start = pointerStart.current;
    if (!start || start.pointerId !== event.pointerId) return;
    const distance = event.clientX - start.startX;
    pointerStart.current = null;
    setDragOffset(0);
    if (!start.advanced && Math.abs(distance) >= dragAdvanceThreshold) {
      const direction = distance < 0 ? 1 : -1;
      setSelectedGameId(CARD_GAMES[(start.gameIndex + direction + CARD_GAMES.length) % CARD_GAMES.length].id);
    }
    if (!start.advanced && Math.abs(distance) < dragAdvanceThreshold) return;
    suppressClick.current = true;
    window.setTimeout(() => {
      suppressClick.current = false;
    }, 0);
  };

  const confirmSelection = () => {
    if (!isConfirming) onConfirm(selectedGame.id, selectedCardRef.current?.getBoundingClientRect());
  };

  return (
    <div
      className={`game-picker-overlay ${isConfirming ? "is-confirming" : ""}`}
      role="dialog"
      aria-modal="true"
      aria-label="카드 선택"
    >
      <section className="game-picker-panel">
        <h2>카드를 선택하세요.</h2>
        <div className="game-picker-stage">
          {CARD_GAMES.map((game, index) => {
            const isSelected = game.id === selectedGame.id;
            const relativePosition = isSelected ? 0 : index === (selectedIndex + 1) % CARD_GAMES.length ? 1 : -1;
            const spread = window.innerWidth <= 700 ? 72 : 112;
            const horizontalOffset = relativePosition * spread + (isSelected ? dragOffset : 0);
            const verticalOffset = Math.abs(relativePosition) * 18;
            const rotation = relativePosition * 8 + (isSelected ? dragOffset * 0.035 : 0);
            const scale = isSelected ? 1 : 0.86;
            return (
              <button
                key={game.id}
                ref={isSelected ? selectedCardRef : null}
                className={`game-picker-card ${isSelected ? "is-selected" : ""} ${isSelected && dragOffset ? "is-dragging" : ""}`}
                type="button"
                aria-pressed={isSelected}
                aria-label={`${game.label} 카드 선택`}
                disabled={isConfirming}
                style={{
                  zIndex: isSelected ? 3 : 2,
                  transform: `translate3d(calc(-50% + ${horizontalOffset}px), ${verticalOffset}px, 0) rotate(${rotation}deg) scale(${scale})`,
                }}
                onPointerDown={(event) => handlePointerDown(event, index)}
                onPointerMove={handlePointerMove}
                onPointerUp={handlePointerEnd}
                onPointerCancel={handlePointerEnd}
                onClick={() => {
                  if (suppressClick.current) return;
                  setSelectedGameId(game.id);
                  setDragOffset(0);
                }}
              >
                <img src={game.cardBack} alt="" draggable="false" />
                <span>{game.label} 카드 선택</span>
              </button>
            );
          })}
        </div>
        <div className="game-picker-selection">
          <button
            className="game-picker-arrow"
            type="button"
            aria-label="이전 카드"
            disabled={isConfirming}
            onClick={() => moveSelection(-1)}
          >
            <ChevronLeft size={20} aria-hidden="true" />
          </button>
          <strong>{selectedGame.label}</strong>
          <button
            className="game-picker-arrow"
            type="button"
            aria-label="다음 카드"
            disabled={isConfirming}
            onClick={() => moveSelection(1)}
          >
            <ChevronRight size={20} aria-hidden="true" />
          </button>
        </div>
        <button className="game-picker-confirm" type="button" disabled={isConfirming} onClick={confirmSelection}>
          {selectedGame.label} 카드 선택
          <ArrowRight size={18} aria-hidden="true" />
        </button>
      </section>
    </div>
  );
}

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
  const [searchNextOffset, setSearchNextOffset] = useState(null);
  const [searchMoreLoading, setSearchMoreLoading] = useState(false);
  const searchLoadMoreSentinelRef = useRef(null);
  const searchMoreLockRef = useRef(false);
  const [cardDetailLoading, setCardDetailLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedCard, setSelectedCard] = useState(savedHistory?.selectedCard || savedView.selectedCard || null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [favoriteCards, setFavoriteCards] = useState([]);
  const [inventoryItems, setInventoryItems] = useState([]);
  const [inventory, setInventory] = useState(null);
  const [inventoryTransactions, setInventoryTransactions] = useState([]);
  const [salesHistory, setSalesHistory] = useState([]);
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
  const [releaseNextOffset, setReleaseNextOffset] = useState(null);
  const [releaseMoreLoading, setReleaseMoreLoading] = useState(false);
  const releaseLoadMoreSentinelRef = useRef(null);
  const releaseMoreLockRef = useRef(false);
  const searchMoreHandlerRef = useRef(null);
  const releaseMoreHandlerRef = useRef(null);
  const [activeGame, setActiveGame] = useState(() => {
    try {
      return localStorage.getItem("ygo-active-game") || DEFAULT_GAME_ID;
    } catch {
      return DEFAULT_GAME_ID;
    }
  });
  const [activeLanguage, setActiveLanguage] = useState(() => {
    try {
      return localStorage.getItem("ygo-active-language") === "ja" ? "ja" : "ko";
    } catch {
      return "ko";
    }
  });
  const [gameSelectionComplete, setGameSelectionComplete] = useState(false);
  const [gameSelectionFlight, setGameSelectionFlight] = useState(null);
  const gameSelectionTimer = useRef(null);
  const historyIndex = useRef(savedHistory?.index || 0);
  const viewRef = useRef({ activeTab, selectedCard, selectedRelease });
  const loadedReleasePath = useRef(null);

  useEffect(() => {
    sessionStorage.setItem(
      "ygo-view-state",
      JSON.stringify({ searchTerm, cards, selectedCard, activeTab, viewModes, activeLanguage }),
    );
  }, [searchTerm, cards, selectedCard, activeTab, viewModes, activeLanguage]);

  useEffect(() => {
    viewRef.current = { activeTab, selectedCard, selectedRelease };
  }, [activeTab, selectedCard, selectedRelease]);

  useEffect(
    () => () => {
      if (gameSelectionTimer.current) window.clearTimeout(gameSelectionTimer.current);
    },
    [],
  );

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
      setActionError("");
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
      supabase
        .from("inventory_transactions")
        .select("*, inventory_items(card_name, set_code, rarity_code, rarity, condition, card_snapshot)")
        .eq("user_id", session.user.id)
        .eq("type", "sale")
        .order("occurred_at", { ascending: false }),
    ]).then(([favoritesResult, inventoryResult, salesResult]) => {
      if (favoritesResult.error) setActionError(`찌 목록 오류: ${favoritesResult.error.message}`);
      if (inventoryResult.error) setActionError(`재고 목록 오류: ${inventoryResult.error.message}`);
      if (salesResult.error) setActionError(`판매 내역 오류: ${salesResult.error.message}`);
      setFavoriteIds(new Set((favoritesResult.data || []).map((item) => item.card_id)));
      setFavoriteCards(
        (favoritesResult.data || [])
          .filter((item) => item.card_snapshot)
          .map((item) => ({ ...item.card_snapshot, cardId: item.card_snapshot.cardId || item.card_id })),
      );
      setInventoryItems(inventoryResult.data || []);
      setSalesHistory(salesResult.data || []);
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
        setReleases(await fetchGameReleaseList(activeGame, activeLanguage));
      } catch (error) {
        setActionError(error.message);
      } finally {
        setReleaseLoading(false);
      }
    };
    loadReleases();
  }, [activeTab, releaseLoading, releases.length, activeGame, activeLanguage]);

  useEffect(() => {
    const releaseLoadKey = `${activeGame}:${activeLanguage}:${selectedRelease?.path || ""}`;
    if (!selectedRelease || loadedReleasePath.current === releaseLoadKey) return;
    const loadReleaseCards = async () => {
      await Promise.resolve();
      loadedReleasePath.current = releaseLoadKey;
      setReleaseCards([]);
      setReleaseNextOffset(null);
      setReleaseLoading(true);
      try {
        const page =
          activeGame === "pokemon" || activeGame === "onepiece"
            ? await fetchGameReleaseCardsPage(activeGame, selectedRelease.path, 0, activeLanguage)
            : { cards: await fetchGameReleaseCards(activeGame, selectedRelease.path, activeLanguage), nextOffset: null };
        const previews = page.cards;
        setReleaseNextOffset(page.nextOffset);
        if (activeGame !== "yugioh" || !isQuarterCenturyChronicleRelease(selectedRelease.name)) {
          setReleaseCards(
            activeGame === "pokemon" && activeLanguage === "ko" ? sortPokemonReleaseCards(previews) : previews,
          );
          return;
        }
        const detailedCards = [];
        await hydrateCardPreviews(previews, (card) => detailedCards.push(card), activeLanguage);
        const detailsById = new Map(detailedCards.map((card) => [card.cardId, card]));
        setReleaseCards(
          previews
            .map((preview) => detailsById.get(preview.cardId) || preview)
            .flatMap((card) =>
              getReleaseSetVariants(card.card_sets, selectedRelease.name).length
                ? getReleaseSetVariants(card.card_sets, selectedRelease.name).map((set) => ({
                    ...card,
                    id: `${card.cardId}-${set.set_code}-${set.rarity_code}`,
                    card_sets: [set],
                  }))
                : [card],
            ),
        );
      } catch (error) {
        loadedReleasePath.current = null;
        setActionError(error.message);
      } finally {
        setReleaseLoading(false);
      }
    };
    loadReleaseCards();
  }, [selectedRelease, activeGame, activeLanguage]);

  const loadMoreReleaseCards = async () => {
    if (
      (activeGame !== "pokemon" && activeGame !== "onepiece") ||
      !selectedRelease ||
      releaseNextOffset == null ||
      releaseMoreLoading ||
      releaseMoreLockRef.current
    )
      return;
    releaseMoreLockRef.current = true;
    setReleaseMoreLoading(true);
    setActionError("");
    try {
      const page = await fetchGameReleaseCardsPage(activeGame, selectedRelease.path, releaseNextOffset, activeLanguage);
      setReleaseCards((current) => {
        const seen = new Set(current.map((card) => card.cardId));
        const cards = [...current, ...page.cards.filter((card) => !seen.has(card.cardId))];
        return activeGame === "pokemon" && activeLanguage === "ko" ? sortPokemonReleaseCards(cards) : cards;
      });
      setReleaseNextOffset(page.nextOffset);
    } catch (error) {
      setActionError(error.message);
    } finally {
      releaseMoreLockRef.current = false;
      setReleaseMoreLoading(false);
    }
  };

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

  const confirmInitialGame = (gameId, sourceRect) => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches || !sourceRect) {
      changeGame(gameId);
      return;
    }
    const target = document.querySelector(`.app-header .game-switcher-item[data-game-id="${gameId}"]`);
    if (!target) {
      changeGame(gameId);
      return;
    }
    const targetRect = target.getBoundingClientRect();
    setGameSelectionFlight({
      gameId,
      left: sourceRect.left,
      top: sourceRect.top,
      width: sourceRect.width,
      height: sourceRect.height,
      x: targetRect.left + targetRect.width / 2 - (sourceRect.left + sourceRect.width / 2),
      y: targetRect.top + targetRect.height / 2 - (sourceRect.top + sourceRect.height / 2),
      scaleX: targetRect.width / sourceRect.width,
      scaleY: targetRect.height / sourceRect.height,
    });
    gameSelectionTimer.current = window.setTimeout(() => {
      changeGame(gameId);
      setGameSelectionFlight(null);
      gameSelectionTimer.current = null;
    }, 520);
  };

  const changeGame = (gameId) => {
    setGameSelectionComplete(true);
    try {
      localStorage.setItem("ygo-active-game", gameId);
    } catch {
      // ignore storage failures (private browsing, quota, etc.)
    }
    if (gameId === activeGame) return;
    setActiveGame(gameId);
    setActionError("");
    setSearchTerm("");
    setCards([]);
    setSearchNextOffset(null);
    setSelectedCard(null);
    setReleases([]);
    setReleaseCards([]);
    setReleaseNextOffset(null);
    setSelectedRelease(null);
    loadedReleasePath.current = null;
  };

  const changeTab = (tab) => {
    if (tab === activeTab && !selectedCard && !selectedRelease) return;
    setActionError("");
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
        const fetchedReleases = await fetchGameReleaseList(activeGame, activeLanguage);
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
      const detailedCard = await fetchGameCardById(
        card.game || activeGame,
        card.cardId,
        card.name,
        card.card_images?.[0]?.image_url_small,
        card.language || activeLanguage,
      );
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
              condition: card.condition || null,
              purchase_price: card.purchase_price ? Number(card.purchase_price) : null,
              memo: card.memo || null,
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

  const batchIntake = async (items) => {
    for (const { card, quantity, price } of items) {
      await addInventoryCards([{ ...card, purchase_price: price }], quantity);
    }
  };

  const deleteInventoryItems = async (ids) => {
    if (!supabase || !session || !ids.length) return;
    const { error } = await supabase.from("inventory_items").delete().in("id", ids).eq("user_id", session.user.id);
    if (error) return setActionError(`재고 삭제 오류: ${error.message}`);
    setInventoryItems((items) => items.filter((item) => !ids.includes(item.id)));
  };

  const updateInventoryItems = async (updates) => {
    if (!supabase || !session || !updates.length || inventoryBusy) return false;
    setInventoryBusy(true);
    setActionError("");
    const updatedItems = [];
    try {
      for (const update of updates) {
        const { data, error } = await supabase
          .from("inventory_items")
          .update({ ...update.changes, updated_at: new Date().toISOString() })
          .eq("id", update.id)
          .eq("user_id", session.user.id)
          .select()
          .single();
        if (error) throw error;
        updatedItems.push(data);
      }
      setInventoryItems((items) => items.map((item) => updatedItems.find((updated) => updated.id === item.id) || item));
      return true;
    } catch (error) {
      setActionError(
        error.code === "23505"
          ? "같은 카드·코드·레어도 재고가 이미 존재합니다. 기존 항목과 합친 뒤 다시 시도해 주세요."
          : `재고 수정 오류: ${error.message}`,
      );
      return false;
    } finally {
      setInventoryBusy(false);
    }
  };

  const sellInventoryItems = async (sales) => {
    if (!supabase || !session || !sales.length) return;
    setInventoryBusy(true);
    try {
      const updatedItems = [];
      const newSaleEntries = [];
      for (const sale of sales) {
        const item = inventoryItems.find((current) => current.id === sale.id);
        if (!item) continue;
        const soldQuantity = Math.min(Math.max(1, Number(sale.quantity) || 0), item.quantity);
        if (!soldQuantity) continue;
        const unitPrice = sale.price === "" || sale.price == null ? null : Number(sale.price);
        const { data, error } = await supabase
          .from("inventory_items")
          .update({
            quantity: item.quantity - soldQuantity,
            sale_price: unitPrice ?? item.sale_price,
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id)
          .eq("user_id", session.user.id)
          .select()
          .single();
        if (error) throw error;
        const { data: transaction, error: transactionError } = await supabase
          .from("inventory_transactions")
          .insert({
            user_id: session.user.id,
            inventory_item_id: item.id,
            type: "sale",
            quantity: soldQuantity,
            unit_price: unitPrice,
          })
          .select()
          .single();
        if (transactionError) throw transactionError;
        updatedItems.push(data);
        newSaleEntries.push({
          ...transaction,
          inventory_items: {
            card_name: item.card_name,
            set_code: item.set_code,
            rarity_code: item.rarity_code,
            rarity: item.rarity,
            condition: item.condition,
            card_snapshot: item.card_snapshot,
          },
        });
      }
      setInventoryItems((items) =>
        items
          .map((item) => updatedItems.find((updated) => updated.id === item.id) || item)
          .filter((item) => item.quantity > 0),
      );
      setSalesHistory((history) => [...newSaleEntries, ...history]);
    } catch (error) {
      setActionError(`판매 처리 오류: ${error.message}`);
    } finally {
      setInventoryBusy(false);
    }
  };

  const cancelSalesTransactions = async (transactions) => {
    if (!supabase || !session || !transactions.length) return;
    setInventoryBusy(true);
    try {
      for (const transaction of transactions) {
        if (transaction.canceled_at) continue;
        const { data: currentItem, error: fetchError } = await supabase
          .from("inventory_items")
          .select("*")
          .eq("id", transaction.inventory_item_id)
          .eq("user_id", session.user.id)
          .maybeSingle();
        if (fetchError) throw fetchError;
        const nextQuantity = (currentItem?.quantity || 0) + transaction.quantity;
        const { data: updatedItem, error: updateError } = await supabase
          .from("inventory_items")
          .update({ quantity: nextQuantity, updated_at: new Date().toISOString() })
          .eq("id", transaction.inventory_item_id)
          .eq("user_id", session.user.id)
          .select()
          .single();
        if (updateError) throw updateError;
        const { error: cancelError } = await supabase
          .from("inventory_transactions")
          .update({ canceled_at: new Date().toISOString() })
          .eq("id", transaction.id)
          .eq("user_id", session.user.id);
        if (cancelError) throw cancelError;
        setInventoryItems((items) => {
          const exists = items.some((item) => item.id === updatedItem.id);
          return exists
            ? items.map((item) => (item.id === updatedItem.id ? updatedItem : item))
            : [updatedItem, ...items];
        });
        setSalesHistory((history) =>
          history.map((entry) =>
            entry.id === transaction.id ? { ...entry, canceled_at: new Date().toISOString() } : entry,
          ),
        );
      }
    } catch (error) {
      setActionError(`판매 취소 오류: ${error.message}`);
    } finally {
      setInventoryBusy(false);
    }
  };

  const addInventoryVariant = async ({ card, set, condition, price, quantity, imageIndex, memo }) => {
    const image = card.card_images?.[imageIndex] || card.card_images?.[0];
    await addInventoryCards(
      [{ ...card, card_images: image ? [image] : [], card_sets: [set], condition, purchase_price: price, memo }],
      Number(quantity),
    );
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

  const searchCard = async (language = activeLanguage) => {
    setSelectedCard(null);
    setActiveTab("search");
    setSearchNextOffset(null);
    if (!searchTerm.trim()) return;
    setLoading(true);
    setActionError("");
    try {
      if (activeGame === "pokemon" || activeGame === "onepiece") {
        const page = await searchGameCardsPage(activeGame, searchTerm, 0, language);
        setCards(page.cards);
        setSearchNextOffset(page.nextOffset);
      } else {
        setCards(await searchGameCards(activeGame, searchTerm, language));
      }
    } catch (error) {
      setActionError(error.message);
      setCards([]);
    } finally {
      setLoading(false);
    }
  };

  const changeLanguage = async (language) => {
    if (language === activeLanguage) return;
    setActiveLanguage(language);
    try {
      localStorage.setItem("ygo-active-language", language);
    } catch {
      // ignore storage failures
    }
    setActionError("");
    setCards([]);
    setSearchNextOffset(null);
    setSelectedCard(null);
    setReleases([]);
    setReleaseCards([]);
    setReleaseNextOffset(null);
    setSelectedRelease(null);
    loadedReleasePath.current = null;
    if (activeTab === "search" && searchTerm.trim()) {
      setLoading(true);
      try {
        if (activeGame === "pokemon" || activeGame === "onepiece") {
          const page = await searchGameCardsPage(activeGame, searchTerm, 0, language);
          setCards(page.cards);
          setSearchNextOffset(page.nextOffset);
        } else {
          setCards(await searchGameCards(activeGame, searchTerm, language));
        }
      } catch (error) {
        setActionError(error.message);
      } finally {
        setLoading(false);
      }
    }
  };

  const loadMoreSearchCards = async () => {
    if (
      (activeGame !== "pokemon" && activeGame !== "onepiece") ||
      searchNextOffset == null ||
      searchMoreLoading ||
      searchMoreLockRef.current
    )
      return;
    searchMoreLockRef.current = true;
    setSearchMoreLoading(true);
    setActionError("");
    try {
      const page = await searchGameCardsPage(activeGame, searchTerm, searchNextOffset);
      setCards((current) => {
        const seen = new Set(current.map((card) => card.cardId));
        return [...current, ...page.cards.filter((card) => !seen.has(card.cardId))];
      });
      setSearchNextOffset(page.nextOffset);
    } catch (error) {
      setActionError(error.message);
    } finally {
      searchMoreLockRef.current = false;
      setSearchMoreLoading(false);
    }
  };

  useEffect(() => {
    searchMoreHandlerRef.current = loadMoreSearchCards;
    releaseMoreHandlerRef.current = loadMoreReleaseCards;
  });

  useEffect(() => {
    if (
      activeTab !== "search" ||
      selectedCard ||
      (activeGame !== "pokemon" && activeGame !== "onepiece") ||
      searchNextOffset == null ||
      loading ||
      searchMoreLoading ||
      !searchLoadMoreSentinelRef.current ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) searchMoreHandlerRef.current?.();
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(searchLoadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [activeTab, selectedCard, activeGame, searchNextOffset, loading, searchMoreLoading]);

  useEffect(() => {
    if (
      activeTab !== "releases" ||
      !selectedRelease ||
      (activeGame !== "pokemon" && activeGame !== "onepiece") ||
      releaseNextOffset == null ||
      releaseLoading ||
      releaseMoreLoading ||
      !releaseLoadMoreSentinelRef.current ||
      typeof IntersectionObserver === "undefined"
    )
      return undefined;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) releaseMoreHandlerRef.current?.();
      },
      { rootMargin: "480px 0px" },
    );
    observer.observe(releaseLoadMoreSentinelRef.current);
    return () => observer.disconnect();
  }, [activeTab, selectedRelease, activeGame, releaseNextOffset, releaseLoading, releaseMoreLoading]);

  return (
    <main className={`app-shell auth-state ${session ? "logged-in" : "logged-out"}`}>
      <header className="app-header">
        <div className="app-title">
          <span className="app-mark" aria-hidden="true">
            YG
          </span>
          <h1>카드 도감</h1>
        </div>
        <GameSwitcher activeGame={activeGame} compact pending={!gameSelectionComplete} onSelect={changeGame} />
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
      {!gameSelectionComplete && (
        <GamePicker
          activeGame={activeGame}
          isConfirming={Boolean(gameSelectionFlight)}
          onConfirm={confirmInitialGame}
        />
      )}
      {gameSelectionFlight && (
        <img
          className="game-selection-flight"
          src={getGameById(gameSelectionFlight.gameId).cardBack}
          alt=""
          aria-hidden="true"
          style={{
            left: gameSelectionFlight.left,
            top: gameSelectionFlight.top,
            width: gameSelectionFlight.width,
            height: gameSelectionFlight.height,
            "--flight-x": `${gameSelectionFlight.x}px`,
            "--flight-y": `${gameSelectionFlight.y}px`,
            "--flight-scale-x": gameSelectionFlight.scaleX,
            "--flight-scale-y": gameSelectionFlight.scaleY,
          }}
        />
      )}
      <LanguageSwitcher activeLanguage={activeLanguage} onSelect={changeLanguage} />
      <ManagementTabs
        activeTab={activeTab}
        activeGame={activeGame}
        activeLanguage={activeLanguage}
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
        onBatchIntake={batchIntake}
        onAddInventory={addInventoryVariant}
        onDeleteInventory={deleteInventoryItems}
        onUpdateInventory={updateInventoryItems}
        onSellInventory={sellInventoryItems}
        salesHistory={salesHistory}
        onCancelSales={cancelSalesTransactions}
      />
      <div className={`search-slot ${activeTab === "search" ? "has-search" : ""}`}>
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
                placeholder={`${getGameById(activeGame).label} 카드 이름을 검색하세요`}
                aria-label="카드 이름 검색"
              />
            </label>
            <button className="search-submit" type="submit">
              검색
            </button>
          </form>
        )}
      </div>
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
          {(activeGame === "pokemon" || activeGame === "onepiece") && searchNextOffset != null && (
            <div className="auto-load-sentinel" ref={searchLoadMoreSentinelRef}>
              {searchMoreLoading && (
                <p className="auto-load-status" role="status">
                  <LoaderCircle size={17} aria-hidden="true" /> 카드를 불러오는 중...
                </p>
              )}
            </div>
          )}
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
                    {releaseCards.map((card, index) => (
                      <CardResult
                        key={card.id || card.cardId}
                        card={card}
                        isFavorite={favoriteIds.has(card.cardId)}
                        onFavorite={toggleFavorite}
                        onOpen={openCardWindow}
                        viewMode="album"
                        showCardName={false}
                        showSetRarity={isQuarterCenturyChronicleRelease(selectedRelease.name)}
                        prioritizeImage={index < 8}
                      />
                    ))}
                  </div>
                  {(activeGame === "pokemon" || activeGame === "onepiece") && releaseNextOffset != null && (
                    <div className="auto-load-sentinel" ref={releaseLoadMoreSentinelRef}>
                      {releaseMoreLoading && (
                        <p className="auto-load-status" role="status">
                          <LoaderCircle size={17} aria-hidden="true" /> 카드를 불러오는 중...
                        </p>
                      )}
                    </div>
                  )}
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
                  onKeyDown={(event) => {
                    if (event.key === "Enter") event.preventDefault();
                  }}
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
