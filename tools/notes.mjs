// Notes to the developer: fetch new notes from the game and append them to running markdown files in feedback/.
// A new file starts every ~20,000 characters (feedback/notes-001.md, notes-002.md, ...), so each one is a comfortable read.
//
// Usage:  .\run.ps1 notes                      (the local dev server on 8787, key from .dev.vars)
//         .\run.ps1 notes https://stellarchy.<name>.workers.dev   (the live game; key from the file .notes-key)
//
// The live game's key is set once with:  npx wrangler secret put NOTES_KEY   (then save the same text in .notes-key).
// feedback/ and .notes-key stay on this computer (both are in .gitignore): players' notes are never published.
import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from "node:fs";

const root = new URL("..", import.meta.url), at = p => new URL(p, root);
const base = (process.argv[2] || "http://127.0.0.1:8787").replace(/\/+$/, "");
const local = /^http:\/\/(127\.0\.0\.1|localhost)/.test(base);
const readKey = () => {
  if (process.env.NOTES_KEY) return process.env.NOTES_KEY.trim();
  if (!local && existsSync(at(".notes-key"))) return readFileSync(at(".notes-key"), "utf8").trim();
  if (local && existsSync(at(".dev.vars"))) { const m = readFileSync(at(".dev.vars"), "utf8").match(/^NOTES_KEY=(.*)$/m); if (m) return m[1].trim(); }
  return "";
};
const key = readKey();
if (!key) { console.log(local ? "No NOTES_KEY in .dev.vars." : "No key: save the live game's NOTES_KEY in a file called .notes-key in the stellarchy folder."); process.exit(1); }

const dir = at("feedback/"); mkdirSync(dir, { recursive: true });
const stateFile = at(`feedback/.last-note${local ? "-local" : ""}`);
const after = existsSync(stateFile) ? +readFileSync(stateFile, "utf8") || 0 : 0;
const r = await fetch(`${base}/api/notes?after=${after}`, { headers: { "x-notes-key": key } }).catch(e => ({ ok: false, status: e.message }));
if (!r.ok) { console.log(`Could not read notes from ${base} (${r.status}).`); process.exit(1); }
const { notes } = await r.json();
if (!notes.length) { console.log("No new notes."); process.exit(0); }

const KIND = { bug: "🐞 Bug", idea: "💡 Idea", love: "💜 Love it", other: "💬 Other" };
const ROLL = 20000;
const files = readdirSync(dir).filter(f => /^notes-\d{3}\.md$/.test(f)).sort();
let n = files.length ? +files.at(-1).slice(6, 9) : 1, file = at(`feedback/notes-${String(n).padStart(3, "0")}.md`);
let text = existsSync(file) ? readFileSync(file, "utf8") : "";
const header = k => `# Stellarchy: notes from players (part ${k})\n\nNewest at the bottom. Each note: number, time (UTC), kind, who, and where they were in the game.\n`;
if (!text) text = header(n);
for (const x of notes) {
  const c = x.context || {}, where = [c.solo ? "solo game" : c.room ? `room ${c.room}` : "", c.status, c.turn ? `turn ${c.turn}` : "", c.screen ? `screen ${c.screen}` : ""].filter(Boolean).join(" · ");
  const entry = `\n---\n\n## #${x.id} · ${KIND[x.kind] || x.kind} · ${x.at.replace("T", " ").slice(0, 16)}\n\n*${x.name ? x.name.replace(/[*_`<>]/g, "") : "Anonymous"}${where ? ` · ${where}` : ""}*\n\n${x.text.split("\n").map(l => "> " + l).join("\n")}\n`;
  if (text.length + entry.length > ROLL && text.length > header(n).length) {
    writeFileSync(file, text); n++; file = at(`feedback/notes-${String(n).padStart(3, "0")}.md`); text = header(n);
  }
  text += entry;
}
writeFileSync(file, text);
writeFileSync(stateFile, String(notes.at(-1).id));
console.log(`${notes.length} new note${notes.length === 1 ? "" : "s"} saved. Latest file: feedback/notes-${String(n).padStart(3, "0")}.md`);
