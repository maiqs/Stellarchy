// Copies everything the page needs into client/: the shared rules, the star map, three.js and the fonts.
// Run by run.ps1 before dev and test. The copies in client/ are generated: edit shared/ and data/, not these.
import { cpSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
const root = new URL("../", import.meta.url), at = p => new URL(p, root);
const copy = (from, to) => { mkdirSync(new URL(".", at(to)), { recursive: true }); cpSync(at(from), at(to), { recursive: true }); };

rmSync(at("client/shared"), { recursive: true, force: true });
copy("shared/", "client/shared/");
copy("data/stars.json", "client/data/stars.json");
copy("node_modules/three/build/three.module.js", "client/vendor/three.module.js");
copy("node_modules/three/build/three.core.js", "client/vendor/three.core.js");
copy("node_modules/three/examples/jsm/controls/OrbitControls.js", "client/vendor/OrbitControls.js");
copy("node_modules/three/LICENSE", "client/vendor/three.LICENSE.txt");
const fonts = [
  ["@fontsource/chakra-petch", "chakra-petch-latin-500-normal.woff2"], ["@fontsource/chakra-petch", "chakra-petch-latin-700-normal.woff2"],
  ["@fontsource/ibm-plex-sans", "ibm-plex-sans-latin-400-normal.woff2"], ["@fontsource/ibm-plex-sans", "ibm-plex-sans-latin-500-normal.woff2"],
  ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-500-normal.woff2"], ["@fontsource/ibm-plex-mono", "ibm-plex-mono-latin-700-normal.woff2"],
];
for (const [pkg, f] of fonts) copy(`node_modules/${pkg}/files/${f}`, `client/fonts/${f}`);
copy("node_modules/@fontsource/chakra-petch/LICENSE", "client/fonts/OFL-chakra-petch.txt");
copy("node_modules/@fontsource/ibm-plex-sans/LICENSE", "client/fonts/OFL-ibm-plex.txt");
console.log("synced shared/, data/, three.js and fonts into client/");

// service worker: every file the page needs, and a version that changes whenever any of them does
import { readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
const clientDir = at("client/"), files = [], hash = createHash("sha256");
(function walk(rel) {
  for (const f of readdirSync(new URL(rel, clientDir)).sort()) {
    const r = rel + f, st = statSync(new URL(r, clientDir));
    if (st.isDirectory()) { if (r !== "sky") walk(r + "/"); }   // star photos (~25 MB) are cached when first seen, not at install
    else if (!/^(sw\.js|.*\.txt|.*\.md)$/.test(f)) { files.push("/" + r); hash.update(r); hash.update(readFileSync(new URL(r, clientDir))); }
  }
})("");
files.unshift("/");
const version = hash.digest("hex").slice(0, 12);
writeFileSync(at("client/sw.js"), readFileSync(at("tools/sw.src.js"), "utf8").replace("__VERSION__", version).replace("__FILES__", JSON.stringify(files)));
console.log(`service worker ${version}: ${files.length} files`);
