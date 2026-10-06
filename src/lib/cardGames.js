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

export const POKEMON_RARITY_LABELS = {
  N: "노멀",
  C: "커먼",
  U: "언커먼",
  R: "레어",
  RR: "더블 레어",
  RRR: "트리플 레어",
  SR: "슈퍼 레어",
  SSR: "색이 다른 슈퍼 레어",
  UR: "울트라 레어",
  HR: "하이퍼 레어",
  AR: "아트 레어",
  SAR: "스페셜 아트 레어",
  S: "색이 다른 포켓몬",
  K: "찬란한 포켓몬",
  ACE: "ACE SPEC",
  MA: "메가 어택 레어",
  MUR: "메가 울트라 레어",
  BWR: "블랙 화이트 레어",
  CHR: "캐릭터 레어",
  CSR: "캐릭터 슈퍼 레어",
  PROMO: "프로모",
};
export const POKEMON_RARITY_CODES = Object.keys(POKEMON_RARITY_LABELS);
export const getPokemonRarityLabel = (value) =>
  POKEMON_RARITY_LABELS[
    String(value || "")
      .trim()
      .toUpperCase()
  ] ||
  value ||
  "레어도 미확인";
