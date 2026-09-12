import { useEffect, useState } from "react";
import { isSupabaseConfigured, supabase } from "./lib/supabase";

const normalizeCardName = (name) => name.replace(/\s+/g, "");
const OFFICIAL_SITE_ORIGIN = "https://www.db.yugioh-card.com";

const fetchOfficialHtml = async (url) => {
  const response = await fetch(`/official-ygo${url.pathname}${url.search}`);
  if (!response.ok) throw new Error("공식 카드 데이터베이스에 연결할 수 없습니다.");
  return new DOMParser().parseFromString(await response.text(), "text/html");
};

const createSearchUrl = (keyword) => {
  const searchUrl = new URL(`${OFFICIAL_SITE_ORIGIN}/yugiohdb/card_search.action`);
  searchUrl.search = new URLSearchParams({
    request_locale: "ko",
    ope: "1",
    sess: "1",
    rp: "100",
    sort: "1",
    keyword,
    stype: "1",
    othercon: "2",
    link_m: "2",
    releaseDStart: "1",
    releaseMStart: "1",
    releaseYStart: "1999",
  });
  return searchUrl;
};

const findCardEntries = (document, normalizedSearchTerm) => {
  const entries = [];
  const seen = new Set();
  const rows = [...document.querySelectorAll(".t_row.c_normal")].filter((row) =>
    normalizeCardName(row.querySelector(".card_name")?.textContent || "").includes(normalizedSearchTerm),
  );

  for (const row of rows) {
    const image = row.querySelector("img[id^='card_image']");
    const cardId = row.querySelector("input.cid")?.value;
    if (!image || !cardId || seen.has(cardId)) continue;
    seen.add(cardId);
    entries.push({
      cardId,
      href: new URL(`/yugiohdb/card_search.action?request_locale=ko&ope=2&cid=${cardId}`, OFFICIAL_SITE_ORIGIN),
      imageUrl: `${OFFICIAL_SITE_ORIGIN}/yugiohdb/get_image.action?type=2&cid=${cardId}&ciid=1`,
      name: row.querySelector(".card_name")?.textContent.trim() || "",
    });
  }

  return entries;
};

const parseOfficialCard = (document, fallbackName, imageUrl, cardId) => {
  const cardRoot = document.querySelector("#CardSet") || document;
  const read = (selector) => cardRoot.querySelector(selector)?.textContent.trim() || null;
  const itemValue = (title) =>
    [...cardRoot.querySelectorAll(".item_box")]
      .find((item) => item.querySelector(".item_box_title")?.textContent.trim() === title)
      ?.querySelector(".item_box_value")
      ?.textContent.trim() || null;
  const attribute =
    cardRoot
      .querySelector("img[src*='/attribute/']")
      ?.closest(".item_box")
      ?.querySelector(".item_box_value")
      ?.textContent.trim() || null;
  const level =
    cardRoot
      .querySelector("img[src*='icon_level']")
      ?.closest(".item_box")
      ?.querySelector(".item_box_value")
      ?.textContent.trim() || null;
  const cardName = cardRoot.querySelector("#cardname h1")?.childNodes[0]?.textContent.trim() || fallbackName;
  const imageAuth = document.documentElement.innerHTML.match(
    /get_image\.action\?type=2&cid=\d+&ciid=\d+&enc=([^&'" )]+)/,
  )?.[1];
  const images = [...cardRoot.querySelectorAll("img[id^='card_image']")].map((image, index) => {
    const source = image.getAttribute("src");
    const ciid = image.id.split("_").pop();
    const imageUrl =
      source && source !== "null"
        ? new URL(source, OFFICIAL_SITE_ORIGIN).href
        : `${OFFICIAL_SITE_ORIGIN}/yugiohdb/get_image.action?type=2&cid=${cardId}&ciid=${ciid}&enc=${imageAuth}`;
    return { id: `${cardName}-${index}`, image_url_small: imageUrl };
  });
  const cardSets = [...document.querySelectorAll(".t_row")]
    .map((row) => ({
      set_code: row.querySelector(".card_number")?.textContent.trim(),
      set_name: row.querySelector(".pack_name")?.textContent.trim(),
      set_rarity: row.querySelector(".rarity p")?.textContent.trim(),
    }))
    .filter((set) => set.set_code && set.set_name && set.set_rarity);

  return {
    id: cardId,
    cardId,
    name: cardName,
    card_images: images.length > 0 ? images : [{ id: imageUrl, image_url_small: imageUrl }],
    koreanData: {
      cardName,
      cardAttr: attribute,
      cardLevel: level,
      cardOther: read(".species"),
      cardAtk: itemValue("ATK") ? `공격력 ${itemValue("ATK")}` : null,
      cardDef: itemValue("DEF") ? `수비력 ${itemValue("DEF")}` : null,
      cardText: read(".top .CardText .text_linebreak"),
    },
    card_sets: cardSets,
  };
};

export default function App() {
  const [searchTerm, setSearchTerm] = useState("");
  const [cards, setCards] = useState([]);
  const [loading, setLoading] = useState(false);
  const [session, setSession] = useState(null);
  const [selectedCard, setSelectedCard] = useState(null);
  const [favoriteIds, setFavoriteIds] = useState(new Set());
  const [inventory, setInventory] = useState(null);
  const [inventoryBusy, setInventoryBusy] = useState(false);
  const [purchasePrice, setPurchasePrice] = useState("");
  const [condition, setCondition] = useState("미등록");

  useEffect(() => {
    if (!supabase) return undefined;

    supabase.auth.getSession().then(({ data: { session: currentSession } }) => {
      setSession(currentSession);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, currentSession) => {
      setSession(currentSession);
    });

    return () => subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!supabase || !session) {
      return undefined;
    }

    supabase
      .from("favorites")
      .select("card_id")
      .then(({ data, error }) => {
        if (error) console.error("찜 목록을 불러오지 못했습니다:", error);
        setFavoriteIds(new Set((data || []).map((item) => item.card_id)));
      });

    return undefined;
  }, [session]);

  useEffect(() => {
    if (!supabase || !session || !selectedCard) {
      return undefined;
    }

    supabase
      .from("inventory_items")
      .select("*")
      .eq("user_id", session.user.id)
      .eq("card_id", selectedCard.cardId)
      .maybeSingle()
      .then(({ data, error }) => {
        if (error) console.error("재고를 불러오지 못했습니다:", error);
        setInventory(data);
        setPurchasePrice(data?.purchase_price ?? "");
        setCondition(data?.condition || "미등록");
      });

    return undefined;
  }, [session, selectedCard]);

  const toggleFavorite = async (card) => {
    if (!supabase || !session) return;
    const isFavorite = favoriteIds.has(card.cardId);
    const nextFavorites = new Set(favoriteIds);
    if (isFavorite) {
      const { error } = await supabase
        .from("favorites")
        .delete()
        .eq("user_id", session.user.id)
        .eq("card_id", card.cardId);
      if (error) return console.error("찜을 취소하지 못했습니다:", error);
      nextFavorites.delete(card.cardId);
    } else {
      const { error } = await supabase
        .from("favorites")
        .upsert({ user_id: session.user.id, card_id: card.cardId, card_name: card.name, card_snapshot: card });
      if (error) return console.error("카드를 찜하지 못했습니다:", error);
      nextFavorites.add(card.cardId);
    }
    setFavoriteIds(nextFavorites);
  };

  const saveInventory = async (quantityDelta) => {
    if (!supabase || !session || !selectedCard || inventoryBusy) return;
    setInventoryBusy(true);
    const currentQuantity = inventory?.quantity || 0;
    const nextQuantity = Math.max(0, currentQuantity + quantityDelta);
    const payload = {
      user_id: session.user.id,
      card_id: selectedCard.cardId,
      card_name: selectedCard.name,
      rarity: selectedCard.card_sets?.[0]?.set_rarity || null,
      condition,
      quantity: nextQuantity,
      purchase_price: purchasePrice === "" ? null : Number(purchasePrice),
      memo: null,
    };
    const { data, error } = await supabase
      .from("inventory_items")
      .upsert(payload, { onConflict: "user_id,card_id" })
      .select()
      .single();
    if (error) console.error("재고를 저장하지 못했습니다:", error);
    else setInventory(data);
    setInventoryBusy(false);
  };

  const loginWithGoogle = async () => {
    if (!supabase) return;
    await supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: window.location.origin } });
  };

  const logout = async () => {
    if (!supabase) return;
    await supabase.auth.signOut();
  };

  const searchCard = async () => {
    if (!searchTerm) return;
    setLoading(true);
    try {
      const normalizedSearchTerm = normalizeCardName(searchTerm);
      let searchDocument = await fetchOfficialHtml(createSearchUrl(searchTerm));
      let entries = findCardEntries(searchDocument, normalizedSearchTerm);
      if (entries.length === 0 && normalizedSearchTerm.length > 1) {
        searchDocument = await fetchOfficialHtml(createSearchUrl(normalizedSearchTerm.slice(0, 2)));
        entries = findCardEntries(searchDocument, normalizedSearchTerm);
      }
      const localizedCards = await Promise.all(
        entries.map(async (entry) => {
          const detailDocument = await fetchOfficialHtml(entry.href);
          return parseOfficialCard(detailDocument, entry.name, entry.imageUrl, entry.cardId);
        }),
      );
      setCards(localizedCards);
    } catch (error) {
      console.error("카드 검색 실패:", error);
      setCards([]);
    }
    setLoading(false);
  };

  return (
    <div style={{ padding: "20px", maxWidth: "800px", margin: "0 auto", fontFamily: "sans-serif" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: "12px" }}>
        <h1>🃏 유희왕 카드 & 시세 검색 (국내 OCG)</h1>
        {session ? (
          <button onClick={logout} style={{ padding: "8px 12px", cursor: "pointer" }}>
            로그아웃 ({session.user.email})
          </button>
        ) : (
          <button
            onClick={loginWithGoogle}
            disabled={!isSupabaseConfigured}
            style={{ padding: "8px 12px", cursor: isSupabaseConfigured ? "pointer" : "not-allowed" }}
          >
            Google 로그인
          </button>
        )}
      </div>
      {!isSupabaseConfigured && (
        <p style={{ color: "#a15c00", marginBottom: "16px" }}>
          Supabase 환경변수를 설정하면 로그인을 사용할 수 있습니다.
        </p>
      )}

      {/* 검색창 */}
      <div style={{ display: "flex", gap: "10px", marginBottom: "20px" }}>
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && searchCard()}
          placeholder="카드 이름을 입력하세요 (예: 푸른 눈의 백룡)"
          style={{ flex: 1, padding: "10px", fontSize: "16px" }}
        />
        <button onClick={searchCard} style={{ padding: "10px 20px", fontSize: "16px", cursor: "pointer" }}>
          검색
        </button>
      </div>

      {loading && <p>카드를 검색하고 있습니다...</p>}

      {/* 카드 리스트 */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(240px, 1fr))", gap: "20px" }}>
        {cards.map((card) => (
          <div
            key={card.id}
            onClick={() => setSelectedCard(card)}
            style={{
              border: "1px solid #ccc",
              borderRadius: "8px",
              padding: "15px",
              textAlign: "center",
              cursor: "pointer",
            }}
          >
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                type="button"
                aria-label={favoriteIds.has(card.cardId) ? "찜 취소" : "찜하기"}
                onClick={(event) => {
                  event.stopPropagation();
                  toggleFavorite(card);
                }}
                disabled={!session}
                style={{
                  border: 0,
                  background: "transparent",
                  fontSize: "24px",
                  cursor: session ? "pointer" : "not-allowed",
                }}
              >
                {favoriteIds.has(card.cardId) ? "♥" : "♡"}
              </button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(90px, 1fr))", gap: "8px" }}>
              {card.card_images?.map((image) => (
                <img
                  key={image.id}
                  src={image.image_url_small}
                  alt={`${card.name} 일러스트`}
                  style={{ width: "100%", borderRadius: "4px" }}
                />
              ))}
            </div>
            <h3 style={{ fontSize: "16px", margin: "10px 0 5px" }}>{card.koreanData.cardName}</h3>

            {/* 카드 기본 정보 */}
            <div
              style={{
                fontSize: "13px",
                lineHeight: "1.6",
                color: "#444",
                textAlign: "left",
                margin: "10px 0",
                padding: "10px",
                backgroundColor: "#f7f7f7",
                borderRadius: "4px",
              }}
            >
              <p>
                <strong>종류:</strong> {card.koreanData.cardOther || card.type}
              </p>
              {card.koreanData.cardAttr && (
                <p>
                  <strong>속성:</strong> {card.koreanData.cardAttr}
                </p>
              )}
              {card.koreanData.cardLevel && (
                <p>
                  <strong>레벨/랭크:</strong> {card.koreanData.cardLevel}
                </p>
              )}
              {card.koreanData.cardAtk && (
                <p>
                  <strong>공격력:</strong> {card.koreanData.cardAtk}
                </p>
              )}
              {card.koreanData.cardDef && (
                <p>
                  <strong>수비력:</strong> {card.koreanData.cardDef}
                </p>
              )}
              <p style={{ whiteSpace: "pre-wrap", marginTop: "8px" }}>
                <strong>카드 텍스트:</strong> {card.koreanData.cardText}
              </p>
            </div>

            {/* 해외 시세 */}
            {card.card_prices?.[0] && (
              <div style={{ fontSize: "12px", color: "#555", textAlign: "left", margin: "10px 0" }}>
                <strong>해외 시세:</strong> 카드마켓 €{card.card_prices[0].cardmarket_price} / TCGplayer $
                {card.card_prices[0].tcgplayer_price} / eBay ${card.card_prices[0].ebay_price}
              </div>
            )}

            {/* 수록 팩 & 코드 */}
            <div
              style={{
                fontSize: "12px",
                color: "#666",
                textAlign: "left",
                margin: "10px 0",
                maxHeight: "240px",
                overflowY: "auto",
              }}
            >
              <strong>수록 팩 / 코드:</strong>
              {card.card_sets ? (
                <ul style={{ paddingLeft: "15px", margin: "5px 0" }}>
                  {card.card_sets.map((set, idx) => (
                    <li key={idx}>
                      {set.set_name} ({set.set_code}) - {set.set_rarity || "레어도 정보 없음"}
                    </li>
                  ))}
                </ul>
              ) : (
                <p style={{ margin: "5px 0" }}>수록 정보 없음</p>
              )}
            </div>

            {/* 국내 시세 바로가기 버튼 */}
            <div style={{ display: "flex", flexDirection: "column", gap: "5px", marginTop: "10px" }}>
              <a
                href={`https://smartstore.naver.com/main/search?q=${encodeURIComponent(card.name)}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "6px",
                  backgroundColor: "#03C75A",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                네이버 쇼핑 시세
              </a>
              <a
                href={`https://m.bunjang.co.kr/search/products?q=${encodeURIComponent(card.name)}`}
                target="_blank"
                rel="noreferrer"
                style={{
                  padding: "6px",
                  backgroundColor: "#FF5058",
                  color: "white",
                  textDecoration: "none",
                  borderRadius: "4px",
                  fontSize: "12px",
                }}
              >
                번개장터 실거래가
              </a>
            </div>
          </div>
        ))}
      </div>

      {selectedCard && (
        <section
          style={{
            marginTop: "24px",
            padding: "20px",
            border: "2px solid #333",
            borderRadius: "8px",
            textAlign: "left",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <h2>{selectedCard.koreanData.cardName} 상세 정보</h2>
            <button type="button" onClick={() => setSelectedCard(null)}>
              닫기
            </button>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "8px" }}>
            {selectedCard.card_images?.map((image) => (
              <img
                key={image.id}
                src={image.image_url_small}
                alt={`${selectedCard.name} 상세 이미지`}
                style={{ width: "100%", maxWidth: "220px" }}
              />
            ))}
          </div>
          <p>
            <strong>종류:</strong> {selectedCard.koreanData.cardOther}
          </p>
          <p>
            <strong>속성:</strong> {selectedCard.koreanData.cardAttr || "-"}
          </p>
          <p>
            <strong>레벨/랭크:</strong> {selectedCard.koreanData.cardLevel || "-"}
          </p>
          <p>
            <strong>공격력:</strong> {selectedCard.koreanData.cardAtk || "-"}
          </p>
          <p>
            <strong>수비력:</strong> {selectedCard.koreanData.cardDef || "-"}
          </p>
          <p style={{ whiteSpace: "pre-wrap" }}>
            <strong>카드 텍스트:</strong> {selectedCard.koreanData.cardText}
          </p>
          <h3>수록 팩과 레어도</h3>
          <ul>
            {selectedCard.card_sets?.map((set, index) => (
              <li key={`${set.set_code}-${index}`}>
                {set.set_name} ({set.set_code}) - {set.set_rarity}
              </li>
            ))}
          </ul>
          <h3>내 재고</h3>
          {!session ? (
            <p>재고를 관리하려면 Google 로그인이 필요합니다.</p>
          ) : (
            <div>
              <p>
                <strong>보유 수량:</strong> {inventory?.quantity || 0}
              </p>
              <p>
                <strong>매입가:</strong> {inventory?.purchase_price ?? "미등록"}
              </p>
              <label>
                상태
                <select value={condition} onChange={(event) => setCondition(event.target.value)}>
                  <option>미등록</option>
                  <option>새 카드</option>
                  <option>사용감 적음</option>
                  <option>사용감 있음</option>
                  <option>손상</option>
                </select>
              </label>
              <label style={{ marginLeft: "12px" }}>
                매입가
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={purchasePrice}
                  onChange={(event) => setPurchasePrice(event.target.value)}
                />
              </label>
              <div style={{ display: "flex", gap: "8px", marginTop: "12px" }}>
                <button
                  type="button"
                  onClick={() => saveInventory(-1)}
                  disabled={inventoryBusy || !inventory?.quantity}
                >
                  -1 재고 차감
                </button>
                <button type="button" onClick={() => saveInventory(1)} disabled={inventoryBusy}>
                  +1 재고 추가
                </button>
                <button type="button" onClick={() => saveInventory(0)} disabled={inventoryBusy}>
                  정보 저장
                </button>
              </div>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
