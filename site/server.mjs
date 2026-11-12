// Zero-dependency static server for dist/ (Railway). Brotli/gzip, long cache for hashed assets, security headers.
import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { join, extname, normalize } from "node:path";
import { brotliCompressSync, gzipSync, constants } from "node:zlib";

const ROOT = join(import.meta.dirname, "dist");
const PORT = Number(process.env.PORT ?? 3000);
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".svg": "image/svg+xml", ".png": "image/png", ".woff2": "font/woff2", ".ico": "image/x-icon", ".txt": "text/plain; charset=utf-8", ".webmanifest": "application/manifest+json", ".xml": "application/xml" };
const COMPRESS = new Set([".html", ".js", ".css", ".json", ".svg", ".txt", ".xml", ".webmanifest"]);
const cache = new Map();
const CSP = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://rpc.testnet.fastnear.com https://rpc.testnet.near.org https://test.rpc.fastnear.com; frame-ancestors 'none'; base-uri 'self'";

async function load(p) {
  if (cache.has(p)) return cache.get(p);
  const body = await readFile(p);
  const ext = extname(p);
  const e = { body, type: TYPES[ext] ?? "application/octet-stream" };
  if (COMPRESS.has(ext) && body.length > 1024) { e.br = brotliCompressSync(body, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }); e.gz = gzipSync(body, { level: 9 }); }
  cache.set(p, e);
  return e;
}

createServer(async (req, res) => {
  try {
    const url = new URL(req.url ?? "/", "http://x");
    if (url.pathname === "/healthz") { res.writeHead(200, { "content-type": "text/plain" }); return res.end("ok"); }
    let p = normalize(join(ROOT, decodeURIComponent(url.pathname)));
    if (!p.startsWith(ROOT)) { res.writeHead(400); return res.end(); }
    let s = await stat(p).catch(() => null);
    if (s?.isDirectory()) { p = join(p, "index.html"); s = await stat(p).catch(() => null); }
    let status = 200;
    if (!s) { p = join(ROOT, "404.html"); status = 404; s = await stat(p).catch(() => null); if (!s) { p = join(ROOT, "index.html"); } }
    const e = await load(p);
    const ae = String(req.headers["accept-encoding"] ?? "");
    const h = { "content-type": e.type, "vary": "accept-encoding", "x-content-type-options": "nosniff", "referrer-policy": "strict-origin-when-cross-origin", "x-frame-options": "DENY", "content-security-policy": CSP,
      "cache-control": url.pathname.startsWith("/assets/") ? "public, max-age=31536000, immutable" : url.pathname.startsWith("/data/") ? "public, max-age=60" : "public, max-age=300" };
    let body = e.body;
    if (e.br && /\bbr\b/.test(ae)) { body = e.br; h["content-encoding"] = "br"; } else if (e.gz && /\bgzip\b/.test(ae)) { body = e.gz; h["content-encoding"] = "gzip"; }
    h["content-length"] = body.length;
    res.writeHead(status, h);
    res.end(req.method === "HEAD" ? undefined : body);
  } catch (err) { res.writeHead(500); res.end("error"); console.error(err); }
}).listen(PORT, "0.0.0.0", () => console.log(`sealed-bench site on :${PORT}`));
