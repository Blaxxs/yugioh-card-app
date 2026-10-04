import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
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
    },
  },
});
