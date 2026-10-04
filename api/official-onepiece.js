const OFFICIAL_SITE_ORIGIN = "https://www.onepiece-cardgame.com";
const CARD_IMAGE_PATH = /^\/images\/cardlist\/card\/[\w.-]+\.png$/i;

export default async function handler(request, response) {
  const requestUrl = new URL(request.url, `https://${request.headers.host}`);
  const path = `/${(requestUrl.searchParams.get("path") || "").replace(/^\/+/, "")}`;
  if (!CARD_IMAGE_PATH.test(path)) return response.status(404).end();

  const target = new URL(path, OFFICIAL_SITE_ORIGIN);
  for (const [key, value] of requestUrl.searchParams) {
    if (key !== "path") target.searchParams.append(key, value);
  }

  try {
    const upstream = await fetch(target, {
      headers: {
        Accept: request.headers.accept || "image/png,image/*,*/*;q=0.8",
        "Accept-Language": "ja-JP,ja;q=0.9",
        Referer: `${OFFICIAL_SITE_ORIGIN}/cardlist/`,
        "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
      },
    });
    response.status(upstream.status);
    response.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
    response.setHeader("Content-Type", upstream.headers.get("content-type") || "image/png");
    return response.send(Buffer.from(await upstream.arrayBuffer()));
  } catch {
    return response.status(502).json({ error: "일본 원피스 카드 이미지 요청에 실패했습니다." });
  }
}
