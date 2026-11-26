// Stellarchy map helpers: turns star_map.json data into what the rules need.
// Pure functions, no DOM, no Node APIs: used by the server (Durable Object), the browser and the tests.

// spectral class letter of a system ("" if unknown); "D" for white dwarfs
export function specClass(s) {
  let t = (s.spect || "").trim().toUpperCase();
  if (/^D[ABOQZCX]/.test(t) || t === "D" || (/^W[DN]?/.test(t) && !/^WR/.test(t))) return "D";
  t = t.replace(/^(SD|K-M|D|E)/, "");
  return /^[OBAFGKMLTY]/.test(t) ? t[0] : "";
}

// card type by sun colour (Paul): 0 red (M and brown dwarfs), 1 orange (K), 2 yellow-white (G, F, A, white dwarfs);
// systems with no catalogued type go by brightness
export function sunType(s) {
  const c = specClass(s);
  if (c === "M" || c === "L" || c === "T" || c === "Y") return 0;
  if (c === "K") return 1;
  if (c) return 2;
  return s.lum < 0.05 ? 0 : s.lum < 0.5 ? 1 : 2;
}

// prepare a map: {systems, lanes, continents} -> adjacency and lookups used everywhere
export function prepareMap(raw) {
  const systems = raw.systems, n = systems.length;
  const adj = systems.map(() => []);
  for (const e of raw.lanes) { adj[e.a].push(e.b); adj[e.b].push(e.a); }
  const continents = (raw.continents || []).map(c => ({ id: c.id, name: c.name, bonus: c.bonus, members: [] }));
  const contOf = systems.map(s => (s.continent ?? -1));
  contOf.forEach((c, i) => { if (c >= 0 && continents[c]) continents[c].members.push(i); });
  const sun = systems.map(sunType);
  return { n, systems, adj, continents, contOf, sun, lanes: raw.lanes };
}

// lane distance from a set of systems, up to maxD (Infinity beyond)
export function hops(map, from, maxD = Infinity) {
  const d = new Array(map.n).fill(Infinity), q = [];
  for (const i of from) { d[i] = 0; q.push(i); }
  for (let h = 0; h < q.length; h++) {
    const u = q[h]; if (d[u] >= maxD) continue;
    for (const j of map.adj[u]) if (d[j] === Infinity) { d[j] = d[u] + 1; q.push(j); }
  }
  return d;
}

// seeded random numbers in [0, 1)
export function mulberry32(seed) {
  let s = seed | 0;
  return () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
}
