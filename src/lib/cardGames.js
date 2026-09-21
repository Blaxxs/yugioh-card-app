export const DEFAULT_GAME_ID = "yugioh";

export const CARD_GAMES = [
  { id: "yugioh", label: "유희왕", cardBack: "/card-backs/yugioh_card_back.png" },
  { id: "pokemon", label: "포켓몬", cardBack: "/card-backs/pokemon_card_back.png" },
  { id: "onepiece", label: "원피스", cardBack: "/card-backs/one_piece_card_back.png" },
];

// Yu-Gi-Oh uses Korean TCG terminology; other games use their own official field names.
export const GAME_FIELD_LABELS = {
  yugioh: { other: "종류", attr: "속성", level: "레벨/랭크", atk: "공격력", def: "수비력" },
  pokemon: { other: "분류", attr: "타입", level: "단계", atk: "HP", def: "약점" },
  onepiece: { other: "카드 종류", attr: "색상", level: "코스트", atk: "파워", def: "카운터" },
};

export const getGameById = (gameId) => CARD_GAMES.find((game) => game.id === gameId) || CARD_GAMES[0];

export const getGameFieldLabels = (gameId) => GAME_FIELD_LABELS[gameId] || GAME_FIELD_LABELS[DEFAULT_GAME_ID];
