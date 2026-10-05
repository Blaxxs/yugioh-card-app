const MODEL = process.env.GEMINI_MODEL || "gemini-3.5-flash-lite";
const NVIDIA_MODEL = process.env.NVIDIA_NIM_MODEL || "google/gemma-3-12b-it";
const CACHE_TTL = 24 * 60 * 60 * 1000;
const translationCache = new Map();
let warnedInvalidNvidiaKey = false;

const SEARCH_DICTIONARY = {
  yugioh: new Map([
    ["블랙", ["ブラック"]],
    ["블랙매지션", ["ブラック・マジシャン"]],
    ["푸른눈의백룡", ["青眼の白龍"]],
    ["붉은눈", ["真紅眼の黒竜"]],
    ["블랙매지션걸", ["ブラック・マジシャン・ガール"]],
    ["섬도희", ["閃刀姫"]],
    ["스톰", ["ストーム"]],
  ]),
  pokemon: new Map([
    ["피카츄", ["ピカチュウ"]],
    ["빛나", ["ヒカリ"]],
    ["리자몽", ["リザードン"]],
    ["뮤츠", ["ミュウツー"]],
    ["이브이", ["イーブイ"]],
    ["따라큐", ["ミミッキュ"]],
    ["스톰", ["ストーム"]],
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
    ["스톰", ["ストーム"]],
  ]),
};

const RELEASE_SEARCH_DICTIONARY = {
  yugioh: new Map([["스톰", ["ストーム"]]]),
  pokemon: new Map([["스톰", ["ストーム"]]]),
  onepiece: new Map([["스톰", ["ストーム"]]]),
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

const normalizeKoreanNames = (value, count) => {
  let names;
  try {
    const parsed = JSON.parse(
      String(value || "")
        .replace(/```(?:json)?|```/g, "")
        .trim(),
    );
    names = Array.isArray(parsed) ? parsed : parsed.names;
  } catch {
    names = count === 1 ? [String(value || "").trim()] : [];
  }
  return Array.from({ length: count }, (_unused, index) => {
    const name = String(names?.[index] || "")
      .replace(/^\d+[.)、]\s*/, "")
      .trim()
      .slice(0, 100);
    return /[\uac00-\ud7a3]/.test(name) ? name : "";
  });
};

async function translateWithNvidia(query, game, gameLabel, target) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey) return [];
  if (!apiKey.startsWith("nvapi-")) {
    if (!warnedInvalidNvidiaKey) {
      console.warn("NVIDIA_API_KEY is not an NVIDIA NIM API key; skipping NVIDIA translation.");
      warnedInvalidNvidiaKey = true;
    }
    return [];
  }
  const gameContext =
    game === "pokemon"
      ? 'For Pokemon, Korean "빛나" refers to the character Dawn; her official Japanese name is "ヒカリ", not the literal word for shining.'
      : game === "onepiece"
        ? "Resolve names as One Piece characters or cards, not literal dictionary translations."
        : "Resolve names as Yu-Gi-Oh! characters, monsters, archetypes, or official card names, not literal dictionary translations.";
  const targetContext =
    target === "release"
      ? `Identify the official Japanese names of ${gameLabel} products, booster packs, expansions, and releases.`
      : `Identify official Japanese card names or character names for ${gameLabel}.`;
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: "system",
          content: `You are a Japanese official ${gameLabel} database search assistant. ${targetContext} Resolve the intended entity from Korean game context; do not translate ambiguous names literally. ${gameContext} Return up to 3 Japanese search terms as JSON only: {"terms":["..."]}.`,
        },
        { role: "user", content: query },
      ],
      temperature: 0.1,
      max_tokens: 128,
      stream: false,
    }),
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) {
    console.warn(`NVIDIA NIM translation request failed (${response.status}).`);
    return [];
  }
  const body = await response.json();
  return normalizeJapaneseTerms(body.choices?.[0]?.message?.content);
}

async function translateWithGemini(query, game, gameLabel, target) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const prompt = [
    target === "release"
      ? `Resolve the Korean search term to Japanese names used for official ${gameLabel} products, booster packs, expansions, or releases.`
      : `Translate the Korean search term into Japanese names or search keywords used in the official ${gameLabel} card database.`,
    target === "release"
      ? "Identify the intended official product or release; do not translate the words literally."
      : `Resolve it as a specific ${gameLabel} card or character name, not as a literal dictionary translation.`,
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
  if (!response.ok) {
    console.warn(`Gemini translation request failed (${response.status}).`);
    return [];
  }
  const body = await response.json();
  return normalizeJapaneseTerms(body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""));
}

async function translateDisplayNamesWithNvidia(names, game, gameLabel, target) {
  const apiKey = process.env.NVIDIA_API_KEY;
  if (!apiKey?.startsWith("nvapi-")) return [];
  const itemType = target === "release" ? "products, booster packs, and releases" : "cards and characters";
  const response = await fetch("https://integrate.api.nvidia.com/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model: NVIDIA_MODEL,
      messages: [
        {
          role: "system",
          content: `Translate Japanese official ${gameLabel} ${itemType} into Korean. For each item, use its established official Korean release name if one exists; otherwise provide a concise natural Korean name. Preserve item order and return one Korean name for every input. Return JSON only as {"names":["..."]}.`,
        },
        { role: "user", content: JSON.stringify(names) },
      ],
      temperature: 0.1,
      max_tokens: Math.min(1024, names.length * 48),
      stream: false,
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    console.warn(`NVIDIA NIM display-name translation failed (${response.status}).`);
    return [];
  }
  const body = await response.json();
  return normalizeKoreanNames(body.choices?.[0]?.message?.content, names.length);
}

async function translateDisplayNamesWithGemini(names, game, gameLabel, target) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return [];
  const itemType = target === "release" ? "products, booster packs, and releases" : "cards and characters";
  const prompt = [
    `Translate Japanese official ${gameLabel} ${itemType} into Korean.`,
    "Use the established official Korean localized name when it is known; otherwise provide a concise, natural Korean rendering.",
    "Return exactly one Korean name for each input, in the same order. Preserve card codes and do not add explanations.",
    `Japanese names: ${JSON.stringify(names)}`,
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
          properties: { names: { type: "ARRAY", items: { type: "STRING" } } },
          required: ["names"],
        },
        temperature: 0.1,
        maxOutputTokens: Math.min(1024, names.length * 48),
      },
    }),
    signal: AbortSignal.timeout(8000),
  });
  if (!response.ok) {
    console.warn(`Gemini display-name translation failed (${response.status}).`);
    return [];
  }
  const body = await response.json();
  return normalizeKoreanNames(
    body.candidates?.[0]?.content?.parts?.map((part) => part.text || "").join(""),
    names.length,
  );
}

export async function translateJapaneseDisplayNames(game, sourceNames, target = "card") {
  const names = sourceNames.map((name) => String(name || "").trim());
  const results = new Array(names.length).fill("");
  const missing = [];
  names.forEach((name, index) => {
    const cacheKey = `display:${target}:${game}:${normalizeQuery(name)}`;
    const cached = translationCache.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) results[index] = cached.terms[0];
    else if (name) missing.push({ index, name, cacheKey });
  });
  if (!missing.length) return results;

  const gameLabel =
    game === "pokemon" ? "포켓몬 카드 게임" : game === "onepiece" ? "원피스 카드 게임" : "유희왕 오피셜 카드 게임";
  const chunks = [];
  for (let index = 0; index < missing.length; index += 24) chunks.push(missing.slice(index, index + 24));
  await mapChunksWithConcurrency(chunks, 2, async (chunk) => {
    const chunkNames = chunk.map((item) => item.name);
    const nvidiaNames = await translateDisplayNamesWithNvidia(chunkNames, game, gameLabel, target).catch(() => []);
    const localized = Array.from({ length: chunk.length }, (_unused, index) => nvidiaNames[index] || "");
    const missingIndexes = localized.flatMap((name, index) => (name ? [] : [index]));
    if (missingIndexes.length) {
      const fallback = await translateDisplayNamesWithGemini(
        missingIndexes.map((index) => chunkNames[index]),
        game,
        gameLabel,
        target,
      ).catch(() => []);
      missingIndexes.forEach((index, fallbackIndex) => {
        localized[index] = fallback[fallbackIndex] || "";
      });
    }
    chunk.forEach(({ index, cacheKey }, chunkIndex) => {
      const name = localized[chunkIndex];
      if (!name) return;
      results[index] = name;
      translationCache.set(cacheKey, { terms: [name], expiresAt: Date.now() + CACHE_TTL });
    });
  });
  return results;
}

async function mapChunksWithConcurrency(chunks, concurrency, mapChunk) {
  let nextIndex = 0;
  const worker = async () => {
    while (nextIndex < chunks.length) {
      const index = nextIndex++;
      await mapChunk(chunks[index]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(concurrency, chunks.length) }, worker));
}

async function translateJapaneseTerms(game, query, target) {
  const normalizedQuery = normalizeQuery(query).slice(0, 80);
  if (!normalizedQuery || !/[\uac00-\ud7a3]/.test(normalizedQuery)) return [];

  const dictionaryTerms =
    target === "card"
      ? SEARCH_DICTIONARY[game]?.get(normalizedQuery)
      : target === "release"
        ? RELEASE_SEARCH_DICTIONARY[game]?.get(normalizedQuery)
        : null;
  if (dictionaryTerms) return dictionaryTerms;

  const cacheKey = `${target}:${game}:${normalizedQuery}`;
  const cached = translationCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.terms;

  const gameLabel =
    game === "pokemon" ? "포켓몬 카드 게임" : game === "onepiece" ? "원피스 카드 게임" : "유희왕 오피셜 카드 게임";
  try {
    const nvidiaTerms = await translateWithNvidia(String(query).trim().slice(0, 80), game, gameLabel, target).catch(
      () => {
        console.warn("NVIDIA NIM translation request could not be completed.");
        return [];
      },
    );
    const geminiTerms = nvidiaTerms.length
      ? []
      : await translateWithGemini(String(query).trim().slice(0, 80), game, gameLabel, target).catch(() => {
          console.warn("Gemini translation request could not be completed.");
          return [];
        });
    const terms = nvidiaTerms.length ? nvidiaTerms : geminiTerms;
    if (terms.length) translationCache.set(cacheKey, { terms, expiresAt: Date.now() + CACHE_TTL });
    return terms;
  } catch {
    return [];
  }
}

export const translateJapaneseSearchTerms = (game, query) => translateJapaneseTerms(game, query, "card");

export const translateJapaneseReleaseTerms = (game, query) => translateJapaneseTerms(game, query, "release");
