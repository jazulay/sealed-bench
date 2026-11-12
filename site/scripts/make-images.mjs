// Renders public/og.png (1200x630), favicon-32.png and apple-touch-icon.png with headless Chrome.
// Needs playwright-core and a Chrome binary: CHROME=/usr/bin/google-chrome node scripts/make-images.mjs
import { chromium } from "playwright-core";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const nm = resolve("node_modules");
const f = (p) => "data:font/woff2;base64," + readFileSync(resolve(nm, p)).toString("base64");
const css = `@font-face{font-family:I;src:url(${f("@fontsource-variable/inter/files/inter-latin-wght-normal.woff2")});font-weight:100 900}
@font-face{font-family:S;font-style:italic;src:url(${f("@fontsource/instrument-serif/files/instrument-serif-latin-400-italic.woff2")})}
@font-face{font-family:M;src:url(${f("@fontsource-variable/jetbrains-mono/files/jetbrains-mono-latin-wght-normal.woff2")});font-weight:100 900}`;
const seal = readFileSync("public/favicon.svg", "utf8");
const snap = JSON.parse(readFileSync("public/data/snapshot.json", "utf8"));
const s = snap.suites.find((x) => x.suite_id === "gsm-sealed-v1");
const ch = new Set(s?.challenge ?? []);
const cells = Array.from({ length: 100 }, (_, i) => `<i class="${ch.has(i) ? "on" : ""}"></i>`).join("");
const og = `<html><head><style>${css}
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#050607;color:#f3f5f7;font-family:I;overflow:hidden;position:relative}
.g{position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.06) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.06) 1px,transparent 1px);background-size:60px 60px;-webkit-mask-image:radial-gradient(ellipse 80% 80% at 30% 30%,#000 20%,transparent 75%)}
.glow{position:absolute;left:-200px;top:-300px;width:1100px;height:800px;background:radial-gradient(closest-side,rgba(0,236,151,.20),rgba(80,110,255,.08) 55%,transparent 75%)}
.c{position:absolute;inset:64px 72px;display:flex;flex-direction:column}
.b{display:flex;align-items:center;gap:14px;font-weight:600;font-size:26px;letter-spacing:-.01em}.b svg{width:44px;height:44px}
h1{margin-top:auto;font-weight:650;font-size:72px;line-height:1.02;letter-spacing:-.045em;max-width:15ch}
em{font-family:S;font-weight:400;font-style:italic;letter-spacing:-.02em;color:#00ec97}
p{margin-top:28px;font-size:25px;color:#8b939d;letter-spacing:-.01em}
.m{font-family:M;font-size:17px;color:#59616b;margin-top:26px;letter-spacing:.02em}.m b{color:#00ec97;font-weight:500}
.grid{position:absolute;right:72px;top:64px;display:grid;grid-template-columns:repeat(10,22px);gap:6px}
.grid i{width:22px;height:22px;border-radius:5px;background:rgba(165,180,255,.14);border:1px solid rgba(165,180,255,.2)}
.grid i.on{background:#00ec97;border-color:#00ec97;box-shadow:0 0 14px rgba(0,236,151,.6)}
</style></head><body><div class="glow"></div><div class="g"></div><div class="grid">${cells}</div>
<div class="c"><div class="b">${seal}Sealed Bench</div><h1>Audit a private benchmark score by opening 20 of 100 entries.</h1>
<p>NEAR randomness picks the entries. A contract checks each against its NEAR AI TEE signature.</p><div class="m"><b>●</b> NEAR testnet · NEAR HACKATHON 2026</div></div></body></html>`;
const b = await chromium.launch({ executablePath: process.env.CHROME ?? "/usr/bin/google-chrome", args: ["--no-sandbox"] });
const p = await b.newPage({ viewport: { width: 1200, height: 630 } });
await p.setContent(og); await p.waitForTimeout(300); await p.screenshot({ path: "public/og.png" });
for (const [n, file] of [[32, "favicon-32.png"], [180, "apple-touch-icon.png"]]) {
  await p.setViewportSize({ width: n, height: n });
  await p.setContent(`<html><body style="margin:0;background:#050607">${seal.replace("<svg ", `<svg width="${n}" height="${n}" `)}</body></html>`);
  await p.screenshot({ path: `public/${file}`, omitBackground: false });
}
await b.close();
console.log("ok");
