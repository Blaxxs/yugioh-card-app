import { CircleDollarSign, CircleHelp, ExternalLink, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { getRarityCode, getRarityLabel } from "../lib/officialCardApi";

export default function CardDetail({
  card,
  session,
  inventory,
  isFavorite,
  onFavorite,
  onClose,
  inventoryTransactions = [],
  onCancelTransaction,
  onUpdateTransaction,
  onOpenRelease,
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const [copiedCode, setCopiedCode] = useState("");
  const [nameCopied, setNameCopied] = useState(false);
  const [isRarityGuideOpen, setIsRarityGuideOpen] = useState(false);
  const [priceSearch, setPriceSearch] = useState(null);
  const pendingImageIndex = useRef(null);
  const frameRequest = useRef(null);
  const pointerFrameRequest = useRef(null);
  const pointerPosition = useRef(null);
  const touchStart = useRef(null);
  const touchGesture = useRef("idle");
  const hasGmr = card.card_sets?.some((set) => set.rarity_code === "GMR");
  const gmrBaseImage = card.card_images?.[card.card_images.length - 1];
  const sourceImages = card.card_images || [];
  const detailImages =
    hasGmr && gmrBaseImage
      ? [...sourceImages, { ...gmrBaseImage, id: `${gmrBaseImage.id}-gmr`, isGmrComposite: true }]
      : sourceImages;
  const selectedImage = detailImages[selectedImageIndex] || detailImages[0];

  const handleMainImageMove = (event) => {
    if (event.pointerType === "touch" && touchStart.current) {
      const deltaX = event.clientX - touchStart.current.x;
      const deltaY = event.clientY - touchStart.current.y;
      if (touchGesture.current === "pending" && Math.max(Math.abs(deltaX), Math.abs(deltaY)) > 8) {
        touchGesture.current = Math.abs(deltaY) > Math.abs(deltaX) * 1.15 ? "scroll" : "tilt";
        if (touchGesture.current === "tilt") event.currentTarget.setPointerCapture(event.pointerId);
      }
      if (touchGesture.current === "scroll") return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    pointerPosition.current = {
      x: (event.clientX - rect.left) / rect.width,
      y: (event.clientY - rect.top) / rect.height,
      element: event.currentTarget,
    };
    if (pointerFrameRequest.current) return;
    pointerFrameRequest.current = requestAnimationFrame(() => {
      const position = pointerPosition.current;
      if (position) {
        position.element.style.setProperty("--tilt-x", `${(0.5 - position.y) * 20}deg`);
        position.element.style.setProperty("--tilt-y", `${(position.x - 0.5) * 28}deg`);
        position.element.style.setProperty("--pointer-x", `${position.x * 100}%`);
        position.element.style.setProperty("--pointer-y", `${position.y * 100}%`);
      }
      pointerFrameRequest.current = null;
    });
  };

  const handleMainImageDown = (event) => {
    if (event.pointerType === "touch") {
      touchStart.current = { x: event.clientX, y: event.clientY };
      touchGesture.current = "pending";
    }
  };

  const handleMainImageUp = (event) => {
    if (event.pointerType === "touch" && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    touchStart.current = null;
    touchGesture.current = "idle";
    resetMainImage(event);
  };

  const resetMainImage = (event) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
    event.currentTarget.style.setProperty("--pointer-x", "50%");
    event.currentTarget.style.setProperty("--pointer-y", "50%");
  };

  const selectImage = (index) => {
    if (index === selectedImageIndex) return;
    pendingImageIndex.current = index;
    if (frameRequest.current) cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      setSelectedImageIndex(pendingImageIndex.current);
      pendingImageIndex.current = null;
      frameRequest.current = null;
    });
  };

  useEffect(
    () => () => {
      if (frameRequest.current) cancelAnimationFrame(frameRequest.current);
      if (pointerFrameRequest.current) cancelAnimationFrame(pointerFrameRequest.current);
    },
    [],
  );

  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  const copyCode = async (code, rowKey) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCode(rowKey);
      window.setTimeout(() => setCopiedCode(""), 1400);
    } catch {
      setCopiedCode("");
    }
  };

  const copyCardName = async () => {
    try {
      await navigator.clipboard.writeText(card.koreanData.cardName);
      setNameCopied(true);
      window.setTimeout(() => setNameCopied(false), 1400);
    } catch {
      setNameCopied(false);
    }
  };

  const openPrice = (set) => {
    setPriceSearch({
      code: set.set_code,
      rarity: getRarityLabel(set.set_rarity || set.rarity_code),
      query: set.set_code,
    });
  };

  const priceSearchLinks = priceSearch
    ? [
        ["번개장터", `https://m.bunjang.co.kr/search/products?q=${encodeURIComponent(priceSearch.query)}`],
        ["카드모아", `http://cardmoa.com/shop/search.php?search_str=${encodeURIComponent(priceSearch.query)}`],
        ["카드디씨", `https://carddc.co.kr/product_list.html?search_word=${encodeURIComponent(priceSearch.query)}`],
        [
          "카드공구",
          `https://www.card09.com/search_result.php?search=total&searchstring=${encodeURIComponent(priceSearch.query)}`,
        ],
        [
          "티씨지샵",
          `http://www.tcgshop.co.kr/search_result.php?search=meta_str&searchstring=${encodeURIComponent(priceSearch.query)}`,
        ],
      ]
    : [];

  useEffect(() => {
    const preloadedImages = card.card_images?.map((image) => {
      const preload = new Image();
      preload.src = image.image_url_small;
      return preload;
    });
    return () =>
      preloadedImages?.forEach((image) => {
        image.src = "";
      });
  }, [card.card_images]);

  return (
    <section className="card-detail">
      <header>
        <div>
          <span className="eyebrow">CARD DETAIL</span>
          <h2
            className="card-name-copy"
            role="button"
            tabIndex="0"
            onClick={copyCardName}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") copyCardName();
            }}
            title="카드 이름 복사"
          >
            {nameCopied ? "복사됨" : card.koreanData.cardName}
          </h2>
        </div>
        <div className="detail-header-actions">
          <button
            className={`heart-button ${isFavorite ? "is-favorite" : ""}`}
            aria-label={isFavorite ? "찜 취소" : "찜하기"}
            onClick={() => onFavorite(card)}
          >
            {isFavorite ? "♥" : "♡"}
          </button>
          <button onClick={onClose}>닫기</button>
        </div>
      </header>
      <div className="detail-layout">
        <div className="detail-image-viewer">
          <div
            className="detail-main-image"
            onContextMenu={(event) => event.preventDefault()}
            onPointerDown={handleMainImageDown}
            onPointerMove={handleMainImageMove}
            onPointerUp={handleMainImageUp}
            onPointerCancel={handleMainImageUp}
            onPointerLeave={resetMainImage}
          >
            {selectedImage && (
              <div className={`detail-card-stage ${selectedImage.isGmrComposite ? "detail-card-stage-gmr" : ""}`}>
                {selectedImage.isGmrComposite && (
                  <>
                    <svg className="gmr-filter-defs" aria-hidden="true" focusable="false">
                      <defs>
                        <filter id="gmr-turbulence-filter" x="-20%" y="-20%" width="140%" height="140%">
                          <feTurbulence type="fractalNoise" baseFrequency="0.72" numOctaves="2" seed="17" />
                          <feColorMatrix type="saturate" values="0" />
                          <feComponentTransfer>
                            <feFuncA type="table" tableValues="0 0.16" />
                          </feComponentTransfer>
                        </filter>
                      </defs>
                    </svg>
                    <span className="gmr-noise-layer gmr-noise-layer-a" />
                    <span className="gmr-noise-layer gmr-noise-layer-b" />
                  </>
                )}
                <img
                  className="detail-card-art"
                  src={selectedImage.image_url_small}
                  alt={`${card.name} 대표 이미지`}
                  draggable="false"
                />
                {selectedImage.isGmrComposite && (
                  <img className="detail-card-frame" src="/gmr-frame.png" alt="" aria-hidden="true" />
                )}
              </div>
            )}
          </div>
          <div className="detail-thumbnails">
            {detailImages.map((image, index) => (
              <button
                type="button"
                key={image.id}
                className={selectedImageIndex === index ? "selected" : ""}
                onMouseEnter={() => selectImage(index)}
                onClick={(event) => {
                  event.preventDefault();
                  event.stopPropagation();
                  selectImage(index);
                }}
              >
                <img
                  decoding="async"
                  draggable="false"
                  src={image.image_url_small}
                  alt={
                    image.isGmrComposite
                      ? `${card.name} 그랜드마스터 레어 일러스트`
                      : `${card.name} 일러스트 ${index + 1}`
                  }
                />
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="detail-info">
            <p>
              <strong>종류</strong>
              {card.koreanData.cardOther || "-"}
            </p>
            <p>
              <strong>속성</strong>
              {card.koreanData.cardAttr || "-"}
            </p>
            <p>
              <strong>레벨/랭크</strong>
              {card.koreanData.cardLevel || "-"}
            </p>
            <p>
              <strong>공격력</strong>
              {card.koreanData.cardAtk || "-"}
            </p>
            <p>
              <strong>수비력</strong>
              {card.koreanData.cardDef || "-"}
            </p>
            <p className="card-text">
              <strong>카드 텍스트</strong>
              {card.koreanData.cardText || "-"}
            </p>
          </div>
          <div className="section-heading">
            <h3>수록 팩과 레어도</h3>
            <button className="rarity-guide-button" type="button" onClick={() => setIsRarityGuideOpen(true)}>
              <CircleHelp size={16} aria-hidden="true" />
              레어도 안내
            </button>
          </div>
          {isRarityGuideOpen && (
            <div className="rarity-guide-modal" role="dialog" aria-modal="true" aria-label="레어도 가이드">
              <button
                className="rarity-guide-backdrop"
                type="button"
                aria-label="레어도 가이드 닫기"
                onClick={() => setIsRarityGuideOpen(false)}
              />
              <section className="rarity-guide-sheet">
                <header>
                  <div>
                    <span>카드 정보</span>
                    <h3>레어도 가이드</h3>
                  </div>
                  <button type="button" aria-label="레어도 가이드 닫기" onClick={() => setIsRarityGuideOpen(false)}>
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>
                <div className="rarity-guide-grid">
                  {[
                    ["N", "노멀"],
                    ["P", "패러렐 노멀"],
                    ["R", "레어"],
                    ["SR", "슈퍼 레어"],
                    ["UR", "울트라 레어"],
                    ["P+UR", "패러렐 울트라 레어"],
                    ["SE", "시크릿 레어"],
                    ["HR", "홀로그래픽 레어"],
                    ["PG", "프리미엄 골드 레어"],
                    ["EXSE", "엑스트라 시크릿 레어"],
                    ["OFUR", "오버프레임 울트라 레어"],
                    ["PSE", "프리즈마틱 시크릿 레어"],
                    ["OFPSE", "오버프레임 프리즈마틱 시크릿 레어"],
                    ["QCSE", "쿼터 센추리 시크릿 레어"],
                    ["GMR", "그랜드마스터 레어"],
                  ].map(([code, name]) => (
                    <span key={code}>
                      <b className={`rarity-chip rarity-${code.toLowerCase().replace("+", "")}`}>{code}</b>
                      {name}
                    </span>
                  ))}
                </div>
              </section>
            </div>
          )}
          <div className="set-table-wrap">
            <table className="set-table">
              <thead>
                <tr>
                  <th>발매일</th>
                  <th>코드</th>
                  <th>수록 팩</th>
                  <th>레어도</th>
                </tr>
              </thead>
              <tbody>
                {card.card_sets?.map((set, index) => (
                  <tr key={`${set.set_code}-${index}`}>
                    <td>{set.set_date || "-"}</td>
                    <td>
                      <button
                        className="set-code"
                        type="button"
                        title="수록 코드 복사"
                        onClick={() => copyCode(set.set_code, `${set.set_code}-${index}`)}
                      >
                        {copiedCode === `${set.set_code}-${index}` ? "복사됨" : set.set_code}
                      </button>
                    </td>
                    <td>
                      <button className="set-pack-button" type="button" onClick={() => onOpenRelease(set.set_name)}>
                        {set.set_name}
                      </button>
                    </td>
                    <td>
                      <div className="set-rarity-actions">
                        <span
                          className="rarity-tooltip"
                          data-tooltip={getRarityLabel(set.set_rarity || set.rarity_code)}
                          aria-label={getRarityLabel(set.set_rarity || set.rarity_code)}
                        >
                          <span
                            className={`rarity-chip rarity-${getRarityCode(set.rarity_code || set.set_rarity)
                              .replace(/[^a-z0-9+]/gi, "")
                              .toLowerCase()}`}
                          >
                            {set.rarity_code || getRarityCode(set.set_rarity) || "-"}
                          </span>
                        </span>
                        <button
                          className="price-search-button"
                          type="button"
                          aria-label={`${set.set_code} ${getRarityLabel(set.set_rarity || set.rarity_code)} 가격 보기`}
                          title="판매처 가격 보기"
                          onClick={(event) => {
                            event.stopPropagation();
                            openPrice(set);
                          }}
                        >
                          <CircleDollarSign size={15} aria-hidden="true" />
                          가격
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {priceSearch && (
            <div className="price-search-modal" role="dialog" aria-modal="true" aria-label="판매처 가격 검색">
              <button
                className="price-search-backdrop"
                type="button"
                aria-label="가격 검색 닫기"
                onClick={() => setPriceSearch(null)}
              />
              <section className="price-search-sheet">
                <header>
                  <div>
                    <span>판매처 검색</span>
                    <h3>{priceSearch.code}</h3>
                    <p>{priceSearch.rarity}</p>
                  </div>
                  <button type="button" aria-label="가격 검색 닫기" onClick={() => setPriceSearch(null)}>
                    <X size={20} aria-hidden="true" />
                  </button>
                </header>
                <p className="price-search-query">판매처를 선택하면 수록 코드로 검색합니다.</p>
                <div className="price-search-links">
                  {priceSearchLinks.map(([shop, href]) => (
                    <a key={shop} href={href} target="_blank" rel="noreferrer">
                      {shop}
                      <ExternalLink size={17} aria-hidden="true" />
                    </a>
                  ))}
                </div>
              </section>
            </div>
          )}
        </div>
      </div>
      <h3>내 재고</h3>
      {!session ? (
        <p>재고를 관리하려면 로그인이 필요합니다.</p>
      ) : (
        <div className="inventory-editor">
          <p>
            <strong>보유 수량:</strong> {inventory?.quantity || 0}
          </p>
          <p>
            <strong>등록일:</strong>{" "}
            {inventory?.created_at ? new Date(inventory.created_at).toLocaleString("ko-KR") : "미등록"}
          </p>
          <h4>거래 이력</h4>
          <div className="transaction-list">
            {inventoryTransactions.length ? (
              inventoryTransactions.map((transaction) => (
                <div className="transaction-row" key={transaction.id}>
                  <span>
                    {transaction.type === "purchase" ? "매입" : "매출"} ·{" "}
                    {new Date(transaction.occurred_at).toLocaleString("ko-KR")} · {transaction.quantity}장
                  </span>
                  {transaction.canceled_at ? (
                    <em>취소됨</em>
                  ) : (
                    <span className="transaction-controls">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        defaultValue={transaction.unit_price ?? ""}
                        aria-label="거래 금액"
                        onBlur={(event) => onUpdateTransaction(transaction, event.target.value)}
                      />
                      <button onClick={() => onCancelTransaction(transaction)}>거래 취소</button>
                    </span>
                  )}
                </div>
              ))
            ) : (
              <p>거래 이력이 없습니다.</p>
            )}
          </div>
        </div>
      )}
    </section>
  );
}
