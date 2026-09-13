import { useEffect, useRef, useState } from "react";

export default function CardDetail({ 
  card,
  session,
  inventory,
  condition,
  purchasePrice,
  inventoryBusy,
  onClose,
  onConditionChange,
  onPurchasePriceChange,
  onInventory,
  inventoryTransactions = [],
  onCancelTransaction,
}) {
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const pendingImageIndex = useRef(null);
  const frameRequest = useRef(null);
  const selectedImage = card.card_images?.[selectedImageIndex] || card.card_images?.[0];

  const handleMainImageMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = (event.clientX - rect.left) / rect.width;
    const y = (event.clientY - rect.top) / rect.height;
    event.currentTarget.style.setProperty("--tilt-x", `${(0.5 - y) * 10}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(x - 0.5) * 14}deg`);
    event.currentTarget.style.setProperty("--pointer-x", `${x * 100}%`);
    event.currentTarget.style.setProperty("--pointer-y", `${y * 100}%`);
  };

  const resetMainImage = (event) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  };

  const selectImage = (index) => {
    pendingImageIndex.current = index;
    if (frameRequest.current) cancelAnimationFrame(frameRequest.current);
    frameRequest.current = requestAnimationFrame(() => {
      setSelectedImageIndex(pendingImageIndex.current);
      pendingImageIndex.current = null;
      frameRequest.current = null;
    });
  };

  useEffect(() => {
    card.card_images?.forEach((image) => {
      const preload = new Image();
      preload.src = image.image_url_small;
    });
  }, [card.card_images]);

  return (
    <section className="card-detail">
      <header>
        <div>
          <span className="eyebrow">CARD DETAIL</span>
          <h2>{card.koreanData.cardName}</h2>
        </div>
        <button onClick={onClose}>닫기</button>
      </header>
      <div className="detail-layout">
        <div className="detail-image-viewer">
          <div className="detail-main-image" onPointerMove={handleMainImageMove} onPointerLeave={resetMainImage}>
            {selectedImage && <img src={selectedImage.image_url_small} alt={`${card.name} 대표 이미지`} />}
          </div>
          <div className="detail-thumbnails">
            {card.card_images?.map((image, index) => (
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
                  alt={`${card.name} 일러스트 ${index + 1}`}
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
          <h3>수록 팩과 레어도</h3>
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
                    <td className="set-code">{set.set_code}</td>
                    <td>{set.set_name}</td>
                    <td>
                      <span
                        className={`rarity-chip rarity-${(set.rarity_code || "").replace(/[^a-z0-9+]/gi, "").toLowerCase()}`}
                      >
                        {set.rarity_code || set.set_rarity}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="rarity-guide"><summary>레어도 안내</summary><div className="rarity-guide-grid">{[["N","노멀"],["P","패러렐 노멀"],["R","레어"],["SR","슈퍼 레어"],["UR","울트라 레어"],["SE","시크릿 레어"],["HR","홀로그래픽 레어"],["PG","프리미엄 골드 레어"],["P+UR","패러렐 울트라 레어"],["QCSE","쿼터 센추리 시크릿 레어"],["PSE","프리즈마틱 시크릿 레어"],["EXSE","엑스트라 시크릿 레어"]].map(([code, name]) => <span key={code}><b className={`rarity-chip rarity-${code.toLowerCase().replace("+", "")}`}>{code}</b>{name}</span>)}</div></details>
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
          <label>
              상태<select value={condition} onChange={(event) => onConditionChange(event.target.value)}>
                <option>미등록</option>
                <option>S급 - 신품급</option>
                <option>S-급 - 미품급</option>
                <option>A급 - 상태 좋음</option>
                <option>A-급 - 상태 보통</option>
                <option>B급 - 상태 나쁨</option>
              </select>
          </label>
          <label>
            매입가
            <input
              type="number"
              min="0"
              step="0.01"
              value={purchasePrice}
              onChange={(event) => onPurchasePriceChange(event.target.value)}
            />
          </label>
            <p><strong>등록일:</strong> {inventory?.created_at ? new Date(inventory.created_at).toLocaleString("ko-KR") : "미등록"}</p>
            <h4>거래 이력</h4>
            <div className="transaction-list">
              {inventoryTransactions.length ? inventoryTransactions.map((transaction) => (
                <div className="transaction-row" key={transaction.id}>
                  <span>{transaction.type === "purchase" ? "매입" : "매출"} · {new Date(transaction.occurred_at).toLocaleString("ko-KR")} · {transaction.quantity}장 · {transaction.unit_price ?? "-"}원</span>
                  {transaction.canceled_at ? <em>취소됨</em> : <button onClick={() => onCancelTransaction(transaction)}>거래 취소</button>}
                </div>
              )) : <p>거래 이력이 없습니다.</p>}
            </div>
          <div>
            <button onClick={() => onInventory(-1)} disabled={inventoryBusy || !inventory?.quantity}>
              -1 재고 차감
            </button>
            <button onClick={() => onInventory(1)} disabled={inventoryBusy}>
              +1 재고 추가
            </button>
            <button onClick={() => onInventory(0)} disabled={inventoryBusy}>
              정보 저장
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
