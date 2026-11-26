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
