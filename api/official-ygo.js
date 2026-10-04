const OFFICIAL_SITE_ORIGIN = "https://www.db.yugioh-card.com";

export default async function handler(request, response) {
  const requestUrl = new URL(request.url, `https://${request.headers.host}`);
  const path = requestUrl.searchParams.get("path") || "/";
  const targetUrl = `${OFFICIAL_SITE_ORIGIN}/${path.replace(/^\/+/, "")}`;
  const target = new URL(targetUrl);

  for (const [key, value] of requestUrl.searchParams) {
    if (key !== "path") target.searchParams.append(key, value);
  }
  const japanese = target.searchParams.get("request_locale") === "ja" || target.searchParams.get("osplang") === "1";

  const upstream = await fetch(target, {
    headers: {
      Accept: request.headers.accept || "text/html",
      "Accept-Language": japanese ? "ja-JP,ja;q=0.9" : "ko-KR,ko;q=0.9",
      Referer: `${OFFICIAL_SITE_ORIGIN}/yugiohdb/`,
      "User-Agent": "Mozilla/5.0 YuGiOhCardApp/1.0",
    },
  });

  response.status(upstream.status);
  response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  response.setHeader("Vary", "Accept-Language");
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "text/html; charset=utf-8");
  response.send(Buffer.from(await upstream.arrayBuffer()));
}
