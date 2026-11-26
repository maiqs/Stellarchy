# Stellarchy

A free-to-play browser game (formerly Three Hundred Suns): a neon 3D war for Sol and the nearest real star systems. Players join rooms with a link and need no account.

- **Run it locally:** `.\run.ps1 dev`, then open http://127.0.0.1:8787. Play vs AI also works without the server.
- **Tests:**
  - `.\run.ps1 test` runs the rules and bots.
  - `.\run.ps1 soak` runs all-AI games.
  - `.\run.ps1 room` runs the room checks; it needs `dev` running.
- **Layout:**
  - `shared/` holds the rules, map helpers and bots, used by both server and page.
  - `server/` holds the Worker, plus the `Room` and `Lobby` Durable Objects.
  - `client/` is the page. `tools/sync.mjs` copies `shared/`, the star map, three.js and the fonts into it.
- **Plan:** see `TODO.md`. `reference/` holds the claude.ai version this grew from.
- **Credits:**
  - `data/star_map.json` comes from the HYG Database v4.1 by David Nash (CC BY-SA 4.0).
  - three.js is MIT-licensed.
  - Chakra Petch and IBM Plex are OFL-licensed.

## Sound
Stellarchy's sounds are synthesised in the browser (client/sound.js); there are no audio files.

## Testing notes
- Run `.\run.ps1 room` with nothing else using the dev server. Syncing files (which reloads assets) or driving pages against it mid-run stalls its games.
- The service worker only runs locally with `?sw` in the address. After trying it, unregister it in the browser, or it keeps serving cached files on localhost.

## Image credits
- Star photos (`client/sky/s*.jpg`): 2MASS, the Two Micron All Sky Survey (University of Massachusetts and IPAC/Caltech, funded by NASA and the NSF), cut out with the CDS hips2fits service. To refetch, run `node tools/fetch_sky.mjs`; it is polite and resumable.
- `client/sky/famous/`:
  - Alpha Centauri: ESA/Hubble & NASA, potw1635a
  - Sirius: NASA, ESA, H. Bond (STScI) and M. Barstow (University of Leicester), heic0516a
  - Fomalhaut: NASA, ESA and P. Kalas (UC Berkeley), heic0821a
  - All three are CC BY 4.0 via esahubble.org.
- The Sun: NASA/SDO and the AIA, EVE and HMI science teams (public domain).

## Notes to the developer

Players can leave a note (🐞 Bug, 💡 Idea, 💜 Love it, or 💬 Other) from the title page or the in-game Menu. A note can be up to 2,000 characters, and each visitor can send 5 an hour. Visitors' addresses are used only for that limit and are never stored.

- **Read them:** `.\run.ps1 notes https://<the live address>` appends new notes to `feedback/notes-001.md`, `notes-002.md` and so on, starting a new file every ~20,000 characters. With no address it reads the local dev server.
- **The key:** reading needs a secret key. Set it once on Cloudflare with `npx wrangler secret put NOTES_KEY`, and save the same text in a file called `.notes-key` here. Locally the key is in `.dev.vars`.
- **Privacy:** `feedback/` and `.notes-key` are in `.gitignore`, so players' notes never go to GitHub.
