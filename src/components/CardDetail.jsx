import { useEffect } from "react";
import { CloseIcon } from "./icons";

const SPECS = [
  ["종류", (d) => d.cardOther],
  ["속성", (d) => d.cardAttr],
  ["레벨/랭크", (d) => d.cardLevel],
  ["공격력", (d) => d.cardAtk],
  ["수비력", (d) => d.cardDef],
];

export default function CardDetail({
  card,
  session,
  inventory,
  inventoryBusy,
  purchasePrice,
  condition,
  onPurchasePriceChange,
  onConditionChange,
  onSaveInventory,
  onClose,
}) {
  useEffect(() => {
    const handleKey = (event) => event.key === "Escape" && onClose();
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [onClose]);

  const { koreanData } = card;

  return (
    <div className="overlay" onClick={onClose} role="presentation">
      <div className="modal" role="dialog" aria-modal="true" aria-label={`${koreanData.cardName} 상세 정보`} onClick={(event) => event.stopPropagation()}>
        <div className="modal__head">
          <h2>{koreanData.cardName}</h2>
          <button type="button" className="modal__close" onClick={onClose} aria-label="닫기">
            <CloseIcon />
          </button>
        </div>

        <div className="modal__body">
          <div className="modal__images">
            {card.card_images?.map((image) => (
              <img key={image.id} src={image.image_url_small || "/placeholder.svg"} alt={`${card.name} 상세 이미지`} />
            ))}
          </div>

          <div className="spec">
            {SPECS.map(([label, getValue]) => (
              <div className="spec__item" key={label}>
                <p className="spec__label">{label}</p>
                <p className="spec__value">{getValue(koreanData) || "-"}</p>
              </div>
            ))}
          </div>

          {koreanData.cardText && (
            <>
              <p className="modal__section-title">카드 텍스트</p>
              <p className="modal__text">{koreanData.cardText}</p>
            </>
          )}

          {card.card_sets?.length > 0 && (
            <>
              <p className="modal__section-title">수록 팩과 레어도</p>
              <ul className="setlist">
                {card.card_sets.map((set, index) => (
                  <li key={`${set.set_code}-${index}`}>
                    {set.set_name} <code>{set.set_code}</code> · {set.set_rarity}
                  </li>
                ))}
              </ul>
            </>
          )}

          <p className="modal__section-title">내 재고</p>
          {!session ? (
            <p className="inv__login">재고를 관리하려면 Google 로그인이 필요합니다.</p>
          ) : (
            <div className="inv">
              <div className="inv__summary">
                <div>
                  <p className="inv__stat-label">보유 수량</p>
                  <p className="inv__stat-value">{inventory?.quantity || 0}</p>
                </div>
                <div>
                  <p className="inv__stat-label">매입가</p>
                  <p className="inv__stat-value">{inventory?.purchase_price ?? "-"}</p>
                </div>
              </div>

              <div className="inv__fields">
                <div className="field">
                  <label htmlFor="inv-condition">상태</label>
                  <select id="inv-condition" value={condition} onChange={(event) => onConditionChange(event.target.value)}>
                    <option>미등록</option>
                    <option>새 카드</option>
                    <option>사용감 적음</option>
                    <option>사용감 있음</option>
                    <option>손상</option>
                  </select>
                </div>
                <div className="field">
                  <label htmlFor="inv-price">매입가</label>
                  <input
                    id="inv-price"
                    type="number"
                    min="0"
                    step="0.01"
                    value={purchasePrice}
                    onChange={(event) => onPurchasePriceChange(event.target.value)}
                    placeholder="0"
                  />
                </div>
              </div>

              <div className="inv__actions">
                <button type="button" className="btn" onClick={() => onSaveInventory(-1)} disabled={inventoryBusy || !inventory?.quantity}>
                  -1 차감
                </button>
                <button type="button" className="btn" onClick={() => onSaveInventory(1)} disabled={inventoryBusy}>
                  +1 추가
                </button>
                <button type="button" className="btn btn--gold" onClick={() => onSaveInventory(0)} disabled={inventoryBusy}>
                  정보 저장
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
