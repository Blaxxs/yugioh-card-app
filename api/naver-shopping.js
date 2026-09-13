export default async function handler(request, response) {
  const query = new URL(request.url, `https://${request.headers.host}`).searchParams.get("query");
  const clientId = process.env.NAVER_CLIENT_ID;
  const clientSecret = process.env.NAVER_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    return response.status(500).json({ error: "네이버 API 환경변수가 설정되지 않았습니다." });
  }
  if (!query) return response.status(400).json({ error: "검색어가 필요합니다." });

  const apiUrl = new URL("https://openapi.naver.com/v1/search/shop.json");
  apiUrl.searchParams.set("query", query);
  apiUrl.searchParams.set("display", "20");
  apiUrl.searchParams.set("sort", "asc");
  apiUrl.searchParams.set("exclude", "rental:cbshop");

  const upstream = await fetch(apiUrl, {
    headers: { "X-Naver-Client-Id": clientId, "X-Naver-Client-Secret": clientSecret },
  });
  const body = await upstream.json();

  if (!upstream.ok)
    return response
      .status(upstream.status)
      .json({ error: body.errorMessage || "네이버 쇼핑 API 요청에 실패했습니다." });

  return response
    .status(200)
    .json({
      total: body.total || 0,
      items: (body.items || []).map((item) => ({
        title: item.title.replace(/<[^>]+>/g, ""),
        link: item.link,
        image: item.image,
        lowestPrice: Number(item.lprice) || null,
        highestPrice: Number(item.hprice) || null,
        mallName: item.mallName,
        productId: item.productId,
        productType: item.productType,
      })),
    });
}
