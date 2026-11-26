// End-to-end browser tests: the real page in headless Edge (installed with Windows; playwright-core drives it).
// Runs its own dev server on port 8788 with its own storage, so it never touches the preview on 8787.
// Usage: node tests/e2e.mjs   (or .\run.ps1 e2e)
import { chromium } from "playwright-core";
import { spawn, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

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

  // speed: Skip to my turn races the AI to my next turn and puts the pace back; the effects choice is saved
  await page.click("#bAgain"); await page.waitForFunction(() => window.stellarchy.state && window.stellarchy.state.status === "playing");
  await page.evaluate(() => window.stellarchy.room.send({ t: "pace", pace: "slow" }));
  const skipped = await page.evaluate(async () => {
    const W = window.stellarchy, me = () => W.state.seats.findIndex(s => s.name === "E2E"), mine = () => W.state.game.turn === me();
    for (let tries = 0; tries < 4 && !document.getElementById("bSkip"); tries++) {
    for (let k = 0; k < 400 && mine(); k++) {   // finish my own turn quickly so the AI's turn comes up
      const g = W.state.game, move = intent => W.room.send({ t: "intent", intent });   // moves travel wrapped, as the page sends them
      if (g.phase === "setup") move({ t: "hq", sys: g.owner.findIndex(o => o < 0) });
      else if (g.phase === "reinforce") move({ t: "place", placement: { [g.owner.indexOf(me())]: g.reinforcements } });
      else if (g.phase === "attack") move({ t: "endAttack" }); else move({ t: "endTurn" });
      await new Promise(r => setTimeout(r, 30));
    }
    for (let k = 0; k < 100 && !document.getElementById("bSkip") && !mine(); k++) await new Promise(r => setTimeout(r, 50));
    }
    const b = document.getElementById("bSkip"); if (!b) return { none: true, mine: mine(), status: W.state.status, phase: W.state.game.phase, me: me(), seats: W.state.seats.map(s => s.name + (s.away ? "(away)" : "")), bar: document.getElementById("bar").textContent.slice(0, 120) };
    // plan chips: a planned sun shows as a chip; tapping it cancels that plan
    const mySun = W.state.game.owner.indexOf(me()); W.ui.plan[mySun] = 2;
    for (let k = 0; k < 60 && !document.querySelector(".planchip"); k++) await new Promise(r => setTimeout(r, 50));
    const chip = document.querySelector(".planchip"); if (chip) chip.click();
    const chipOk = !!chip && !W.ui.plan[mySun] && !document.querySelector(".planchip");
    const t0 = performance.now(); document.getElementById("bSkip").click();
    for (let k = 0; k < 400 && !(mine() || W.state.status === "over"); k++) await new Promise(r => setTimeout(r, 25));
    await new Promise(r => setTimeout(r, 100));
    return { ms: Math.round(performance.now() - t0), pace: W.state.opts.pace, back: mine() || W.state.status === "over", chipOk };
  });
  check(skipped.chipOk, "a planned sun shows as a chip, and tapping it cancels that plan");
  check(skipped.back && skipped.pace === "slow", `Skip to my turn reaches my turn fast and puts the pace back (${JSON.stringify(skipped)})`);
  // While you waited: at the start of my turn, a recap of what happened to me, with a tap to fly to each sun
  if (skipped.back) {
    await page.evaluate(() => { const W = window.stellarchy, g = W.state.game, k = W.state.seats.findIndex(s => s.name === "E2E");
      const mineSun = g.owner.indexOf(k), theirs = g.owner.findIndex(o => o >= 0 && o !== k);
      W.ui.recap = { lost: [{ sun: theirs, by: g.owner[theirs], hits: 2, lost: 5, killed: 1 }], held: [{ sun: mineSun, by: g.owner[theirs], hits: 1, lost: 1, killed: 4 }], shipsLost: 6, shipsKilled: 5, news: [], any: true }; W.render(); });
    const line = await page.textContent("#bRecap").catch(() => "");
    await page.click("#bRecap"); await page.waitForSelector("#dlg[open] .recaprow");
    const rows = await page.locator("#dlg .recaprow").count();
    await page.screenshot({ path: fileURLToPath(new URL("../docs/shots/recap.png", import.meta.url)) }).catch(() => {});
    await page.click("#dlg .recaprow.bad"); await sleep(300); const closed = !(await page.isVisible("#dlg[open]")); await page.keyboard.press("Escape"); await sleep(1200);
    check(/lost 1 sun · held 1/.test(line) && rows === 2 && closed, `a "While you waited" recap opens with each sun, and a tap flies there (${line.trim()})`);
  }
  await page.click("#hMenu"); await page.click('#mFx [data-v="off"]');
  check((await page.evaluate(() => localStorage.getItem("stellarchy_fx"))) === '"off"', "the battle effects choice is saved");
  await page.evaluate(() => localStorage.setItem("stellarchy_fx", '"full"'));

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
  // landscape phone (round 36): the whole title menu fits without scrolling, and the game's bar leaves most of the map free
  const land = await browser.newContext({ viewport: { width: 740, height: 360 }, isMobile: true, hasTouch: true });
  const p3 = await land.newPage(); await p3.addInitScript(() => { localStorage.setItem("stellarchy_hints_done", "true"); localStorage.setItem("stellarchy_profile", JSON.stringify({ name: "Land", main: "#3e9bff", sub: "#ffffff", hull: "orb", style: "balanced" })); });
  await p3.goto(BASE + "/"); await p3.waitForSelector("#mSolo", { state: "visible" });
  await sleep(400); const bottoms = await p3.evaluate(() => ["mQuick", "mSolo", "mCreate", "mWatch"].map(id => Math.round(document.getElementById(id).getBoundingClientRect().bottom)).concat(innerHeight));
  const fits = bottoms.slice(0, -1).every(b => b <= bottoms.at(-1));
  await p3.click("#mSolo"); await p3.click('[data-seg="mode"] [data-v="dealt"]'); await p3.click("#sGo"); await p3.waitForFunction(() => !document.getElementById("hud").hidden); await sleep(800);
  const barFrac = await p3.evaluate(() => document.getElementById("bar").getBoundingClientRect().height / innerHeight);
  check(fits && barFrac < .75, `landscape phone: the title menu fits and the bar leaves the map visible (bar ${Math.round(barFrac * 100)}% of the height; menu bottoms ${bottoms.join(",")})`);
} catch (e) { failures++; console.log("  FAIL " + String(e.message).replace(/\s+/g, " ").slice(0, 400)); }
finally { await browser.close(); stopServer(); }
console.log(failures ? `${failures} FAILED` : "all browser checks passed");
process.exit(failures ? 1 : 0);
