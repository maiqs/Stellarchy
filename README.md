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
