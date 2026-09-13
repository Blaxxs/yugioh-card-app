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
}) {
  return (
    <section className="card-detail">
      <header>
        <h2>{card.koreanData.cardName} 상세 정보</h2>
        <button onClick={onClose}>닫기</button>
      </header>
      <div className="detail-images">
        {card.card_images?.map((image) => (
          <img key={image.id} src={image.image_url_small} alt={`${card.name} 상세 이미지`} />
        ))}
      </div>
      <div className="detail-info">
        <p>
          <strong>종류:</strong> {card.koreanData.cardOther || "-"}
        </p>
        <p>
          <strong>속성:</strong> {card.koreanData.cardAttr || "-"}
        </p>
        <p>
          <strong>레벨/랭크:</strong> {card.koreanData.cardLevel || "-"}
        </p>
        <p>
          <strong>공격력:</strong> {card.koreanData.cardAtk || "-"}
        </p>
        <p>
          <strong>수비력:</strong> {card.koreanData.cardDef || "-"}
        </p>
        <p>
          <strong>카드 텍스트:</strong> {card.koreanData.cardText || "-"}
        </p>
      </div>
      <h3>수록 팩과 레어도</h3>
      <ul>
        {card.card_sets?.map((set, index) => (
          <li key={`${set.set_code}-${index}`}>
            {set.set_name} ({set.set_code}) - {set.set_rarity} [{set.rarity_code}]
            <small className="price-query">네이버 검색어: {set.price_queries?.join(" / ") || set.price_query}</small>
          </li>
        ))}
      </ul>
      <h3>내 재고</h3>
      {!session ? (
        <p>재고를 관리하려면 로그인이 필요합니다.</p>
      ) : (
        <div className="inventory-editor">
          <p>
            <strong>보유 수량:</strong> {inventory?.quantity || 0}
          </p>
          <label>
            상태
            <select value={condition} onChange={(event) => onConditionChange(event.target.value)}>
              <option>미등록</option>
              <option>새 카드</option>
              <option>사용감 적음</option>
              <option>사용감 있음</option>
              <option>손상</option>
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
