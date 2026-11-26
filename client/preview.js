// A small live 3D preview for the look editor: a sun in your main colour with its highlight rim and glow,
// and one ship of each class in your hull style orbiting it, so you can see how your choices look in play.
import * as THREE from "three";
import { HULLS, CLASSES } from "./scene.js";

export function createShipPreview(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, devicePixelRatio)); renderer.setClearColor(0x000000, 0);
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(40, 2, .1, 100);
  camera.position.set(0, 3.3, 8.6); camera.lookAt(0, -.15, 0);
  // the sun: a solid sphere, a slightly larger back-face sphere for the rim, and a soft glow
  const sun = new THREE.Mesh(new THREE.SphereGeometry(.55, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  const rim = new THREE.Mesh(new THREE.SphereGeometry(.62, 32, 20), new THREE.MeshBasicMaterial({ color: 0xffffff, side: THREE.BackSide }));
  const glowTex = (() => { const c = document.createElement("canvas"); c.width = c.height = 64; const g = c.getContext("2d"), gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, "rgba(255,255,255,.9)"); gr.addColorStop(.4, "rgba(255,255,255,.25)"); gr.addColorStop(1, "rgba(255,255,255,0)"); g.fillStyle = gr; g.fillRect(0, 0, 64, 64);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
  const glow = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xffffff, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending })); glow.scale.setScalar(3.2);
  scene.add(glow, rim, sun);
  let ships = [], hullKey = null, running = true;
  const tilt = new THREE.Quaternion().setFromEuler(new THREE.Euler(.35, 0, -.15));
  function build(key) {
    for (const s of ships) { scene.remove(s.g); s.g.traverse(o => { if (o.geometry) o.geometry.dispose(); }); }
    const h = HULLS.find(x => x.key === key) || HULLS[0];
    ships = CLASSES.map((c, ci) => {
      const d = h.make(ci), len = .62 * Math.cbrt(c.value) * .9, g = new THREE.Group();
      const hull = new THREE.Mesh(d.hull, new THREE.MeshBasicMaterial({ color: 0xffffff })), detail = new THREE.Mesh(d.detail, new THREE.MeshBasicMaterial({ color: 0xffffff }));
      g.add(hull, detail); g.scale.setScalar(len); scene.add(g);
      return { g, hull, detail, r: 1.05 + ci * .42, speed: [.9, .6, .45, .32][ci], phase: ci * 1.7 };
    });
    hullKey = key;
  }
  const ahead = new THREE.Vector3();
  function frame(t) {
    if (!running) return;
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (w && h && (canvas.width !== Math.round(w * renderer.getPixelRatio()) || canvas.height !== Math.round(h * renderer.getPixelRatio()))) { renderer.setSize(w, h, false); camera.aspect = w / h; camera.updateProjectionMatrix(); }
    const s = t / 1000;
    for (const p of ships) {
      const a = p.phase + s * p.speed, b = a + .05;
      p.g.position.set(Math.cos(a) * p.r, 0, Math.sin(a) * p.r).applyQuaternion(tilt);
      ahead.set(Math.cos(b) * p.r, 0, Math.sin(b) * p.r).applyQuaternion(tilt); p.g.lookAt(ahead);
    }
    renderer.render(scene, camera); requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return {
    update(look) {
      if (look.hull !== hullKey) build(look.hull);
      sun.material.color.set(look.main); glow.material.color.set(look.main); rim.material.color.set(look.sub);
      for (const p of ships) { p.hull.material.color.set(look.main); p.detail.material.color.set(look.sub); }
    },
    dispose() { running = false; renderer.dispose(); renderer.forceContextLoss(); },
  };
}
