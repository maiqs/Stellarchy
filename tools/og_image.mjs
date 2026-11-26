// The link-preview picture (round 43): the title screen at 1200x630 without its buttons, saved as client/og.jpg.
// Shown when a Stellarchy link is shared on Facebook, Discord, Reddit, messages and so on.
// Usage: node tools/og_image.mjs   (own server on 8796; rerun when the title look changes)
import { chromium } from "playwright-core";
import { fileURLToPath } from "node:url";
import { startDevServer } from "../tests/devserver.mjs";
const server = await startDevServer(8796, "og");
const browser = await chromium.launch({ channel: "msedge", headless: true });
try {
  const page = await (await browser.newContext({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 })).newPage();
  await page.addInitScript(() => { localStorage.setItem("stellarchy_hints_done", "true"); localStorage.setItem("stellarchy_profile", JSON.stringify({ name: "Stellarch", main: "#3e9bff", sub: "#ffffff", hull: "triangle", style: "balanced" })); });
  await page.goto(server.base + "/"); await page.waitForSelector("#mSolo", { state: "visible" });
  await page.addStyleTag({ content: `.menu, .you, .fine { display: none !important; } .screen { place-items: center !important; }
    .title-inner::after { content: "Free · in your browser · no account"; font: 600 1rem var(--mono, monospace); letter-spacing: .22em; text-transform: uppercase; color: #7fc4ff; text-shadow: 0 0 14px rgba(62,155,255,.6); }` });
  await page.waitForTimeout(2500);   // let the constellation settle
  await page.screenshot({ path: fileURLToPath(new URL("../client/og.jpg", import.meta.url)), type: "jpeg", quality: 88 });
  console.log("saved client/og.jpg");
} finally { await browser.close(); server.stop(); }
