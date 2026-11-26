// Play on your phone: starts a dev server your phone can reach on the same Wi-Fi (port 8790, its own storage,
// so the preview on 8787 is untouched) and prints the address and a QR code to scan.
// Windows may ask once to let it through the firewall: allow it on Private networks only. Ctrl+C stops it.
// Offline/install mode (the service worker) needs https, so on the phone it plays online-only; everything else works.
import { spawn } from "node:child_process";
import { networkInterfaces } from "node:os";
import QRCode from "qrcode";

const PORT = 8790;
const lan = Object.values(networkInterfaces()).flat().filter(a => a && a.family === "IPv4" && !a.internal && /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(a.address)).map(a => a.address);
if (!lan.length) { console.log("No home-network address found. Is this computer on Wi-Fi or Ethernet?"); process.exit(1); }
const url = `http://${lan[0]}:${PORT}/`;
const server = spawn("npx", ["wrangler", "dev", "--port", String(PORT), "--ip", "0.0.0.0", "--persist-to", ".wrangler/phone"], { cwd: new URL("..", import.meta.url), shell: true, stdio: ["ignore", "pipe", "inherit"] });
server.stdout.on("data", async d => {
  if (!String(d).includes("Ready on")) return;
  console.log(`\n  Stellarchy is ready for your phone. On the same Wi-Fi, open:\n\n    ${url}\n`);
  console.log(await QRCode.toString(url, { type: "terminal", small: true }));
  if (lan.length > 1) console.log(`  (other addresses on this computer: ${lan.slice(1).join(", ")})`);
  console.log("  Press Ctrl+C to stop.\n");
});
process.on("SIGINT", () => { server.kill(); process.exit(0); });
