// Downloads a real telescope photo for every sun: a 2MASS colour cutout (the NASA-funded Two Micron All Sky
// Survey, observed 1997-2001) centred on each star, from the CDS hips2fits service. Polite: 3 at a time with
// pauses, skips files it already has (so it can be re-run to finish), and retries failures.
// Credit (in-game Credits and on each card): 2MASS, UMass/IPAC-Caltech/NASA/NSF; cutouts by CDS hips2fits.
// Usage: node tools/fetch_sky.mjs [limit]
import { readFileSync, writeFileSync, existsSync, mkdirSync } from "node:fs";
const root = new URL("../", import.meta.url);
const stars = JSON.parse(readFileSync(new URL("data/stars.json", root))).systems;
const out = new URL("client/sky/", root); mkdirSync(out, { recursive: true });
const limit = +(process.argv[2] || stars.length), sleep = ms => new Promise(r => setTimeout(r, ms));
const W = 240, H = 160, FOV = 0.2;   // degrees across: the star with a little of its neighbourhood
function radec(s) { const r = Math.hypot(s.x, s.y, s.z); let ra = Math.atan2(s.y, s.x) * 180 / Math.PI; if (ra < 0) ra += 360; return [ra, Math.asin(s.z / r) * 180 / Math.PI]; }
let done = 0, skipped = 0, failed = [];
async function one(i) {
  const file = new URL(`s${i}.jpg`, out); if (existsSync(file)) { skipped++; return; }
  const [ra, dec] = radec(stars[i]);
  const url = `https://alasky.cds.unistra.fr/hips-image-services/hips2fits?hips=CDS%2FP%2F2MASS%2Fcolor&width=${W}&height=${H}&fov=${FOV}&projection=TAN&coordsys=icrs&ra=${ra.toFixed(5)}&dec=${dec.toFixed(5)}&format=jpg`;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const r = await fetch(url, { headers: { "User-Agent": "stellarchy-asset-fetch (free game; one image per star, cached)" } });
      if (r.ok && (r.headers.get("content-type") || "").includes("jpeg")) { writeFileSync(file, Buffer.from(await r.arrayBuffer())); done++; return; }
    } catch (e) {}
    await sleep(2000 * (attempt + 1));
  }
  failed.push(i);
}
const todo = []; for (let i = 1; i < Math.min(limit, stars.length); i++) todo.push(i);   // 0 is Sol: the card shows NASA's SDO Sun instead
let next = 0;
await Promise.all([0, 1, 2].map(async () => { while (next < todo.length) { const i = todo[next++]; await one(i); await sleep(250); if ((done + skipped) % 200 === 0) console.log(`${done + skipped}/${todo.length}`); } }));
writeFileSync(new URL("client/sky/CREDITS.txt", root), "Star photos: 2MASS colour images (Two Micron All Sky Survey: University of Massachusetts and IPAC/Caltech, funded by NASA and the NSF), cutouts made with the CDS hips2fits service (Strasbourg).\nThe Sun: NASA/SDO and the AIA, EVE and HMI science teams (public domain).\n");
console.log(`done ${done}, already had ${skipped}, failed ${failed.length}${failed.length ? ": " + failed.slice(0, 20).join(",") : ""}`);
