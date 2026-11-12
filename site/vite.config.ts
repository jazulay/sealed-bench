import { defineConfig } from "vite";
const SITE_URL = (process.env.SITE_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "https://sealed-bench.up.railway.app")).replace(/\/$/, "");
export default defineConfig({
  plugins: [{ name: "site-url", transformIndexHtml: (h) => h.replaceAll("%SITE_URL%", SITE_URL) }],
  build: { target: "es2020", cssCodeSplit: false, assetsInlineLimit: 0 },
});
