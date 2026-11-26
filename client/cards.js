// Card faces and sun facts. Cards are the colour of each system's sun (Paul): red, orange, yellow-white, plus wilds.
import { specClass } from "./shared/map.js";
export const CARD_NAMES = ["Red sun", "Orange sun", "Yellow-white sun", "Wild"];
export const CARD_COLOR = ["#ff5a3c", "#ffa340", "#fff1b8", "#f4e3b5"];
export function surfaceTemp(s) {
  const c = specClass(s), t = (s.spect || "").trim().toUpperCase().replace(/^(SD|D|E)/, ""), sub = parseFloat(t.slice(1)) || 5;
  const base = { O: [40000, 30000], B: [28000, 10500], A: [9800, 7500], F: [7300, 6100], G: [6000, 5300], K: [5250, 3900], M: [3850, 2300], L: [2200, 1350], T: [1300, 600], Y: [550, 300] }[c];
  if (c === "D") return "about 10,000 K (white dwarf)";
  if (!base) return "unknown";
  const k = Math.min(1, Math.max(0, sub / 9.5)), v = Math.round((base[0] + (base[1] - base[0]) * k) / 50) * 50;
  return `about ${v.toLocaleString()} K`;
}
export const SUN_WORDS = { O: "blue giant", B: "blue-white star", A: "white star", F: "yellow-white star", G: "yellow star like the Sun", K: "orange dwarf", M: "red dwarf", L: "brown dwarf", T: "brown dwarf", Y: "very cold brown dwarf", D: "white dwarf" };
export const STAR_FACTS = {
  "Sol": "Home: eight planets, one known to hold life.",
  "Alpha Centauri": "Three stars. Proxima Centauri has Proxima b, an Earth-mass planet in its habitable zone (found 2016).",
  "Barnard's Star": "Fastest-moving star in our sky; small rocky planets found close in (2024-2025).",
  "Luhman 16": "The nearest brown dwarfs: a pair whose cloud weather has been mapped.",
  "WISE 0855-0714": "The coldest brown dwarf known, about as cold as the North Pole; likely water-ice clouds.",
  "Wolf 359": "A small flare star that can brighten suddenly.",
  "Sirius": "The brightest star in Earth's night sky; its companion Sirius B is a white dwarf.",
  "Epsilon Eridani": "A young orange dwarf with a Jupiter-like planet and two dusty debris belts.",
  "Ross 128": "Hosts Ross 128 b, a temperate Earth-mass planet.",
  "61 Cygni": "The first star whose distance was measured (Bessel, 1838).",
  "Procyon": "Its faint companion Procyon B is a white dwarf.",
  "Epsilon Indi": "Epsilon Indi Ab, a cold giant planet, was photographed directly by JWST (2024); two brown dwarfs orbit far out.",
  "Tau Ceti": "A Sun-like star with a heavy debris disc and several candidate planets.",
  "Groombridge 34": "Two red dwarfs; the brighter one hosts at least two planets.",
  "Luyten's Star": "Hosts two planets; Luyten b lies in the habitable zone.",
  "Teegarden's Star": "Two Earth-mass planets, b and c, close to its habitable zone.",
  "Kapteyn's Star": "A halo star orbiting the galaxy backwards, perhaps from a swallowed dwarf galaxy.",
  "YZ Ceti": "Three small planets on very tight orbits.",
  "Gliese 1061": "Three Earth-mass planets; c and d lie in or near the habitable zone.",
  "Wolf 1061": "Three planets; Wolf 1061 c lies in the habitable zone.",
  "Ross 248": "Heading our way: in about 36,000 years it will be the Sun's nearest star.",
  "Lacaille 9352": "Two super-Earth planets.",
  "Gliese 1002": "Two Earth-mass planets in its habitable zone (2022).",
  "40 Eridani": "An orange dwarf, a white dwarf and a red dwarf. Star Trek put Vulcan here.",
  "Gliese 876": "Four planets, two of them giants locked in step around a red dwarf.",
  "Gliese 832": "A red dwarf with a Jupiter-like planet far out.",
  "Gliese 445": "Voyager 1 will pass within about 1.6 light years of it in 40,000 years.",
  "Gliese 581": "At least three planets around a quiet red dwarf.",
  "Gliese 667": "Three stars; Gliese 667 C has several planets, some in its habitable zone.",
  "Gliese 357": "Three planets; Gliese 357 d orbits near the habitable zone.",
  "Altair": "Spins so fast it bulges at the equator, once every nine hours.",
  "Fomalhaut": "Ringed by a wide debris belt; its supposed planet turned out to be a dust cloud.",
  "Vega": "Once the measuring stick for star brightness; surrounded by a debris disc.",
  "70 Ophiuchi": "A pair of orange dwarfs circling each other every 88 years.",
};
export const disp = s => s.name === "Sol" ? "Sol (Earth)" : s.name;
export const lightText = s => s.lum >= 0.001 ? `${s.lum >= 10 ? Math.round(s.lum) : s.lum.toFixed(s.lum < 0.1 ? 3 : 2)} × Sun` : s.lum > 0 ? `${s.lum.toExponential(1)} × Sun` : "very faint";

// ---------- a window of night sky on each card: the sun as seen from Earth, with its neighbouring suns ----------
// Positions are equatorial (x, y, z in light years, z toward the north celestial pole), so the direction to a star
// is where it sits in our sky. Brightness comes from luminosity and distance (apparent magnitude).
const TRUE_COLOR = { O: "#9bb0ff", B: "#aabfff", A: "#cad7ff", F: "#f8f7ff", G: "#fff4ea", K: "#ffd2a1", M: "#ffb07a", L: "#d8743f", T: "#b4512f", Y: "#8a3b2a", D: "#e8eeff" };
const LY_PER_PC = 3.26156;
export function apparentMag(s) {
  if (s.name === "Sol") return -26.74;
  const L = Math.max(s.lum || 0, 1e-6), dpc = Math.max(.01, s.distLy / LY_PER_PC);
  return 4.83 - 2.5 * Math.log10(L) + 5 * Math.log10(dpc) - 5;
}
export const trueColor = s => TRUE_COLOR[specClass(s)] || "#ffe6c7";
export function skyWindow(map, i) {
  const S = map.systems, s = S[i], W = 160, H = 78;
  const esc = t => String(t).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let body = "";
  // a scatter of faint background stars (the same for each card, so it reads as sky, not noise)
  let seed = i * 2654435761 >>> 0; const rnd = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296;
  for (let k = 0; k < 26; k++) body += `<circle cx="${(rnd() * W).toFixed(1)}" cy="${(rnd() * H).toFixed(1)}" r="${(.35 + rnd() * .5).toFixed(2)}" fill="#9fb0d0" opacity="${(.25 + rnd() * .45).toFixed(2)}"/>`;
  if (s.name === "Sol") {   // from Earth, the Sun is the Sun
    body += `<defs><radialGradient id="sg${i}"><stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#fff4ea"/><stop offset=".6" stop-color="#ffd27a" stop-opacity=".7"/><stop offset="1" stop-color="#ff9a3c" stop-opacity="0"/></radialGradient></defs>
      <rect width="${W}" height="${H}" fill="#2a5a9a" opacity=".35"/><circle cx="${W / 2}" cy="${H / 2}" r="34" fill="url(#sg${i})"/><circle cx="${W / 2}" cy="${H / 2}" r="12" fill="#fffdf6"/>`;
    return svg(W, H, body, "Our Sun, from Earth: magnitude −26.7");
  }
  const len = Math.hypot(s.x, s.y, s.z) || 1, d = [s.x / len, s.y / len, s.z / len];
  const north = Math.abs(d[2]) > .99 ? [0, 1, 0] : [0, 0, 1];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = v => { const l = Math.hypot(...v) || 1; return v.map(x => x / l); };
  const east = norm(cross(north, d)), up = cross(d, east), dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const FOV = Math.tan(32 * Math.PI / 180), place = t => { const l = Math.hypot(t.x, t.y, t.z) || 1, v = [t.x / l, t.y / l, t.z / l], c = dot(v, d); if (c < .5) return null;
    const px = W / 2 - dot(v, east) / c / FOV * (W / 2), py = H / 2 - dot(v, up) / c / FOV * (H / 2); return px < -4 || px > W + 4 || py < -4 || py > H + 4 ? null : [px, py]; };
  const dotFor = (t, x, y, main) => { const m = apparentMag(t), r = Math.max(.9, Math.min(main ? 5 : 3.2, 3.4 - .38 * m)), col = trueColor(t);
    return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${(r * 2.4).toFixed(1)}" fill="${col}" opacity=".18"/><circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r.toFixed(1)}" fill="${col}"/>`; };
  for (const j of map.adj[i]) { if (S[j].name === "Sol") continue; const p = place(S[j]); if (p) body += `<line x1="${W / 2}" y1="${H / 2}" x2="${p[0].toFixed(1)}" y2="${p[1].toFixed(1)}" stroke="#4d6a9e" stroke-width=".5" opacity=".5"/>` + dotFor(S[j], p[0], p[1], false); }
  body += dotFor(s, W / 2, H / 2, true);
  const m = apparentMag(s), eye = m <= 6 ? "you can see it with your own eyes" : m <= 10 ? "binoculars or a small telescope" : "too faint without a telescope";
  return svg(W, H, body, `From Earth: magnitude ${m.toFixed(1)}, ${eye}`);
  function svg(w, h, inner, caption) { return `<figure class="sky"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(caption)}">${inner}</svg><figcaption>${esc(caption)}</figcaption></figure>`; }
}
