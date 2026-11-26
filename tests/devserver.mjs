// Starts a private local dev server for a test or tool, on its own port with its own storage,
// so it never touches the preview on 8787. Round 40: shared by the browser tests and the screenshot tool.
import { spawn, execSync } from "node:child_process";

const sleep = ms => new Promise(r => setTimeout(r, ms));
export async function startDevServer(port, store, { timeoutMs = 60000 } = {}) {
  const proc = spawn("npx", ["wrangler", "dev", "--port", String(port), "--ip", "127.0.0.1", "--persist-to", `.wrangler/${store}`],
    { cwd: new URL("..", import.meta.url), shell: true, stdio: ["ignore", "pipe", "pipe"] });
  let ready = false; proc.stdout.on("data", d => { if (String(d).includes("Ready on")) ready = true; });
  const stop = () => { try { execSync(`taskkill /pid ${proc.pid} /T /F`, { stdio: "ignore" }); } catch (e) {} };
  for (let t = 0; t < timeoutMs && !ready; t += 500) await sleep(500);
  if (!ready) { stop(); throw new Error(`dev server on port ${port} did not start`); }
  return { base: `http://127.0.0.1:${port}`, stop };
}
