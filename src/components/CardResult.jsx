export default function CardResult({ card, isFavorite, onFavorite, onOpen }) {
  return (
    <article className="card-result" onClick={() => onOpen(card)}>
      <button className={`heart-button ${isFavorite ? "is-favorite" : ""}`} aria-label={isFavorite ? "찜 취소" : "찜하기"} onClick={(event) => { event.stopPropagation(); onFavorite(card); }}>
        {isFavorite ? "♥" : "♡"}
      </button>
      <div className="card-images">{card.card_images?.map((image) => <img key={image.id} src={image.image_url_small} alt={`${card.name} 일러스트`} />)}</div>
      <h3>{card.koreanData.cardName}</h3>
      <div className="card-summary">
        <p><strong>종류:</strong> {card.koreanData.cardOther || "-"}</p>
        <p><strong>속성:</strong> {card.koreanData.cardAttr || "-"}</p>
        <p><strong>레벨/랭크:</strong> {card.koreanData.cardLevel || "-"}</p>
        <p><strong>공격력:</strong> {card.koreanData.cardAtk || "-"}</p>
        <p><strong>수비력:</strong> {card.koreanData.cardDef || "-"}</p>
        <p><strong>카드 텍스트:</strong> {card.koreanData.cardText || "-"}</p>
      </div>
    </article>
  );
}
