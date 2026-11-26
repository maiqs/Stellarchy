// Stellarchy 3D map: neon stars, hyperlanes, orbiting fleets, laser fire and debris.
// Ported from the claude.ai version (reference/claude_ai_version.html) to three.js r187 modules.
import * as THREE from "three";
import { OrbitControls } from "three/addons/OrbitControls.js";

export const CLASSES = [
  { key: "frigate", name: "frigate", value: 1 },
  { key: "destroyer", name: "destroyer", value: 5 },
  { key: "battleship", name: "battleship", value: 10 },
  { key: "dreadnought", name: "dreadnought", value: 25 },
];
const FRIGATE_LEN = 1.02;
CLASSES.forEach(c => c.len = FRIGATE_LEN * Math.cbrt(c.value));
export function fleetOf(a) { let left = a; const out = {}; for (const c of CLASSES.slice().reverse()) { out[c.key] = Math.floor(left / c.value); left -= out[c.key] * c.value; } return out; }
const MAXDRAW = { frigate: 4, destroyer: 2, battleship: 2, dreadnought: 6 };

function merge(parts) {
  const pos = [];
  for (const g of parts) { const a = (g.index ? g.toNonIndexed() : g).getAttribute("position").array; for (let k = 0; k < a.length; k++) pos.push(a[k]); }
  const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(pos, 3)); return g;
}
const Z = g => { g.rotateX(Math.PI / 2); return g; };
export const HULLS = [
  { key: "triangle", name: "Triangle", glyph: "▲", make: () => ({
      hull: merge([Z(new THREE.ConeGeometry(.5, 1, 3)).scale(1, .22, 1), new THREE.BoxGeometry(.13, .16, .2).translate(0, .1, -.28)]),
      detail: merge([new THREE.BoxGeometry(.52, .05, .04).translate(0, 0, -.5), new THREE.BoxGeometry(.15, .03, .05).translate(0, .19, -.28)]) }) },
  { key: "brick", name: "Brick", glyph: "■", make: () => ({
      hull: merge([new THREE.BoxGeometry(.58, .58, .58)]),
      detail: merge([[0, 1], [0, -1], [1, 0], [-1, 0]].map(([x, y]) => new THREE.BoxGeometry(x ? .02 : .2, y ? .02 : .2, .2).translate(x * .3, y * .3, .1))) }) },
  { key: "tube", name: "Tube", glyph: "▬", make: () => ({
      hull: merge([Z(new THREE.CylinderGeometry(.1, .1, 1.1, 12)), Z(new THREE.ConeGeometry(.1, .14, 12)).translate(0, 0, .62)]),
      detail: merge([-.36, 0, .36].map(z => new THREE.TorusGeometry(.125, .025, 6, 18).translate(0, 0, z))) }) },
  { key: "orb", name: "Orb", glyph: "●", make: () => ({
      hull: merge([new THREE.IcosahedronGeometry(.34, 1)]),
      detail: merge([new THREE.TorusGeometry(.355, .028, 6, 28).rotateX(Math.PI / 2)]) }) },
  { key: "saucer", name: "Saucer", glyph: "◓", make: () => ({
      hull: merge([new THREE.CylinderGeometry(.5, .44, .09, 30), new THREE.SphereGeometry(.19, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2).translate(0, .04, 0)]),
      detail: merge([new THREE.TorusGeometry(.5, .026, 6, 36).rotateX(Math.PI / 2)]) }) },
];
const HULL_KEYS = HULLS.map(h => h.key);
const seeded = s => () => { s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
const UNCLAIMED = "#eef2ff";   // unclaimed suns are plain white (Paul)

export function createScene({ container, labels, map }) {
  const S = map.systems, n = map.n;
  const P = S.map(s => new THREE.Vector3(s.x, s.z, -s.y));
  const starR = S.map(s => s.name === "Sol" ? .42 : Math.max(.16, Math.min(.5, .2 + Math.log10(1 + s.lum * 40) * .22)));
  const lowPower = matchMedia("(max-width: 700px)").matches || (navigator.hardwareConcurrency || 8) <= 4;

  const renderer = new THREE.WebGLRenderer({ antialias: !lowPower, alpha: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(lowPower ? 1.5 : 2, devicePixelRatio));
  renderer.setClearColor(0x000000, 0);
  container.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(50, 1, 0.1, 900); camera.position.set(44, 34, 58);
  const controls = new OrbitControls(camera, renderer.domElement);
  Object.assign(controls, { enableDamping: true, dampingFactor: .08, minDistance: 4, maxDistance: 210, autoRotateSpeed: .35, zoomSpeed: 1.1 });
  controls.touches = { ONE: THREE.TOUCH.ROTATE, TWO: THREE.TOUCH.DOLLY_PAN };

  // backdrop: faint distance rings and a deep starfield
  { const ringMat = new THREE.LineBasicMaterial({ color: 0x1a2440, transparent: true, opacity: .7 });
    for (const r of [10, 20, 30]) { const pts = []; for (let k = 0; k <= 160; k++) { const t = k / 160 * Math.PI * 2; pts.push(new THREE.Vector3(Math.cos(t) * r, 0, Math.sin(t) * r)); } scene.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), ringMat)); } }
  { const g = new THREE.BufferGeometry(), v = [], c = []; const rnd = seeded(11);
    for (let k = 0; k < 3000; k++) { const u = rnd() * 2 - 1, t = rnd() * Math.PI * 2, r = 320 + rnd() * 80; v.push(Math.sqrt(1 - u * u) * Math.cos(t) * r, u * r, Math.sqrt(1 - u * u) * Math.sin(t) * r);
      const b = .15 + rnd() * .35, tint = rnd(); c.push(b * (tint < .3 ? .8 : 1), b * .9, b * (tint > .7 ? 1.3 : 1)); }
    g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); g.setAttribute("color", new THREE.Float32BufferAttribute(c, 3));
    scene.add(new THREE.Points(g, new THREE.PointsMaterial({ size: 1.1, vertexColors: true, sizeAttenuation: true, depthWrite: false }))); }

  // stars: a solid sphere, an additive glow sprite, and a slightly larger back-face sphere as the sub-colour rim
  const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, "rgba(255,255,255,1)"); gr.addColorStop(.18, "rgba(255,255,255,.55)"); gr.addColorStop(.45, "rgba(255,255,255,.12)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const ringTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 128; const g = c.getContext("2d"); g.strokeStyle = "#fff"; g.lineWidth = 7; g.shadowColor = "#fff"; g.shadowBlur = 10; g.beginPath(); g.arc(64, 64, 50, 0, Math.PI * 2); g.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const starGeo = new THREE.SphereGeometry(1, 20, 14);
  const stars = new THREE.InstancedMesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffffff }), n);
  const rims = new THREE.InstancedMesh(starGeo, new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }), n);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < n; i++) {
    dummy.position.copy(P[i]); dummy.quaternion.identity(); dummy.scale.setScalar(starR[i]); dummy.updateMatrix(); stars.setMatrixAt(i, dummy.matrix);
    dummy.scale.setScalar(starR[i] * 1.12); dummy.updateMatrix(); rims.setMatrixAt(i, dummy.matrix);
    stars.setColorAt(i, new THREE.Color(UNCLAIMED)); rims.setColorAt(i, new THREE.Color("#05070c"));
  }
  scene.add(stars, rims);
  // glows and marks are each one point cloud (one draw call), so 3,000 suns stay smooth:
  // per-point colour, world size and alpha; marks pulse on a shared clock
  const pointLayer = (tex, sizeOf, alpha0) => {
    const g = new THREE.BufferGeometry(), pos = new Float32Array(n * 3), col = new Float32Array(n * 3), size = new Float32Array(n), alpha = new Float32Array(n), pulse = new Float32Array(n);
    P.forEach((p, i) => { pos.set([p.x, p.y, p.z], i * 3); col.set([1, 1, 1], i * 3); size[i] = sizeOf(i); alpha[i] = alpha0; });
    g.setAttribute("position", new THREE.BufferAttribute(pos, 3)); g.setAttribute("color", new THREE.BufferAttribute(col, 3));
    g.setAttribute("size", new THREE.BufferAttribute(size, 1)); g.setAttribute("alpha", new THREE.BufferAttribute(alpha, 1)); g.setAttribute("pulse", new THREE.BufferAttribute(pulse, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: tex }, scale: { value: 1 }, time: { value: 0 } }, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      vertexShader: `attribute float size; attribute float alpha; attribute float pulse; attribute vec3 color; uniform float scale; uniform float time; varying vec3 vC; varying float vA;
        void main() { float p = 0.55 + 0.45 * sin(time * 5.0); vC = color; vA = alpha * mix(1.0, 0.4 + 0.6 * p, pulse);
          vec4 mv = modelViewMatrix * vec4(position, 1.0); gl_PointSize = min(size * (1.0 + 0.08 * p * pulse) * scale / -mv.z, 110.0 * scale / 700.0); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vC; varying float vA; void main() { vec4 t = texture2D(map, gl_PointCoord); gl_FragColor = vec4(vC * t.rgb, t.a * vA); if (gl_FragColor.a < 0.004) discard;
        #include <colorspace_fragment>
      }`,
    });
    const pts = new THREE.Points(g, mat); pts.frustumCulled = false; scene.add(pts); return { pts, col, alpha, pulse, g, mat };
  };
  const glowL = pointLayer(glowTex, i => starR[i] * 6.5, .55);
  // marks: pulsing rings for "you can pick this" (home sun choices, attack targets, your selection)
  const markL = pointLayer(ringTex, i => starR[i] * 4.2 + .6, 0);

  // lanes: drawn faint, with the lanes between regions a little brighter
  const laneVerts = [], gateVerts = [];
  for (const e of map.lanes) { const arr = map.contOf[e.a] === map.contOf[e.b] ? laneVerts : gateVerts; arr.push(P[e.a].x, P[e.a].y, P[e.a].z, P[e.b].x, P[e.b].y, P[e.b].z); }
  const mkLines = (v, color, opacity) => { const g = new THREE.BufferGeometry(); g.setAttribute("position", new THREE.Float32BufferAttribute(v, 3)); const o = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color, transparent: true, opacity, depthWrite: false })); scene.add(o); return o; };
  const lanes = mkLines(laneVerts, new THREE.Color("#4d6a9e"), .32), gates = mkLines(gateVerts, new THREE.Color("#f4e3b5"), .55);
  // the lanes from the selected sun light up in the player's colour
  const hiGeo = new THREE.BufferGeometry(); hiGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(64 * 6), 3));
  const hiLines = new THREE.LineSegments(hiGeo, new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: .95, blending: THREE.AdditiveBlending, depthWrite: false })); hiLines.frustumCulled = false; scene.add(hiLines);

  // ---- board state ----
  let owner = new Array(n).fill(-1), armies = new Array(n).fill(0), hqOf = new Array(n).fill(-1), look = () => ({ main: UNCLAIMED, sub: "#05070c", hull: "triangle" });
  // owner -1 is unclaimed (white); -2 is hidden by fog of war (a dim slate star)
  const FOG_COLOR = "#2c3550";
  const mainOf = p => p === -2 ? FOG_COLOR : p < 0 ? UNCLAIMED : look(p).main, subOf = p => p < 0 ? "#05070c" : look(p).sub;
  const hullOf = p => { const h = p >= 0 && look(p).hull; return HULL_KEYS.includes(h) ? h : HULL_KEYS[Math.max(0, p) % HULLS.length]; };
  const glyphOf = p => HULLS.find(h => h.key === hullOf(p)).glyph;

  // ---- fleets: persistent per system so ships can launch, travel, explode and break apart ----
  const fleetMeshes = {};
  const maxPer = Object.values(MAXDRAW).reduce((a, b) => a + b, 0);
  HULLS.forEach(h => CLASSES.forEach((c, ci) => {
    const d = h.make(); d.hull.scale(c.len, c.len, c.len); d.detail.scale(c.len, c.len, c.len);
    const cap = Math.min(n * MAXDRAW[c.key], 6000);
    const hull = new THREE.InstancedMesh(d.hull, new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    const detail = new THREE.InstancedMesh(d.detail, new THREE.MeshBasicMaterial({ color: 0xffffff }), cap);
    hull.frustumCulled = detail.frustumCulled = false; scene.add(hull, detail);
    const w = new THREE.Color(1, 1, 1); hull.setColorAt(0, w); detail.setColorAt(0, w); hull.count = detail.count = 0;
    fleetMeshes[h.key + ":" + ci] = { hull, detail, count: 0 };
  }));
  const tilt = S.map((s, i) => { const r = seeded(i * 131 + 7); return new THREE.Quaternion().setFromEuler(new THREE.Euler((r() - .5) * 1.3, r() * Math.PI * 2, (r() - .5) * 1.3)); });
  const clock = () => performance.now() / 1000, ease = k => k * k * (3 - 2 * k);
  let fleet = S.map(() => []), dying = [];
  const tmp = new THREE.Vector3(), ahead = new THREE.Vector3(), tgt = new THREE.Vector3();
  const orbitPos = (u, i, t, out) => { const a = u.phase + t * u.speed; return out.set(Math.cos(a) * u.r, 0, Math.sin(a) * u.r).applyQuaternion(tilt[i]).add(P[i]); };
  const unitPos = (u, i, t, out) => { if (!u.from || t >= u.t0 + u.dur) return orbitPos(u, i, t, out); orbitPos(u, i, t, tgt); return out.lerpVectors(u.from, tgt, ease(Math.max(0, (t - u.t0) / u.dur))); };
  function wanted(i) { const out = []; if (owner[i] < 0) return out; const fl = fleetOf(armies[i]); for (let ci = CLASSES.length - 1; ci >= 0; ci--) for (let k = 0; k < Math.min(fl[CLASSES[ci].key], MAXDRAW[CLASSES[ci].key]); k++) out.push(ci); return out; }
  const mkUnit = (i, ci, hk, from, t0, dur) => ({ cls: ci, hk, owner: owner[i], r: starR[i] * 2 + .7 + ci * .55 + (Math.random() < .5 ? 0 : .18), phase: Math.random() * Math.PI * 2, speed: [.9, .6, .42, .28][ci], from, t0, dur });

  function buildFleets(fx = []) {
    const t = clock(), rf = new Set(), moveTo = {}, loss = {};
    for (const f of fx) {
      if (f.t === "rf") rf.add(f.s);
      else if (f.t === "mv") moveTo[f.to] = f.from;
      else if (f.t === "bt") { loss[f.from] = (loss[f.from] || 0) + (f.la || 0); loss[f.to] = (loss[f.to] || 0) + (f.ld || 0); if (f.cap) moveTo[f.to] = f.from; fireBattle(f, t); }
    }
    const pool = {};
    const plans = S.map((s, i) => {
      const want = wanted(i), cur = fleet[i], hk = owner[i] >= 0 ? hullOf(owner[i]) : null;
      const same = cur.length > 0 && cur[0].owner === owner[i] && cur[0].hk === hk;
      const keep = [], removed = [], need = want.slice();
      if (same) for (const u of cur) { const j = need.indexOf(u.cls); if (j >= 0) { need.splice(j, 1); keep.push(u); } else removed.push(u); } else removed.push(...cur);
      let lossLeft = loss[i] || 0;
      removed.sort((a, b) => a.cls - b.cls).forEach(u => {
        const v = CLASSES[u.cls].value, p = unitPos(u, i, t, new THREE.Vector3());
        if (lossLeft > 0 && v <= lossLeft) { lossLeft -= v; dying.push({ u, i, die: t + .45 + Math.random() * .45, kind: "boom" }); }
        else if (lossLeft > 0) { lossLeft = 0; dying.push({ u, i, die: t + .55, kind: "break" }); (pool[i] = pool[i] || []).push({ p, at: t + .55 }); }
        else (pool[i] = pool[i] || []).push({ p, at: t });
      });
      return { keep, need, hk };
    });
    plans.forEach((pl, i) => {
      const units = pl.keep, src = moveTo[i];
      pl.need.forEach((ci, k) => {
        let from, t0 = t, dur;
        if (src !== undefined) { const q = (pool[src] || []).shift(); from = q ? q.p : P[src].clone(); t0 = (q ? q.at : t) + k * .09; dur = 1.25 + Math.random() * .3; }
        else if ((pool[i] || []).length) { const q = pool[i][k % pool[i].length]; from = q.p.clone(); t0 = q.at; dur = .75; }
        else { from = P[i].clone(); t0 = t + k * (rf.has(i) ? .12 : .04); dur = rf.has(i) ? 1.1 : .9; }   // reinforcements launch out of the sun
        units.push(mkUnit(i, ci, pl.hk, from, t0, dur));
      });
      fleet[i] = units;
    });
  }

  // ---- laser fire ----
  const MAXBOLTS = 200;
  const boltGeo = new THREE.BufferGeometry();
  boltGeo.setAttribute("position", new THREE.Float32BufferAttribute(new Float32Array(MAXBOLTS * 6), 3));
  boltGeo.setAttribute("color", new THREE.Float32BufferAttribute(new Float32Array(MAXBOLTS * 6), 3));
  const boltLines = new THREE.LineSegments(boltGeo, new THREE.LineBasicMaterial({ vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  boltLines.frustumCulled = false; scene.add(boltLines);
  let bolts = [];
  function fireBattle(f, t) {
    const shots = Math.min(18, 3 + ((f.la || 0) + (f.ld || 0)) * 2);
    const ca = new THREE.Color(mainOf(f.a)), cd = new THREE.Color(f.d >= 0 ? mainOf(f.d) : "#ffffff");
    for (let k = 0; k < shots; k++) {
      const back = k % 3 === 2 && f.d >= 0, a = back ? f.to : f.from, b = back ? f.from : f.to;
      const jit = () => new THREE.Vector3((Math.random() - .5) * 1.6, (Math.random() - .5) * 1.6, (Math.random() - .5) * 1.6);
      bolts.push({ s: P[a].clone().add(jit()), e: P[b].clone().add(jit()), t0: t + k * .055, dur: .38, c: back ? cd : ca });
    }
    if (bolts.length > MAXBOLTS) bolts = bolts.slice(-MAXBOLTS);
  }
  // ---- explosions and debris ----
  const MAXP = lowPower ? 1400 : 2800;
  const pGeo = new THREE.BufferGeometry();
  const pPos = new Float32Array(MAXP * 3), pCol = new Float32Array(MAXP * 3), pVel = new Float32Array(MAXP * 3), pLife = new Float32Array(MAXP), pBase = new Float32Array(MAXP * 3);
  pGeo.setAttribute("position", new THREE.BufferAttribute(pPos, 3)); pGeo.setAttribute("color", new THREE.BufferAttribute(pCol, 3));
  const sparks = new THREE.Points(pGeo, new THREE.PointsMaterial({ size: .24, vertexColors: true, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false }));
  sparks.frustumCulled = false; scene.add(sparks);
  let pNext = 0;
  function boom(p, who, cls, small) {
    if (quality === 0 && Math.random() < .5) return;   // lite effects: half the explosions throw debris
    const c = new THREE.Color(mainOf(who)), w = new THREE.Color("#ffffff"), sub = new THREE.Color(subOf(who));
    const count = small ? 10 + cls * 6 : 18 + cls * 16, speed = small ? 1.2 : 2.2 + cls * .5;
    for (let k = 0; k < count; k++) {
      const j = pNext; pNext = (pNext + 1) % MAXP;
      const dir = new THREE.Vector3(Math.random() - .5, Math.random() - .5, Math.random() - .5).normalize().multiplyScalar(speed * (.3 + Math.random()));
      pPos.set([p.x, p.y, p.z], j * 3); pVel.set([dir.x, dir.y, dir.z], j * 3);
      const base = k % 4 === 0 ? w : k % 5 === 0 ? sub : c; pBase.set([base.r, base.g, base.b], j * 3); pLife[j] = .7 + Math.random() * .5;
    }
  }

  // ---- labels: names under suns, ship counts inside them ----
  const disp = s => s.name === "Sol" ? "Sol (Earth)" : s.name;
  const lbls = S.map(s => { const d = document.createElement("div"); d.className = "lbl" + (s.name === "Sol" ? " sol" : ""); d.textContent = disp(s); labels.appendChild(d); return d; });
  const cnts = S.map(() => { const d = document.createElement("div"); d.className = "cnt"; labels.appendChild(d); return d; });
  let showAllNames = false, symbols = false, selected = -1, markSet = new Map(), hoverI = -1;

  function paint() {
    const col = new THREE.Color();
    for (let i = 0; i < n; i++) {
      const m = mainOf(owner[i]); stars.setColorAt(i, col.set(m)); glowL.col.set([col.r, col.g, col.b], i * 3);
      rims.setColorAt(i, col.set(subOf(owner[i])));
      const t = (hqOf[i] >= 0 ? "★ " : "") + disp(S[i]); if (lbls[i].textContent !== t) lbls[i].textContent = t;
    }
    stars.instanceColor.needsUpdate = rims.instanceColor.needsUpdate = true; glowL.g.attributes.color.needsUpdate = true;
  }
  function paintHighlight() {
    const arr = hiGeo.attributes.position.array; let k = 0;
    if (selected >= 0) for (const j of map.adj[selected]) { if (k >= 64) break; const a = P[selected], b = P[j]; arr.set([a.x, a.y, a.z, b.x, b.y, b.z], k * 6); k++; }
    hiGeo.setDrawRange(0, k * 2); hiGeo.attributes.position.needsUpdate = true;
    hiLines.material.color.set(selected >= 0 && owner[selected] >= 0 ? mainOf(owner[selected]) : "#ffffff");
  }

  // ---- picking: nearest star on screen within a finger's reach ----
  let down = null, pickCb = () => {}, hoverCb = () => {};
  const v = new THREE.Vector3();
  const screenOf = i => { v.copy(P[i]).project(camera); return v.z >= 1 ? null : [(v.x + 1) / 2 * W, (1 - v.y) / 2 * H]; };
  function nearest(x, y, reach) { let best = -1, bd = reach; for (let i = 0; i < n; i++) { const s = screenOf(i); if (!s) continue; const d = Math.hypot(s[0] - x, s[1] - y); if (d < bd) { bd = d; best = i; } } return best; }
  const el = renderer.domElement;
  el.addEventListener("pointerdown", e => down = [e.clientX, e.clientY, e.pointerType]);
  el.addEventListener("pointerup", e => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 8) return;
    const i = nearest(e.clientX, e.clientY, down[2] === "touch" ? 34 : 20); down = null; pickCb(i, e);
  });
  el.addEventListener("pointermove", e => { if (e.pointerType !== "mouse") return; const i = nearest(e.clientX, e.clientY, 20); if (i !== hoverI) { hoverI = i; el.style.cursor = i >= 0 ? "pointer" : ""; hoverCb(i); } });
  // drag to attack: press on one of your suns that can attack, drag to a target, let go. The camera holds
  // still during the drag (this listens before OrbitControls, in the capture phase), and a glowing line follows.
  let drag = null, dragCfg = null;
  const svgNS = "http://www.w3.org/2000/svg", dragSvg = document.createElementNS(svgNS, "svg"), dragLine = document.createElementNS(svgNS, "line");
  dragSvg.setAttribute("class", "dragline"); dragSvg.appendChild(dragLine); document.body.appendChild(dragSvg);
  container.addEventListener("pointerdown", e => {
    if (!dragCfg || e.button > 0) return;
    const i = nearest(e.clientX, e.clientY, e.pointerType === "touch" ? 34 : 20);
    if (i < 0 || !dragCfg.sources.has(i)) return;
    drag = { from: i, x: e.clientX, y: e.clientY, id: e.pointerId, moved: false, to: -1 }; controls.enabled = false;
  }, true);
  addEventListener("pointermove", e => {
    if (!drag || e.pointerId !== drag.id) return;
    if (!drag.moved && Math.hypot(e.clientX - drag.x, e.clientY - drag.y) < 12) return;
    drag.moved = true;
    const t = nearest(e.clientX, e.clientY, e.pointerType === "touch" ? 40 : 26), ok = t >= 0 && dragCfg.targetsOf(drag.from).has(t);
    drag.to = ok ? t : -1;
    const a = screenOf(drag.from), b = ok ? screenOf(t) : [e.clientX, e.clientY];
    if (!a) return;
    dragLine.setAttribute("x1", a[0]); dragLine.setAttribute("y1", a[1]); dragLine.setAttribute("x2", b[0]); dragLine.setAttribute("y2", b[1]);
    dragSvg.style.setProperty("--dc", dragCfg.color || "#fff"); dragSvg.classList.add("on"); dragSvg.classList.toggle("locked", ok);
  });
  const endDrag = e => {
    if (!drag || (e && e.pointerId !== drag.id)) return;
    const d = drag; drag = null; controls.enabled = true; dragSvg.classList.remove("on", "locked");
    if (d.moved && d.to >= 0) { down = null; dragCfg.onDrop(d.from, d.to); }
  };
  addEventListener("pointerup", endDrag); addEventListener("pointercancel", endDrag);

  let W = 1, H = 1;
  function resize() { W = container.clientWidth; H = container.clientHeight; renderer.setSize(W, H); camera.aspect = W / H; camera.updateProjectionMatrix(); }
  addEventListener("resize", resize); resize();

  let calm = false;
  function glide(to, dist) {
    if (calm) { const off = camera.position.clone().sub(controls.target); if (dist) off.setLength(dist); controls.target.copy(to); camera.position.copy(to.clone().add(off)); return; }   // calm motion: jump, no glide
    const from = controls.target.clone(), t0 = performance.now(), camFrom = camera.position.clone();
    const off = camera.position.clone().sub(controls.target); if (dist) off.setLength(dist);
    const step = t => { const k = Math.min(1, (t - t0) / 700), e = k * (2 - k); controls.target.lerpVectors(from, to, e); if (dist) camera.position.lerpVectors(camFrom, to.clone().add(off), e); if (k < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }

  // ---- frame loop ----
  let lastT = clock(), running = true;
  // adaptive quality: if frames stay slow (under ~45 fps for 2 s), step down: first a lower pixel ratio,
  // then lighter battle effects (half the debris). It never steps back up mid-game, so the picture stays stable.
  let quality = 2, slowFor = 0, ema = 1 / 60;
  function adapt(dt) {
    if (!dt || dt > .5) return;   // ignore pauses (hidden tab, a long first frame)
    ema = ema * .95 + dt * .05;
    slowFor = ema > 1 / 45 ? slowFor + dt : 0;
    if (slowFor > 2 && quality > 0) {
      quality--; slowFor = 0;
      if (quality === 1) { renderer.setPixelRatio(1); resize(); }
    }
  }
  function frame() {
    if (!running) return;
    const t = clock(), dt = Math.min(.1, t - lastT); lastT = t;
    adapt(t - (frame.prev || t)); frame.prev = t;
    controls.update();
    dying = dying.filter(d => { if (t < d.die) return true; unitPos(d.u, d.i, t, tmp); boom(tmp.clone(), d.u.owner, d.u.cls, d.kind === "break"); return false; });
    Object.values(fleetMeshes).forEach(fm => fm.count = 0);
    const col = new THREE.Color();
    const draw = (u, i) => {
      const fm = fleetMeshes[u.hk + ":" + u.cls]; if (!fm) return;
      const idx = fm.count; if (idx >= fm.hull.instanceMatrix.count) return; fm.count++;
      unitPos(u, i, t, tmp); unitPos(u, i, t + .05, ahead); if (ahead.distanceToSquared(tmp) < 1e-8) ahead.set(tmp.x, tmp.y, tmp.z + .01);
      dummy.position.copy(tmp); dummy.scale.setScalar(1); dummy.lookAt(ahead); dummy.updateMatrix();
      fm.hull.setMatrixAt(idx, dummy.matrix); fm.detail.setMatrixAt(idx, dummy.matrix);
      fm.hull.setColorAt(idx, col.set(mainOf(u.owner))); fm.detail.setColorAt(idx, col.set(subOf(u.owner)));
    };
    for (let i = 0; i < n; i++) for (const u of fleet[i]) draw(u, i);
    for (const d of dying) draw(d.u, d.i);
    Object.values(fleetMeshes).forEach(fm => { fm.hull.count = fm.detail.count = fm.count; fm.hull.instanceMatrix.needsUpdate = fm.detail.instanceMatrix.needsUpdate = true; fm.hull.instanceColor.needsUpdate = fm.detail.instanceColor.needsUpdate = true; });
    const bp = boltGeo.attributes.position.array, bc = boltGeo.attributes.color.array; let nb = 0;
    bolts = bolts.filter(b => t < b.t0 + b.dur);
    for (const b of bolts) {
      if (t < b.t0 || nb >= MAXBOLTS) continue;
      const k = (t - b.t0) / b.dur, h = Math.min(1, k), tl = Math.max(0, k - .22), o = nb * 6;
      bp[o] = b.s.x + (b.e.x - b.s.x) * tl; bp[o + 1] = b.s.y + (b.e.y - b.s.y) * tl; bp[o + 2] = b.s.z + (b.e.z - b.s.z) * tl;
      bp[o + 3] = b.s.x + (b.e.x - b.s.x) * h; bp[o + 4] = b.s.y + (b.e.y - b.s.y) * h; bp[o + 5] = b.s.z + (b.e.z - b.s.z) * h;
      bc[o] = b.c.r * .4; bc[o + 1] = b.c.g * .4; bc[o + 2] = b.c.b * .4; bc[o + 3] = Math.min(1, b.c.r + .5); bc[o + 4] = Math.min(1, b.c.g + .5); bc[o + 5] = Math.min(1, b.c.b + .5);
      nb++;
    }
    boltGeo.setDrawRange(0, nb * 2); boltGeo.attributes.position.needsUpdate = boltGeo.attributes.color.needsUpdate = true;
    for (let j = 0; j < MAXP; j++) {
      if (pLife[j] <= 0) { if (pCol[j * 3] || pCol[j * 3 + 1] || pCol[j * 3 + 2]) pCol.fill(0, j * 3, j * 3 + 3); continue; }
      pLife[j] -= dt; const f = Math.max(0, pLife[j]) / 1.1;
      pPos[j * 3] += pVel[j * 3] * dt; pPos[j * 3 + 1] += pVel[j * 3 + 1] * dt; pPos[j * 3 + 2] += pVel[j * 3 + 2] * dt;
      pVel[j * 3] *= .97; pVel[j * 3 + 1] *= .97; pVel[j * 3 + 2] *= .97;
      pCol[j * 3] = pBase[j * 3] * f; pCol[j * 3 + 1] = pBase[j * 3 + 1] * f; pCol[j * 3 + 2] = pBase[j * 3 + 2] * f;
    }
    pGeo.attributes.position.needsUpdate = pGeo.attributes.color.needsUpdate = true;
    // marks pulse; glows breathe a little
    const ps = H * renderer.getPixelRatio() / (2 * Math.tan(camera.fov * Math.PI / 360));   // world size to device pixels
    glowL.mat.uniforms.scale.value = markL.mat.uniforms.scale.value = ps; markL.mat.uniforms.time.value = t;
    renderer.render(scene, camera);
    // labels
    const fovK = (H / 2) / Math.tan(camera.fov * Math.PI / 360);
    for (let i = 0; i < n; i++) {
      v.copy(P[i]).project(camera); const on = v.z < 1 && Math.abs(v.x) < 1.1 && Math.abs(v.y) < 1.1;
      const x = (v.x + 1) / 2 * W, y = (1 - v.y) / 2 * H, dist = on ? camera.position.distanceTo(P[i]) : 1;
      const rpx = on ? starR[i] * 1.12 * fovK / dist : 0;
      const l = lbls[i], showL = on && (showAllNames || dist < 26 || S[i].name === "Sol" || i === selected || i === hoverI || hqOf[i] >= 0 || (markSet.size <= 30 && markSet.has(i)));
      if (!showL) { if (l._v !== 0) { l.style.display = "none"; l._v = 0; } } else { if (l._v !== 1) { l.style.display = ""; l._v = 1; } l.style.transform = `translate(${x}px, ${y + rpx + 3}px) translate(-50%, 0)`; }
      const c = cnts[i], mk = markSet.get(i), txt = mk && mk.text ? mk.text : (symbols && owner[i] >= 0 ? glyphOf(owner[i]) : "") + armies[i];
      if (!on || rpx < 5 || (owner[i] < 0 && !(mk && mk.text))) { if (c._v !== 0) { c.style.display = "none"; c._v = 0; } continue; }
      if (c._v !== 1) { c.style.display = ""; c._v = 1; }
      c.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      if (c.textContent !== txt) c.textContent = txt;
      const fs = Math.round(Math.min(44, Math.max(8, rpx * (txt.length > 2 ? .72 : txt.length > 1 ? .95 : 1.15)))); if (c._fs !== fs) { c.style.fontSize = fs + "px"; c._fs = fs; }
      const colr = mk && mk.text ? "#f4e3b5" : subOf(owner[i]); if (c._c !== colr) { c.style.color = colr; c._c = colr; }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  return {
    P, starR, camera, controls, renderer, layers: { glowL, markL },
    setBoard(b, lookFn, events) {
      owner = b.owner.slice(); armies = b.armies.slice(); look = lookFn;
      hqOf = new Array(n).fill(-1); (b.hq || []).forEach((h, k) => { if (h >= 0 && owner[h] === k) hqOf[h] = k; });
      paint(); buildFleets(events || []); paintHighlight();
    },
    clearBoard() { owner = new Array(n).fill(-1); armies = new Array(n).fill(0); hqOf = new Array(n).fill(-1); fleet = S.map(() => []); dying = []; paint(); },
    // marks: Map(i -> {color, strong, text})
    setMarks(m) {
      const col = new THREE.Color();
      for (const [i] of markSet) if (!m.has(i)) markL.alpha[i] = 0;
      markSet = m;
      for (const [i, c] of m) { col.set(c.color || "#ffffff"); markL.col.set([col.r, col.g, col.b], i * 3); markL.alpha[i] = c.strong ? .95 : .9; markL.pulse[i] = c.strong ? 0 : 1; }
      markL.g.attributes.color.needsUpdate = markL.g.attributes.alpha.needsUpdate = markL.g.attributes.pulse.needsUpdate = true;
    },
    select(i) { selected = i; paintHighlight(); },
    focus(i, dist) { glide(P[i].clone(), dist); },
    home() { glide(new THREE.Vector3(0, 0, 0), 80); },
    onPick(fn) { pickCb = fn; }, onHover(fn) { hoverCb = fn; },
    // drag to attack: {sources: Set of suns, targetsOf(from) -> Set, onDrop(from, to), color}, or null to turn it off
    setDrag(cfg) { dragCfg = cfg; },
    get quality() { return quality; },
    pickAt(x, y, touch) { return nearest(x, y, touch ? 34 : 20); },   // the sun under a screen point, or -1
    setAutoRotate(on) { controls.autoRotate = on; },
    setAllNames(on) { showAllNames = on; },
    setSymbols(on) { symbols = on; },
    setCameraSpeed(k) { controls.rotateSpeed = k; controls.zoomSpeed = 1.1 * k; controls.panSpeed = k; },
    setCalm(on) { calm = on; if (on) controls.autoRotate = false; controls.enableDamping = !on; },   // colour-blind help: each holder's ship symbol beside the count
    screenOf,
    dispose() { dragSvg.remove(); running = false; removeEventListener("resize", resize); renderer.dispose(); renderer.domElement.remove(); labels.innerHTML = ""; scene.traverse(o => { if (o.geometry) o.geometry.dispose(); if (o.material) o.material.dispose(); }); },
  };
}
