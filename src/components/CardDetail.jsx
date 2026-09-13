import { useState } from "react";

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
  const [selectedImageIndex, setSelectedImageIndex] = useState(0);
  const selectedImage = card.card_images?.[selectedImageIndex] || card.card_images?.[0];

  return (
    <section className="card-detail">
      <header>
        <div>
          <span className="eyebrow">CARD DETAIL</span>
          <h2>{card.koreanData.cardName}</h2>
        </div>
        <button onClick={onClose}>목록으로</button>
      </header>
      <div className="detail-layout">
        <div className="detail-image-viewer">
          <div className="detail-main-image">
            {selectedImage && <img src={selectedImage.image_url_small} alt={`${card.name} 대표 이미지`} />}
          </div>
          <div className="detail-thumbnails">
            {card.card_images?.map((image, index) => (
              <button
                key={image.id}
                className={selectedImageIndex === index ? "selected" : ""}
                onClick={() => setSelectedImageIndex(index)}
              >
                <img src={image.image_url_small} alt={`${card.name} 일러스트 ${index + 1}`} />
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
