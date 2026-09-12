import { HeartIcon, ChevronIcon } from "./icons";

export default function CardResult({ card, isFavorite, canFavorite, onToggleFavorite, onSelect }) {
  const { koreanData } = card;

  return (
    <article className="card" onClick={() => onSelect(card)}>
      <button
        type="button"
        className={`card__fav${isFavorite ? " card__fav--on" : ""}`}
        aria-label={isFavorite ? "찜 취소" : "찜하기"}
        disabled={!canFavorite}
        onClick={(event) => {
          event.stopPropagation();
          onToggleFavorite(card);
        }}
      >
        <HeartIcon filled={isFavorite} />
      </button>

      <div className="card__images">
        {card.card_images?.map((image) => (
          <img key={image.id} src={image.image_url_small || "/placeholder.svg"} alt={`${card.name} 일러스트`} />
        ))}
      </div>

      <h3 className="card__name">{koreanData.cardName}</h3>

      <div className="chips">
        {(koreanData.cardOther || card.type) && <span className="chip">{koreanData.cardOther || card.type}</span>}
        {koreanData.cardAttr && <span className="chip chip--gold">{koreanData.cardAttr}</span>}
        {koreanData.cardLevel && <span className="chip">Lv/Rk {koreanData.cardLevel}</span>}
        {koreanData.cardAtk && <span className="chip chip--atk">{koreanData.cardAtk}</span>}
        {koreanData.cardDef && <span className="chip chip--def">{koreanData.cardDef}</span>}
      </div>

      {koreanData.cardText && <p className="card__text">{koreanData.cardText}</p>}

      {card.card_sets?.length > 0 && (
        <details className="card__sets" onClick={(event) => event.stopPropagation()}>
          <summary>
            <ChevronIcon />
            수록 팩 / 코드 ({card.card_sets.length})
          </summary>
          <ul className="setlist">
            {card.card_sets.map((set, index) => (
              <li key={`${set.set_code}-${index}`}>
                {set.set_name} <code>{set.set_code}</code> · {set.set_rarity || "레어도 정보 없음"}
              </li>
            ))}
          </ul>
        </details>
      )}

      <div className="price-links">
        <a
          className="price-link price-link--naver"
          href={`https://smartstore.naver.com/main/search?q=${encodeURIComponent(card.name)}`}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          네이버 쇼핑
        </a>
        <a
          className="price-link price-link--bunjang"
          href={`https://m.bunjang.co.kr/search/products?q=${encodeURIComponent(card.name)}`}
          target="_blank"
          rel="noreferrer"
          onClick={(event) => event.stopPropagation()}
        >
          번개장터
        </a>
      </div>
    </article>
  );
}
