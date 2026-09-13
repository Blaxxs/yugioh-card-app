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
      },
    },
  },
});
