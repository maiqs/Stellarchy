# Stellarchy: TODO

A free-to-play browser game: a neon 3D war for Sol and the 10 to 3,000 nearest real star systems (a map-size slider), in rooms anyone can join with a link and no account (Paul, 2026-11-25).

It grows out of the claude.ai artifact version (https://claude.ai/artifact/48NmVWuctU1njsyJ3szB9m, source in `reference/claude_ai_version.html`). That version needs a claude.ai sign-in to play, and it stays as it is.

Never call it "Risk" anywhere: in the game, the store page or the code (Hasbro trademark).

## Paul's requirements (2026-11-25)
- **Free to play:** no paywalls, no ads planned.
- **Anyone can play:** in a browser, with no account. Pick a name, colours and a hull, then go.
- **Rooms:** a room code and a share link (`/r/KXQ7`), public rooms in a lobby, private rooms by link only.
- **Gorgeous UI:** keep and push the neon, simulation look. It should feel finished, not like a debug panel.
- **Any screen size:** phone (portrait and landscape), tablet, laptop, ultrawide. Touch and mouse both feel natural.
- **Intuitive:** a new player understands their turn without reading rules. Show what to do next, not a wall of buttons.

## Plan
Host it on Cloudflare's free plan. Workers serves the page, and each room is one Durable Object that owns the game.

1. **Tools**
   - [x] Node.js 26.13.1 LTS: the portable zip from nodejs.org (hash checked) in `Documents	ools
ode`, because the MSI needed an admin prompt. `run.ps1` puts it on PATH.
   - [x] Wrangler (Cloudflare's CLI, via npm).
   - [x] Run everything locally with `wrangler dev`. No account and nothing public until Paul says go.
2. **Project layout**
   - [x] `client/`: the page (Three.js, the same r128 neon renderer to start).
   - [x] `server/`: the Worker plus the `Room` Durable Object.
   - [x] `shared/`: the rules (`rules.js`), the map helpers (`map.js`) and the bots (`bot.js`), used by both.
   - [ ] `data/star_map.json`: 301 systems, lanes and continents. HYG v4.1, CC BY-SA 4.0, credited.
   - [x] `run.ps1`: test, soak and dev.
3. **Server owns the game**
   - [x] Clients send intents (`place`, `attack`, `move`, `fortify`, `trade`, `endTurn`). The room checks them, rolls the dice, and broadcasts the state and the fx events over WebSocket.
   - [x] A late joiner gets the full state on connect.
   - [x] Reconnect keeps your seat: a per-browser player token in localStorage, no account. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
   - [x] Bots run in the room on alarms, so a game keeps going when every tab closes.
4. **Rooms and lobby**
   - [x] Create a room (public or private, seats 2–16, start mode, win %, an all-computer game option). Get a code and a copy-link button. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
   - [x] The lobby lists open public rooms only: seats free, started or not. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
   - [x] Join by code or link. The creator can add or remove bots and start the game. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
   - [ ] A spectator mode for full or running rooms.
4b. **Map size slider (Paul, 2026-11-25): 10 to 3,000 suns**
   - [ ] **Data:** rebuild the star file with the 3,000 nearest systems, sorted by distance from Sol. The C# builder in `../star_diplomacy/tools` has a 16 pc cap; lift it to about 35 pc. The file is about 400 KB raw and about 100 KB gzipped.
     - Beyond about 20 pc, HYG misses many faint red dwarfs, so big maps lean toward brighter stars. Say so on the credits or info page.
   - [ ] **Map built per room:** port the lane and continent code to `shared/` in JS. A room of size N takes the first N systems and builds:
     - lanes within 7 ly, plus a minimum of 2 links per star, plus spanning connectivity
     - about N÷20 continents, clamped 1–40, with bonuses
     - the same map every time for the same N
   - [ ] **The slider:** a log scale snapping to 10, 25, 50, 100, 200, 300, 500, 1000, 2000 and 3000. It shows the estimated game length, about 1–2 minutes per sun per player.
   - [ ] **Rules that bend with size:**
     - minimum suns = 4 per seat, so the slider's floor rises with player count
     - HQ spacing shrinks on small maps (4 jumps at 100 or more suns, 2 at 10)
     - small maps have no continents
   - [ ] **Big maps (1,000+):**
     - stars drawn as one InstancedMesh
     - names and army counts only near the camera, or on hover or select
     - fleets capped per star
     - the server sends changes, not the whole board
     - win-% presets lower by default
   - [ ] **Tests:**
     - every size from 10 to 3,000 builds a connected map
     - all-bot games finish at 10, 300 and 3,000
     - 60 fps on a mid phone at 3,000
4c. **AI seats and play styles (Paul, 2026-11-25)**
   - [ ] **All-AI games** default to total conquest (100%). Human games keep the win-% choice.
   - [ ] **AI takes over a seat** when its player steps away: they disconnect, or miss a turn timer. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
     - The seat keeps the player's name, colours and token. The seat row shows a small "AI" badge ("Ana (AI playing)").
     - The bot plays in that player's preferred style.
   - [ ] **The player can return** to their seat at any time with the same browser token, or a rejoin link. They take control back at once. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
     - If the bot is mid-turn, it finishes its current attack and hands over. No turn is lost.
     - A "Let AI play for me" toggle lets a player hand over on purpose (to grab a coffee).
   - [ ] **Play styles**, on the main menu (the five style tunings are in `shared/bot.js`; the menu is not built yet): the player picks a preferred style, saved in the browser. It shows as a little icon on their seat. The same styles drive the computer players, which get one at random or the creator sets it per bot.
     - **Aggressive:** attacks at lower odds, chases eliminations, keeps few ships at home.
     - **Defensive:** stacks the borders, attacks only at strong odds, holds its continents.
     - **Card hunter:** takes one system every turn to earn a card, saves for big trades, and targets weak players holding many cards.
     - **Territorial (expansion):** grabs as many systems as possible and goes for continent bonuses.
     - **Balanced:** the current bot, as the default.
     - Each style is a set of weights: attack-odds threshold, border reserve, card priority, continent priority, elimination priority. That is one bot brain, five tunings.
   - [ ] **Tests:** all-bot games for each style (they all must finish); a style head-to-head report (win rates); a takeover-and-return test mid-turn.
5. **Fair play**
   - [x] Only the seated player whose turn it is can act. The server rolls all dice.
   - [x] Turn timer: a player who stays quiet is auto-skipped (a bot can play their turn after N misses).
   - [x] Rate limits per connection. Names are length-limited and escaped.
   - [ ] Empty rooms close after a while. Finished rooms are kept briefly to show the result, then removed.
6. **UI pass (the big one)**
   - [x] Full-screen 3D map. The UI floats on it as neon glass panels, with no big side columns.
   - [x] One clear action bar at the bottom: "YOUR TURN: place 7 ships" → "Attack or end" → "Fortify". Big touch targets.
   - [ ] Tap a star to select it; neighbours light up as targets. Drag or tap to attack, with a dice animation and the result inline. *(Round 3: tap to select, then tap a target, is done; drag-to-attack and a dice animation are not.)*
   - [x] Collapsible drawers: players, cards, log. Hidden by default on phones.
   - [ ] Responsive layout: portrait phone, landscape phone, tablet, desktop. Test at 360×640, 390×844, 768×1024, 1366×768, 1920×1080, 3440×1440. *(Round 3: checked at phone portrait and 1024×768. Other sizes still to test.)*
   - [ ] First-game hints: three short coach marks, dismissable, shown once.
   - [x] A title screen with a slowly turning star map, plus Play / Create room / Join by code.
   - [ ] Settings: bot speed, camera sensitivity, reduced motion, colour-blind-friendly outlines.
   - [ ] Performance: cap the pixel ratio on phones and keep 60 fps on a mid phone. Fall back to fewer effects.
   - [x] Credits page: HYG (CC BY-SA 4.0), Three.js (MIT), anything else used.
7. **Tests**
   - [x] Rules tests in `tests/rules.test.js` (10 checks: setup spacing, illegal moves, cards, 2-, 4-, 9- and 16-way games to total conquest, dealt win target, AI hand-back).
   - [ ] Room tests: two to sixteen fake clients through a whole game, reconnects, timeouts, bad intents rejected. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
   - [x] An all-bot soak test (`run.ps1 soak`): 60 of 60 games finish, with a median of 1,712 turns.
   - [ ] Screenshots at every screen size above.
8. **Going public (Paul only)**
   - [ ] Paul makes a free Cloudflare account and signs in himself. Then `wrangler deploy` happens only on his go.
   - [ ] Check the free plan's current limits (Workers requests, Durable Object requests and storage) against about 300 players.
   - [ ] A small friends test (5–10 people) before sharing widely.

## Open for Paul
- A domain? The free one is `<name>.workers.dev`; a custom domain costs money, so skip it unless he wants one.
- Name: **Stellarchy** (agreed with Paul, 2026-11-25). Players are "Stellarchs"; "Stellarch" alone belongs to another game (stellarch.io). Run a proper trademark search before going public.
- Should rooms have chat? (It needs moderation; the default is no chat, just quick emotes.)


## Player wishes (online research, 2026-11-25)
Paul: look online for features people want and give them to people. I looked at Warzone's feature-request forum, Board Game Arena bug reports, and Steam threads for the big official conquest game. These are forum anecdotes, not surveys. Re-check every round ending in 5.
- [ ] **Never freeze on a quitter.** The top complaint everywhere is games stuck on a departed player's turn. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
  - AI takeover (step 4c) covers it. Also show a plain "Skipping in 10 s" so nobody waits blind.
- [ ] **Fair, server-side timers with a grace period.** Board Game Arena players got booted by a timer that ran out before their turn even showed. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
  - Run the clock on the room and start it only once the turn has reached the client.
  - Add extra time when there are many ships to place.
  - Show "time banks" rather than an instant kick.
- [ ] **Timer choice per room:** none (friends), 90 s, 3 min, or a long-turn mode (12 or 24 h) where AI covers a missed turn. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
  - Long turns need turn alerts: the browser notification API, a flashing tab title and a sound. Email needs accounts, so skip it. *(Round 3: the browser notification and the tab title are done; a sound is not.)*
- [ ] **No pay-to-play limits, ever.** The big official game's most common complaint is free-tier token caps.
  - Say it on the title screen: "Free. No tokens, no timers on how much you play."
- [x] **Solo play against AI with no server.** The rules are shared, so a solo game can run fully in the browser.
  - Offline play is also a frequent ask. Make it work offline as an installable web app.
- [ ] **Quick play:** one button joins an open room or starts one filled with bots that people can replace.
- [ ] **Quick chat and emotes.** Players ask for "quick chats". Use preset lines and emotes, with no free text to moderate. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
- [ ] **Finding things on big maps:** *(Round 3: search by name, plus "My home sun" and "My busiest border", are done; pins and the region list are not.)*
  - search for a sun by name
  - pin suns
  - jump to "my borders" and "my home sun"
  - a region list showing bonuses and who holds what
- [ ] **Bigger games:** Warzone players ask for 60–100 players. Consider up to 32 seats on maps of 500 suns or more.
- [ ] **Fog of war as a room option.** It's a Warzone staple: you see only your suns and their neighbours.
- [ ] **End-of-game screen:**
  - a graph of systems held over time
  - each player's best moment
  - a replay you can scrub through
- [ ] **Speed controls:** skip animations, and watch bots at speed.
- [x] **Undo before confirm:** take back placements until you press Confirm.
- [ ] **Later:** a map editor and custom scenarios, which are big in Warzone.

Sources:
- https://warlight.uservoice.com/forums/77051-warzone-features/filters/hot
- https://www.warzone.com/Forum/323804-warzone-feature-list?Offset=20
- https://sv.boardgamearena.com/bug?id=155996
- https://it.boardgamearena.com/bug?id=171910
- https://boardgamegeek.com/wiki/page/PLAY_ONLINE
- https://steamcommunity.com/app/1128810/discussions/0/1743393963178028328

## Bugs and balance
- [ ] **Styles are uneven** (soak). Win rate per seat, against a fair share of about 10%:
  - Round 1: aggressive 25.9%, territorial 14.7%, balanced 5.2%, card hunter 5.2%, defensive 0.9%.
  - Round 2, after tuning, 80 games: defensive 16.5%, aggressive 12.7%, territorial 9.6%, balanced 7.0%, card hunter 5.1%.
  - Hand-tuning is noisy, swinging several points between 50 and 80 games. Next: an automatic tuner (`TUNE=` env in `tests/soak.js`), running many seeds and nudging each style toward the fair share.
- [ ] **Games are long:** a median of 1,712 turns from one home sun to total conquest. At "fast" (0.15 s a move) a computer-only game takes hours. Consider a faster pace for computer-only games, or a bigger home start.
- [ ] **Card trades snowball:** late games reach stacks of 40,000 ships. Look at capping trade values or the number of cards.

## Round log
- **Round 1 (2026-11-25):**
  - Set up the project and installed Node.
  - Added the shared rules engine (setup, reinforce, cards, attack, advance, fortify, win) as one pure state machine.
  - Added bots with five styles and stalemate boldness (`aggression` in the rules), so every game ends.
  - Fixed: a 2-player game ended early when one player was left standing with unclaimed suns.
  - 10 of 10 tests pass, and 60 of 60 soak games finish.
- **Round 2 (2026-11-25):**
  - Retuned the styles: the win-rate spread went from 1–26% to 5–17%. Style quirks are now explicit flags (`saveSets`, `cardEveryTurn`, `spread`), so tuning can't switch them off.
  - Added the room server: `server/worker.js`, plus a `Room` Durable Object per room and a `Lobby` object.
    - The server owns the rules and rolls the dice.
    - Seat tokens let players return.
    - The AI covers a seat on a disconnect (after 20 s of grace), on a timeout, or by choice, and hands it back when the player returns or acts.
    - Turn timers get extra time for big placements. Bots run on alarms.
    - Also: rate limits, emotes, and 4-letter room codes.
  - Wrangler 4.168 runs locally.
  - Added `tests/room.int.js`, 12 checks against `wrangler dev`, all passing. 10 of 10 unit tests pass.
- **Round 3 (2026-11-25):**
  - Built the game screen in `client/`:
    - a title screen with the slowly turning map, and the look editor (name, colours, hull, play style)
    - Play vs AI, run entirely in the browser by `LocalRoom` with no server
    - Create room, Join by code, the open-rooms list and `/r/CODE` links
    - the room lobby: invite link, add AI players, start
    - the HUD: one action bar per phase, the players drawer, log, cards with science faces, sun card, find-a-sun, toasts, the turn timer with an AI warning, a win screen, and turn notifications
  - Ported the neon renderer to three.js r187 modules. Three.js and the fonts are served from our own folder, with no CDN (`tools/sync.mjs`).
  - Checked in the preview at desktop and phone size, plus an online room against `wrangler dev`.
  - 10 of 10 unit tests pass.
