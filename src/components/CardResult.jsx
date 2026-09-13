import { useRef, useState } from "react";

export default function CardResult({ card, isFavorite, onFavorite, onOpen, viewMode, showFavorite = true }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [slideDirection, setSlideDirection] = useState("next");
  const [nameCopied, setNameCopied] = useState(false);
  const pointerStart = useRef(null);
  const images = card.card_images || [];

  const changeImage = (direction) => {
    if (images.length < 2) return;
    setSlideDirection(direction);
    setImageIndex((current) => (current + (direction === "next" ? 1 : -1) + images.length) % images.length);
  };

  const handlePointerDown = (event) => {
    pointerStart.current = event.clientX;
  };

  const handlePointerUp = (event) => {
    if (pointerStart.current === null) return;
    const distance = event.clientX - pointerStart.current;
    pointerStart.current = null;
    if (Math.abs(distance) > 35) {
      event.stopPropagation();
      changeImage(distance < 0 ? "next" : "previous");
    }
  };

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const pointerX = (event.clientX - rect.left) / rect.width;
    const pointerY = (event.clientY - rect.top) / rect.height;
    event.currentTarget.style.setProperty("--pointer-x", `${pointerX * 100}%`);
    event.currentTarget.style.setProperty("--pointer-y", `${pointerY * 100}%`);
    event.currentTarget.style.setProperty("--tilt-x", `${(0.5 - pointerY) * 12}deg`);
    event.currentTarget.style.setProperty("--tilt-y", `${(pointerX - 0.5) * 16}deg`);
  };

  const resetPointer = (event) => {
    event.currentTarget.style.setProperty("--tilt-x", "0deg");
    event.currentTarget.style.setProperty("--tilt-y", "0deg");
  };

  const copyCardName = async (event) => {
    event.stopPropagation();
    try {
      await navigator.clipboard.writeText(card.koreanData.cardName);
      setNameCopied(true);
      window.setTimeout(() => setNameCopied(false), 1400);
    } catch {
      setNameCopied(false);
    }
  };

  return (
    <article className={`card-result card-result-${viewMode}`} onClick={() => onOpen(card)}>
      {showFavorite && (
        <div className="card-actions">
          <button
            className={`heart-button ${isFavorite ? "is-favorite" : ""}`}
            aria-label={isFavorite ? "찜 취소" : "찜하기"}
            onClick={(event) => {
              event.stopPropagation();
              onFavorite(card);
            }}
          >
            {isFavorite ? "♥" : "♡"}
          </button>
        </div>
      )}
      <div
        className="card-carousel"
        onPointerDown={handlePointerDown}
        onPointerUp={handlePointerUp}
        onPointerMove={handlePointerMove}
        onPointerLeave={resetPointer}
      >
        {images.length > 1 && (
          <button
            type="button"
            className="carousel-arrow previous"
            aria-label="이전 일러스트"
            onClick={(event) => {
              event.stopPropagation();
              changeImage("previous");
            }}
          >
            ‹
          </button>
        )}
        {images[imageIndex] && (
          <img
            key={images[imageIndex].id}
            className={`carousel-image slide-${slideDirection}`}
            src={images[imageIndex].image_url_small}
            alt={`${card.name} 일러스트 ${imageIndex + 1}`}
            draggable="false"
          />
        )}
        {images.length > 1 && (
          <button
            type="button"
            className="carousel-arrow next"
            aria-label="다음 일러스트"
            onClick={(event) => {
              event.stopPropagation();
              changeImage("next");
            }}
          >
            ›
          </button>
        )}
        {images.length > 1 && (
          <span className="carousel-counter">
            {imageIndex + 1} / {images.length}
          </span>
        )}
      </div>
      <h3
        className="card-name-copy"
        role="button"
        tabIndex="0"
        onClick={copyCardName}
        onKeyDown={(event) => {
          if (event.key === "Enter" || event.key === " ") copyCardName(event);
        }}
        title="카드 이름 복사"
      >
        {nameCopied ? "복사됨" : card.koreanData.cardName}
      </h3>
      <div className="card-summary">
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
    </article>
  );
}
