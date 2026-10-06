import { fetchOfficialYgoResource } from "../_lib/official-ygo-fetch.js";

const OFFICIAL_SITE_ORIGIN = "https://www.db.yugioh-card.com";

export default async function handler(request, response) {
  const requestUrl = new URL(request.url, `https://${request.headers.host}`);
  const officialPath = requestUrl.pathname.replace(/^\/api\/official-ygo/, "") || "/";
  const targetUrl = `${OFFICIAL_SITE_ORIGIN}${officialPath}${requestUrl.search}`;
  const target = new URL(targetUrl);
  const upstream = await fetchOfficialYgoResource(target, request.headers.accept || "text/html");

  response.status(upstream.status);
  response.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  response.setHeader("Vary", "Accept-Language");
  response.setHeader("Content-Type", upstream.headers.get("content-type") || "text/html; charset=utf-8");
  response.send(Buffer.from(await upstream.arrayBuffer()));
}
