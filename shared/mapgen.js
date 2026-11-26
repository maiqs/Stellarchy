// Builds a playable map of any size (10 to 3,000 suns) from the sorted star list (data/stars.json).
// The same size always gives the same map. Lanes join suns within LANE_LY, every sun gets at least
// two lanes, and the whole map is connected. Regions are k-means clusters of nearby suns, repaired so
// each one is joined by its own lanes, named after the constellation most of their suns lie in.
export const LANE_LY = 7;
export const SIZE_STEPS = [10, 25, 50, 100, 200, 300, 500, 1000, 2000, 3000];
export const MIN_SIZE = 10, MAX_SIZE = 3000;

const NOM = { And: "Andromeda", Aql: "Aquila", Aqr: "Aquarius", Ara: "Ara", Ari: "Aries", Aur: "Auriga", Boo: "Bootes", Cae: "Caelum", Cam: "Camelopardalis", Cap: "Capricornus", Car: "Carina", Cas: "Cassiopeia", Cen: "Centaurus", Cep: "Cepheus", Cet: "Cetus", Cha: "Chamaeleon", Cir: "Circinus", CMa: "Canis Major", CMi: "Canis Minor", Cnc: "Cancer", Col: "Columba", Com: "Coma", CrA: "Corona Australis", CrB: "Corona Borealis", Crt: "Crater", Cru: "Crux", Crv: "Corvus", CVn: "Canes Venatici", Cyg: "Cygnus", Del: "Delphinus", Dor: "Dorado", Dra: "Draco", Equ: "Equuleus", Eri: "Eridanus", For: "Fornax", Gem: "Gemini", Gru: "Grus", Her: "Hercules", Hor: "Horologium", Hya: "Hydra", Hyi: "Hydrus", Ind: "Indus", Lac: "Lacerta", Leo: "Leo", Lep: "Lepus", Lib: "Libra", LMi: "Leo Minor", Lup: "Lupus", Lyn: "Lynx", Lyr: "Lyra", Men: "Mensa", Mic: "Microscopium", Mon: "Monoceros", Mus: "Musca", Nor: "Norma", Oct: "Octans", Oph: "Ophiuchus", Ori: "Orion", Pav: "Pavo", Peg: "Pegasus", Per: "Perseus", Phe: "Phoenix", Pic: "Pictor", PsA: "Piscis Austrinus", Psc: "Pisces", Pup: "Puppis", Pyx: "Pyxis", Ret: "Reticulum", Scl: "Sculptor", Sco: "Scorpius", Sct: "Scutum", Ser: "Serpens", Sex: "Sextans", Sge: "Sagitta", Sgr: "Sagittarius", Tau: "Taurus", Tel: "Telescopium", Tri: "Triangulum", TrA: "Triangulum Australe", Tuc: "Tucana", UMa: "Ursa Major", UMi: "Ursa Minor", Vel: "Vela", Vir: "Virgo", Vol: "Volans", Vul: "Vulpecula", Ant: "Antlia", Aps: "Apus" };
const KINDS = ["Reach", "Expanse", "March", "Verge", "Deep", "Cluster", "Drift", "Frontier", "Shoals", "Gulf", "Spur", "Hollow", "Rim", "Crossing", "Wilds", "Belt"];

export const clampSize = n => Math.max(MIN_SIZE, Math.min(MAX_SIZE, Math.round(+n) || 300));
export const regionCount = n => n < 30 ? 0 : Math.max(2, Math.min(80, Math.round(n / 21)));

// Scenario centres (round 22): the map can be the N nearest suns to a famous star instead of Sol.
// The star list only reaches 86 ly from Sol, so off-Sol maps are capped at 1,000 suns to stay inside it.
export const CENTRES = ["Sol", "Alpha Centauri", "Barnard's Star", "Sirius", "Epsilon Eridani", "Tau Ceti", "Procyon", "61 Cygni", "Altair", "Fomalhaut", "Vega", "Pollux"];
export const OFF_SOL_MAX = 1000;
export const centreOf = (stars, name) => { const i = stars.systems.findIndex(s => s.name === name); return i < 0 ? 0 : i; };

export function buildMap(stars, size, centre = "Sol") {
  const c = centreOf(stars, centre), origin = stars.systems[c];
  const N = Math.min(clampSize(size), stars.systems.length, c === 0 ? Infinity : OFF_SOL_MAX);
  // gi = the star's place in the 3,000-star list, stable across map sizes and centres (its photo is sky/s<gi>.jpg)
  const ordered = (c === 0 ? stars.systems.map((s, i) => [s, 0, i]) : stars.systems.map((s, i) => [s, (s.x - origin.x) ** 2 + (s.y - origin.y) ** 2 + (s.z - origin.z) ** 2, i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]));
  const systems = ordered.slice(0, N).map(([s, , gi], id) => ({ id, gi, ...s }));
  const d2 = (a, b) => { const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z; return dx * dx + dy * dy + dz * dz; };

  // ---- lanes ----
  // neighbour candidates through a spatial grid (cells of LANE_LY), widening for sparse suns
  const cell = LANE_LY, grid = new Map(), key = (x, y, z) => `${x},${y},${z}`;
  systems.forEach((s, i) => { const k = key(Math.floor(s.x / cell), Math.floor(s.y / cell), Math.floor(s.z / cell)); (grid.get(k) || grid.set(k, []).get(k)).push(i); });
  const near = (i, rCells) => { const s = systems[i], cx = Math.floor(s.x / cell), cy = Math.floor(s.y / cell), cz = Math.floor(s.z / cell), out = [];
    for (let x = cx - rCells; x <= cx + rCells; x++) for (let y = cy - rCells; y <= cy + rCells; y++) for (let z = cz - rCells; z <= cz + rCells; z++) { const g = grid.get(key(x, y, z)); if (g) for (const j of g) if (j !== i) out.push(j); }
    return out; };
  const lanes = new Map(), addLane = (a, b) => { if (a === b) return false; const k = a < b ? a * 4096 + b : b * 4096 + a; if (lanes.has(k)) return false; lanes.set(k, [Math.min(a, b), Math.max(a, b)]); return true; };
  const L2 = LANE_LY * LANE_LY;
  for (let i = 0; i < N; i++) for (const j of near(i, 1)) if (j > i && d2(systems[i], systems[j]) <= L2) addLane(i, j);
  const deg = new Array(N).fill(0); for (const [a, b] of lanes.values()) { deg[a]++; deg[b]++; }
  for (let i = 0; i < N; i++) {
    if (deg[i] >= 2) continue;
    let cand = []; for (let r = 1; cand.length < 3 && r <= 12; r++) cand = near(i, r);
    if (cand.length < 2) cand = [...Array(N).keys()].filter(j => j !== i);
    cand.sort((a, b) => d2(systems[i], systems[a]) - d2(systems[i], systems[b]));
    for (const j of cand) { if (deg[i] >= 2) break; if (addLane(i, j)) { deg[i]++; deg[j]++; } }
  }
  // connectivity: join separate pieces through their closest pair of suns
  const par = [...Array(N).keys()], F = x => par[x] === x ? x : (par[x] = F(par[x]));
  for (const [a, b] of lanes.values()) par[F(a)] = F(b);
  for (let guard = 0; guard < N; guard++) {
    const roots = new Map(); for (let i = 0; i < N; i++) { const r = F(i); (roots.get(r) || roots.set(r, []).get(r)).push(i); }
    if (roots.size <= 1) break;
    const pieces = [...roots.values()].sort((a, b) => a.length - b.length), small = pieces[0], inSmall = new Set(small);
    let best = null, bd = Infinity;
    for (const i of small) for (let j = 0; j < N; j++) if (!inSmall.has(j)) { const d = d2(systems[i], systems[j]); if (d < bd) { bd = d; best = [i, j]; } }
    addLane(best[0], best[1]); deg[best[0]]++; deg[best[1]]++; par[F(best[0])] = F(best[1]);
  }
  const laneList = [...lanes.values()].map(([a, b]) => ({ a, b, ly: Math.round(Math.sqrt(d2(systems[a], systems[b])) * 100) / 100 })).sort((p, q) => p.ly - q.ly);
  const adj = systems.map(() => []); for (const e of laneList) { adj[e.a].push(e.b); adj[e.b].push(e.a); }

  // ---- regions ----
  const K = regionCount(N), cont = new Array(N).fill(0), continents = [];
  if (K === 0) {
    systems.forEach(s => s.continent = -1);
  } else {
    const seeds = [{ x: systems[0].x, y: systems[0].y, z: systems[0].z }];
    const minD = systems.map(s => d2(s, seeds[0]));
    while (seeds.length < K) {   // farthest-point seeding from Sol
      let far = 0; for (let i = 1; i < N; i++) if (minD[i] > minD[far]) far = i;
      const s = systems[far]; seeds.push({ x: s.x, y: s.y, z: s.z });
      for (let i = 0; i < N; i++) minD[i] = Math.min(minD[i], d2(systems[i], s));
    }
    for (let it = 0; it < 30; it++) {
      for (let i = 0; i < N; i++) { let bk = 0, bd = Infinity; for (let k = 0; k < K; k++) { const d = d2(systems[i], seeds[k]); if (d < bd) { bd = d; bk = k; } } cont[i] = bk; }
      const sum = seeds.map(() => ({ x: 0, y: 0, z: 0, n: 0 }));
      for (let i = 0; i < N; i++) { const s = sum[cont[i]], p = systems[i]; s.x += p.x; s.y += p.y; s.z += p.z; s.n++; }
      sum.forEach((s, k) => { if (s.n) seeds[k] = { x: s.x / s.n, y: s.y / s.n, z: s.z / s.n }; });
    }
    const minRegion = Math.max(4, Math.round(N / K / 3));
    for (let pass = 0; pass < 30; pass++) {   // each region joined by its own lanes; small regions fold into a neighbour
      let changed = false;
      for (let k = 0; k < K; k++) {
        const mem = []; for (let i = 0; i < N; i++) if (cont[i] === k) mem.push(i);
        if (!mem.length) continue;
        const memSet = new Set(mem), seen = new Set(), comps = [];
        for (const s of mem) if (!seen.has(s)) { const c = [s]; seen.add(s); for (let h = 0; h < c.length; h++) for (const w of adj[c[h]]) if (memSet.has(w) && !seen.has(w)) { seen.add(w); c.push(w); } comps.push(c); }
        comps.sort((a, b) => b.length - a.length);
        const strays = mem.length < minRegion ? comps : comps.slice(1);
        for (const c of strays) {
          const votes = new Map(); for (const u of c) for (const w of adj[u]) if (cont[w] !== k) votes.set(cont[w], (votes.get(cont[w]) || 0) + 1);
          if (!votes.size) continue;
          const t = [...votes.entries()].sort((a, b) => b[1] - a[1] || a[0] - b[0])[0][0];
          for (const u of c) cont[u] = t; changed = true;
        }
      }
      if (!changed) break;
    }
    // renumber by nearest member to Sol, then name and price each region
    const ids = [...new Set(cont)].sort((a, b) => { const da = Math.min(...systems.filter((s, i) => cont[i] === a).map(s => s.distLy)), db = Math.min(...systems.filter((s, i) => cont[i] === b).map(s => s.distLy)); return da - db; });
    const remap = new Map(ids.map((k, j) => [k, j]));
    systems.forEach((s, i) => s.continent = remap.get(cont[i]));
    const used = new Set();
    ids.forEach((_, k) => {
      const mem = systems.filter(s => s.continent === k);
      let name;
      if (mem.some(s => s.name === centre)) name = centre === "Sol" ? "Solar Core" : `${centre} Core`;
      else {
        const counts = new Map(); for (const s of mem) if (s.con) counts.set(s.con, (counts.get(s.con) || 0) + 1);
        const order = [...counts.entries()].sort((a, b) => b[1] - a[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => NOM[c] || c);
        const pick = order.find(c => !used.has(c));
        name = pick ? `${pick} ${KINDS[k % KINDS.length]}` : `Sector ${k}`;
        if (pick) used.add(pick);
      }
      const border = mem.filter(s => adj[s.id].some(w => systems[w].continent !== k));
      const bonus = Math.max(1, Math.round((mem.length + 2 * border.length) / 6));
      const neighbours = [...new Set(border.flatMap(s => adj[s.id].map(w => systems[w].continent)).filter(c => c !== k))].sort((a, b) => a - b);
      continents.push({ id: k, name, territories: mem.length, borders: border.length, bonus, neighbours });
    });
  }
  return { source: stars.source, laneLengthLy: LANE_LY, size: N, centre: stars.systems[c].name, systems, lanes: laneList, continents };
}
