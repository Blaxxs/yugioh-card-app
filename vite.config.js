import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { Buffer } from "node:buffer";
import { fetchOfficialYgoResource } from "./api/_lib/official-ygo-fetch.js";

const officialYgoImages = {
  name: "official-ygo-language-images",
  configureServer(server) {
    server.middlewares.use(async (request, response, next) => {
      const url = new URL(request.url, "http://localhost");
      if (url.pathname !== "/official-ygo/yugiohdb/get_image.action") return next();
      try {
        const target = new URL(
          `${url.pathname.slice("/official-ygo".length)}${url.search}`,
          "https://www.db.yugioh-card.com",
        );
        const upstream = await fetchOfficialYgoResource(target, request.headers.accept || "image/*");
        response.statusCode = upstream.status;
        response.setHeader("Content-Type", upstream.headers.get("content-type") || "image/jpeg");
        response.end(Buffer.from(await upstream.arrayBuffer()));
      } catch {
        response.statusCode = 502;
        response.end("Official card image request failed");
      }
    });
  },
};

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), officialYgoImages],
  server: {
    watch: { usePolling: true, interval: 300 },
    proxy: {
      "/official-ygo": {
        target: "https://www.db.yugioh-card.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/official-ygo/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyRequest, request) => {
            const query = new URL(request.url, "http://localhost").searchParams;
            const japanese = query.get("request_locale") === "ja" || query.get("osplang") === "1";
            proxyRequest.setHeader("Accept-Language", japanese ? "ja-JP,ja;q=0.9" : "ko-KR,ko;q=0.9");
            proxyRequest.setHeader("Referer", "https://www.db.yugioh-card.com/yugiohdb/");
          });
        },
      },
      "/official-onepiece": {
        target: "https://www.onepiece-cardgame.com",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/official-onepiece/, ""),
        configure: (proxy) => {
          proxy.on("proxyReq", (proxyRequest) => {
            proxyRequest.setHeader("Accept-Language", "ja-JP,ja;q=0.9");
            proxyRequest.setHeader("Referer", "https://www.onepiece-cardgame.com/cardlist/");
          });
        },
      },
    },
  },
});
