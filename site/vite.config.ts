import { defineConfig } from "vite";
import cfg from "./site.config.json";
const SITE_URL = (process.env.SITE_URL ?? (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : "https://sealed-bench.up.railway.app")).replace(/\/$/, "");
const CONTRACT = process.env.CONTRACT_ID || cfg.contractId;
process.env.VITE_CONTRACT_ID = CONTRACT;
export default defineConfig({
  plugins: [{ name: "site-vars", transformIndexHtml: (h) => h.replaceAll("%SITE_URL%", SITE_URL).replaceAll("%CONTRACT%", CONTRACT).replaceAll("%EXPLORER%", cfg.explorer).replaceAll("%GITHUB%", cfg.github) }],
  build: { target: "es2020", cssCodeSplit: false, assetsInlineLimit: 0 },
});
