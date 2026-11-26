// Landscape phone screenshots (round 36): node tools/shot_land.mjs <outdir>. Own server on 8791, own storage.
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
const PORT = 8791, BASE = `http://127.0.0.1:${PORT}`, out = process.argv[2] || ".", sleep = ms => new Promise(r => setTimeout(r, ms));
const server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", ".wrangler/shots"], { cwd: new URL("..", import.meta.url), shell: true, stdio: ["ignore", "pipe", "pipe"] });
let ready = false; server.stdout.on("data", d => { if (String(d).includes("Ready on")) ready = true; });
for (let k = 0; k < 120 && !ready; k++) await sleep(500);
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  for (const [w, h, tag] of [[740, 360, "land"], [844, 390, "land2"], [360, 740, "port"]]) {
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 });
    const p = await ctx.newPage();
    await p.addInitScript(() => { localStorage.setItem("stellarchy_hints_done", "true"); localStorage.setItem("stellarchy_profile", JSON.stringify({ name: "Phone", main: "#3e9bff", sub: "#ffffff", hull: "triangle", style: "balanced" })); });
    await p.goto(BASE + "/"); await p.waitForSelector("#mSolo", { state: "visible" }); await sleep(600);
    await p.screenshot({ path: `${out}/${tag}_title.png` });
    const m = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, iw: innerWidth, ih: innerHeight }));
    console.log(tag, "title", JSON.stringify(m));
    await p.click("#mSolo"); await p.waitForSelector("#sGo"); await sleep(300); await p.screenshot({ path: `${out}/${tag}_solo.png` });
    const goVis = await p.evaluate(() => { const r = document.getElementById("sGo").getBoundingClientRect(); return r.bottom <= innerHeight || "scrollable"; });
    console.log(tag, "solo Go reachable:", goVis);
    for (const [seg, v] of [["bots", "3"], ["size", "100"], ["mode", "dealt"]]) await p.click(`[data-seg="${seg}"] [data-v="${v}"]`).catch(() => {});
    await p.click("#sGo"); await p.waitForFunction(() => !document.getElementById("hud").hidden); await sleep(2500);
    await p.screenshot({ path: `${out}/${tag}_game.png` });
    const bar = await p.evaluate(() => { const r = document.getElementById("bar").getBoundingClientRect(), t = document.querySelector("header, #top, .top"); return { barTop: Math.round(r.top), barH: Math.round(r.height), ih: innerHeight, frac: +(r.height / innerHeight).toFixed(2) }; });
    console.log(tag, "bar", JSON.stringify(bar));
    await ctx.close();
  }
} finally { await browser.close(); try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" }); } catch (e) {} }
