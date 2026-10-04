const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "nvidia/nemotron-3-nano-30b-a3b";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const translationCache = new Map();

const SEARCH_DICTIONARY = {
  yugioh: new Map([
    ["블랙", ["ブラック"]],
    ["블랙매지션", ["ブラック・マジシャン"]],
    ["푸른눈의백룡", ["青眼の白龍"]],
    ["붉은눈", ["真紅眼の黒竜"]],
    ["블랙매지션걸", ["ブラック・マジシャン・ガール"]],
    ["섬도희", ["閃刀姫"]],
  ]),
  pokemon: new Map([
    ["피카츄", ["ピカチュウ"]],
    ["빛나", ["ヒカリ"]],
    ["리자몽", ["リザードン"]],
    ["뮤츠", ["ミュウツー"]],
    ["이브이", ["イーブイ"]],
    ["따라큐", ["ミミッキュ"]],
    ["빛나", ["ヒカリ"]],
  ]),
  onepiece: new Map([
    ["루피", ["ルフィ"]],
    ["몽키d루피", ["モンキー・D・ルフィ", "ルフィ"]],
    ["우타", ["ウタ"]],
    ["나미", ["ナミ"]],
    ["조로", ["ゾロ", "ロロノア・ゾロ"]],
    ["상디", ["サンジ"]],
    ["에이스", ["エース"]],
  ]),
};

const normalizeQuery = (query) =>
  String(query || "")
    .replace(/[\s.・·_-]/g, "")
    .toLowerCase();

const normalizeJapaneseTerms = (value) => {
  let terms;
  try {
    const parsed = JSON.parse(
      String(value || "")
        .replace(/```(?:json)?|```/g, "")
        .trim(),
    );
    terms = Array.isArray(parsed) ? parsed : parsed.terms;
  } catch {
    terms = [
      String(value || "")
        .replace(/```(?:json)?|```/g, "")
        .trim(),
    ];
  }
  return [
    ...new Set(
      (Array.isArray(terms) ? terms : [])
        .map((term) =>
          String(term)
            .replace(/^\d+[.)、]\s*/, "")
            .trim()
            .slice(0, 80),
        )
        .filter((term) => term && /[\u3040-\u30ff\u3400-\u9fff]/.test(term)),
    ),
  ].slice(0, 3);
};

async function translateWithNvidia(query, game, gameLabel) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return [];
  const gameContext =
    game === "pokemon"
      ? 'For Pokemon, Korean "빛나" refers to the character Dawn; her official Japanese name is "ヒカリ", not the literal word for shining.'
      : game === "onepiece"
        ? "Resolve names as One Piece characters or cards, not literal dictionary translations."
        : "Resolve names as Yu-Gi-Oh! characters, monsters, archetypes, or official card names, not literal dictionary translations.";
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a Japanese official card-database entity resolver for ${gameLabel}. Identify the intended card or character from Korean game context; do not translate ambiguous names literally. ${gameContext} Return up to 3 Japanese official card-name search terms as JSON only: {"terms":["..."]}.`,
        },
        { role: "user", content: query },
      ],
      temperature: 0.1,
      max_tokens: 128,
      stream: false,
    }),
    signal: AbortSignal.timeout(2000),
  });
  if (!response.ok) return [];
  const body = await response.json();
  return normalizeJapaneseTerms(body.choices?.[0]?.message?.content);
}

async function translateWithGemini(query, game, gameLabel) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const prompt = [
    `Translate the Korean search term into Japanese names or search keywords used in the official ${gameLabel} card database.`,
    `Resolve it as a specific ${gameLabel} card or character name, not as a literal dictionary translation.`,
    ...(game === "pokemon" ? ['For example, Pokemon character "빛나" is officially named "ヒカリ" in Japanese.'] : []),
    "Return up to 3 short Japanese search queries ordered by confidence. Include common Japanese aliases when useful.",
    'Return only JSON in this shape: {"terms":["...", "..."]}. Do not add explanations.',
    `Korean search term: ${query}`,
  ].join("\n");
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: { terms: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["terms"],
        },
        temperature: 0.1,
        maxOutputTokens: 128,
      },
    }),
    signal: AbortSignal.timeout(2500),
  });
  if (!response.ok) return [];
  const body = await response.json();
  return normalizeJapaneseTerms(body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""));
}

export async function translateJapaneseSearchTerms(game, query) {
  const normalizedQuery = normalizeQuery(query).slice(0, 80);
  if (!normalizedQuery || !/[\uac00-\ud7a3]/.test(normalizedQuery)) return [];

  const dictionaryTerms = SEARCH_DICTIONARY[game]?.get(normalizedQuery);
  if (dictionaryTerms) return dictionaryTerms;

  const cacheKey = `${game}:${normalizedQuery}`;
  const cached = translationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.terms;

  const gameLabel =
    game === "pokemon" ? "포켓몬 카드 게임" : game === "onepiece" ? "원피스 카드 게임" : "유희왕 오피셜 카드 게임";
  try {
    const nvidiaTerms = await translateWithNvidia(String(query).trim().slice(0, 80), game, gameLabel).catch(() => []);
    const geminiTerms = nvidiaTerms.length
      ? []
      : await translateWithGemini(String(query).trim().slice(0, 80), game, gameLabel).catch(() => []);
    const terms = nvidiaTerms.length ? nvidiaTerms : geminiTerms;
    if (terms.length) translationCache.set(cacheKey, { terms, expiresAt: Date.now() + CACHE_TTL });
    return terms;
  } catch {
    return [];
  }
}
