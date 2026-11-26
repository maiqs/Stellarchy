// End-to-end browser tests: the real page in headless Edge (installed with Windows; playwright-core drives it).
// Runs its own dev server on port 8788 with its own storage, so it never touches the preview on 8787.
// Usage: node tests/e2e.mjs   (or .\run.ps1 e2e)
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";

const PORT = 8788, BASE = `http://127.0.0.1:${PORT}`, sleep = ms => new Promise(r => setTimeout(r, ms));
let failures = 0; const check = (ok, what) => { console.log((ok ? "  ok   " : "  FAIL ") + what); if (!ok) failures++; };

// ---- the server ----
const server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "127.0.0.1", "--persist-to", ".wrangler/e2e"], { cwd: new URL("..", import.meta.url), shell: true, stdio: ["ignore", "pipe", "pipe"] });
let ready = false; server.stdout.on("data", d => { if (String(d).includes("Ready on")) ready = true; });
const stopServer = () => { try { execSync(`taskkill /pid ${server.pid} /T /F`, { stdio: "ignore" }); } catch (e) {} };
for (let k = 0; k < 120 && !ready; k++) await sleep(500);
if (!ready) { console.log("dev server did not start"); stopServer(); process.exit(1); }

const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const page = await ctx.newPage(), errors = [];
  page.on("pageerror", e => errors.push(e.message)); page.on("response", r => { if (r.status() === 404) errors.push("404 " + new URL(r.url()).pathname); }); page.on("console", m => { if (m.type() === "error" && !/favicon|ERR_CONNECTION|Failed to load resource/.test(m.text())) errors.push(m.text()); });
  await page.addInitScript(() => { localStorage.setItem("stellarchy_hints_done", "true"); localStorage.setItem("stellarchy_profile", JSON.stringify({ name: "E2E", main: "#3e9bff", sub: "#ffffff", hull: "dice", style: "balanced" })); });
  await page.goto(BASE + "/"); await page.waitForSelector("#mSolo", { state: "visible" });

  // title screen
  check(await page.isVisible("text=Stellarchy") && await page.isVisible("#mQuick"), "title screen shows the wordmark and Quick play");

  // look editor: the 3D preview and the new ship styles
  await page.click("#youCard"); await page.waitForSelector("#lPrev canvas");
  check(await page.locator('[data-hull="fish"]').count() === 1 && await page.locator('[data-hull="dice"]').count() === 1, "look editor offers dice and fish ships, with a 3D preview");
  await page.click('[data-hull="fish"]'); await page.click("#lSave"); await sleep(300);
  check((await page.evaluate(() => JSON.parse(localStorage.getItem("stellarchy_profile")).hull)) === "fish", "the chosen ship style is saved");

  // a whole solo game, with the AI playing my seat, through to the end bar, results and replay
  await page.click("#mSolo");
  await page.waitForSelector("#sGo");
  for (const [seg, v] of [["bots", "1"], ["size", "25"], ["mode", "dealt"], ["pace", "instant"], ["fog", "false"]]) await page.click(`[data-seg="${seg}"] [data-v="${v}"]`);
  await page.click("#sGo"); await page.waitForFunction(() => !document.getElementById("hud").hidden);   // the HUD box has no size of its own, so wait on the attribute
  check(await page.isVisible("#bar"), "the game starts with the action bar showing");
  await page.evaluate(() => window.stellarchy.room.send({ t: "away", on: true }));
  await page.waitForFunction(() => window.stellarchy.state && window.stellarchy.state.status === "over", null, { timeout: 60000 });
  await page.waitForSelector("#dlg[open] .win", { timeout: 5000 });
  check(await page.locator("#dlg .chart polyline").count() === 2, "the results screen draws one line per player");
  await page.click("#wClose");
  check(/rules the stars/i.test(await page.textContent("#bar")), "the end-of-game bar says who rules the stars (the round-19 bug)");
  await page.click("#bWin"); await page.click("#wReplay"); await page.waitForSelector("#rRange");
  check(await page.isVisible("#rRange"), "the replay opens with its timeline");
  await page.click("#rExit"); check(!(await page.isVisible("#rRange")), "Done closes the replay");

  // cards show real photos
  await page.evaluate(() => { const W = window.stellarchy; W.state.game.cards[0] = [W.MAP.systems.findIndex(s => s.name === "Sirius")].filter(i => i >= 0); });
  if (await page.evaluate(() => window.stellarchy.state.game.cards[0].length)) {
    await page.click("#hCards"); await page.waitForSelector(".cardface .sky img");
    const ok = await page.evaluate(async () => { const i = document.querySelector(".cardface .sky img"); i.loading = "eager"; i.src = i.getAttribute("src"); await i.decode().catch(() => {}); return i.naturalWidth > 0; });
    check(ok, "a card shows its telescope photo");
    await page.keyboard.press("Escape");
  }

  // keyboard: ? opens the guide
  await page.keyboard.press("Escape"); await page.evaluate(() => document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "?", bubbles: true }))); await sleep(200);
  check(/How to play/.test(await page.textContent("#dlg")), "? opens How to play");

  // an online room in the page: create, add an AI player, start
  await page.goto(BASE + "/"); await page.click("#mCreate"); await page.click("#cGo"); await page.waitForSelector("#bBot");
  await page.click("#bBot"); await page.waitForFunction(() => window.stellarchy.state.seats.length === 2);
  await page.click("#bStart"); await page.waitForFunction(() => window.stellarchy.state.status === "playing");
  check(true, "an online room: create, Add AI player, Start");
  // opening an invite link directly (a fresh page at /r/CODE) loads the whole game and joins the room
  const code = await page.evaluate(() => window.stellarchy.state.code);
  const guest = await browser.newContext({ viewport: { width: 1280, height: 800 } }), gp = await guest.newPage(), gErrors = [];
  gp.on("response", r => { if (r.status() >= 400) gErrors.push(r.status() + " " + new URL(r.url()).pathname); }); gp.on("pageerror", e => gErrors.push(e.message));
  await gp.addInitScript(() => { localStorage.setItem("stellarchy_hints_done", "true"); localStorage.setItem("stellarchy_profile", JSON.stringify({ name: "Guest", main: "#ff4d5a", sub: "#ffffff", hull: "orb", style: "balanced" })); });
  await gp.goto(`${BASE}/r/${code}`);
  await gp.waitForFunction(c => window.stellarchy && window.stellarchy.state && window.stellarchy.state.code === c, code, { timeout: 15000 });
  check(gErrors.length === 0, `an invite link opened fresh loads every file and joins room ${code} (${gErrors.slice(0, 3).join(" | ")})`);
  await guest.close();

  check(errors.length === 0, `no script errors (${errors.slice(0, 3).join(" | ")})`);

  // phone size: no sideways scrolling, buttons reachable
  const phone = await browser.newContext({ viewport: { width: 360, height: 640 }, isMobile: true, hasTouch: true });
  const p2 = await phone.newPage(); await p2.goto(BASE + "/"); await p2.waitForSelector("#mSolo", { state: "visible" });
  const wide = await p2.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  check(!wide && await p2.isVisible("#mQuick"), "phone size: no sideways scrolling, Quick play visible");
} catch (e) { failures++; console.log("  FAIL " + String(e.message).replace(/\s+/g, " ").slice(0, 400)); }
finally { await browser.close(); stopServer(); }
console.log(failures ? `${failures} FAILED` : "all browser checks passed");
process.exit(failures ? 1 : 0);
