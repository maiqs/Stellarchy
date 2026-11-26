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
   - [x] ~~`data/star_map.json`~~ replaced in round 4 by `data/stars.json` (3,000 systems) plus `shared/mapgen.js`. HYG v4.1, CC BY-SA 4.0, credited.
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
   - [x] A spectator mode for full or running rooms.
4b. **Map size slider (Paul, 2026-11-25): 10 to 3,000 suns**
   - [x] **Data:** rebuild the star file with the 3,000 nearest systems, sorted by distance from Sol. The C# builder in `../star_diplomacy/tools` has a 16 pc cap; lift it to about 35 pc. The file is about 400 KB raw and about 100 KB gzipped.
     - Beyond about 20 pc, HYG misses many faint red dwarfs, so big maps lean toward brighter stars. Say so on the credits or info page.
   - [x] **Map built per room:** port the lane and continent code to `shared/` in JS. A room of size N takes the first N systems and builds:
     - lanes within 7 ly, plus a minimum of 2 links per star, plus spanning connectivity
     - about N÷20 continents, clamped 1–40, with bonuses
     - the same map every time for the same N
   - [x] **The slider:** a log scale snapping to 10, 25, 50, 100, 200, 300, 500, 1000, 2000 and 3000. It shows the estimated game length, about 1–2 minutes per sun per player.
   - [x] **Rules that bend with size:**
     - minimum suns = 4 per seat, so the slider's floor rises with player count
     - HQ spacing shrinks on small maps (4 jumps at 100 or more suns, 2 at 10)
     - small maps have no continents
   - [ ] **Big maps (1,000+):** *(Round 4: glows and pick rings are each one draw call, taking 3,000 suns from 34 to 79 fps in the preview. Round 8: the server sends only changed suns, about 300 small diffs and 2 full boards per test game. Round 9: choosing 1,000+ suns sets the win target to 65% unless you picked one. Still open: labels and fleet caps.)*
     - stars drawn as one InstancedMesh
     - names and army counts only near the camera, or on hover or select
     - fleets capped per star
     - the server sends changes, not the whole board
     - win-% presets lower by default
   - [x] **Tests:** *(Round 4: every size builds connected and the same each time, and games at 10, 25 and 200 suns finish (`tests/mapgen.test.js`). Games at 1,000+ do not finish yet; see Bugs.)*
     - every size from 10 to 3,000 builds a connected map
     - all-bot games finish at 10, 300 and 3,000
     - 60 fps on a mid phone at 3,000
4c. **AI seats and play styles (Paul, 2026-11-25)**
   - [x] **All-AI games** default to total conquest (100%). Human games keep the win-% choice.
   - [x] **AI takes over a seat** when its player steps away: they disconnect, or miss a turn timer. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
     - The seat keeps the player's name, colours and token. The seat row shows a small "AI" badge ("Ana (AI playing)").
     - The bot plays in that player's preferred style.
   - [x] **The player can return** to their seat at any time with the same browser token, or a rejoin link. They take control back at once. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
     - If the bot is mid-turn, it finishes its current attack and hands over. No turn is lost.
     - A "Let AI play for me" toggle lets a player hand over on purpose (to grab a coffee).
   - [x] **Play styles**, on the main menu (the five style tunings are in `shared/bot.js`; the menu is not built yet): the player picks a preferred style, saved in the browser. It shows as a little icon on their seat. The same styles drive the computer players, which get one at random or the creator sets it per bot.
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
   - [x] Empty rooms close after a while. Finished rooms are kept briefly to show the result, then removed. *(Round 6: 30 min with nobody connected, 10 min once finished, 7 days for 12 h or 24 h turn rooms. Tested with a dev-only short idle time.)*
6. **UI pass (the big one)**
   - [x] Full-screen 3D map. The UI floats on it as neon glass panels, with no big side columns.
   - [x] One clear action bar at the bottom: "YOUR TURN: place 7 ships" → "Attack or end" → "Fortify". Big touch targets.
   - [ ] Tap a star to select it; neighbours light up as targets. Drag or tap to attack, with a dice animation and the result inline. *(Round 3: tap to select, then tap a target. Round 7: dice tumble in, each pair is marked won or lost, and losses float up over the suns. Drag-to-attack is not done.)*
   - [x] Collapsible drawers: players, cards, log. Hidden by default on phones.
   - [ ] Responsive layout: portrait phone, landscape phone, tablet, desktop. Test at 360×640, 390×844, 768×1024, 1366×768, 1920×1080, 3440×1440. *(Round 3: checked phone portrait and 1024×768. Round 7: checked 360×640 and a landscape phone (844×390); the sun card is compact on phones, tap for more. Still to check: tablet and ultrawide.)*
   - [x] First-game hints: three short coach marks, dismissable, shown once.
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
- [x] **Never freeze on a quitter.** The top complaint everywhere is games stuck on a departed player's turn. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
  - AI takeover (step 4c) covers it. Also show a plain "Skipping in 10 s" so nobody waits blind.
- [ ] **Fair, server-side timers with a grace period.** Board Game Arena players got booted by a timer that ran out before their turn even showed. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
  - Run the clock on the room and start it only once the turn has reached the client.
  - Add extra time when there are many ships to place.
  - Show "time banks" rather than an instant kick.
- [x] **Timer choice per room:** none (friends), 90 s, 3 min, or a long-turn mode (12 or 24 h) where AI covers a missed turn. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
  - Long turns need turn alerts: the browser notification API, a flashing tab title and a sound. Email needs accounts, so skip it. *(Round 3: the browser notification and the tab title are done; a sound is not.)*
- [x] **No pay-to-play limits, ever.** The big official game's most common complaint is free-tier token caps.
  - Say it on the title screen: "Free. No tokens, no timers on how much you play."
- [x] **Solo play against AI with no server.** The rules are shared, so a solo game can run fully in the browser.
  - Offline play is also a frequent ask. Make it work offline as an installable web app.
- [ ] **Quick play:** one button joins an open room or starts one filled with bots that people can replace.
- [x] **Quick chat and emotes.** Players ask for "quick chats". Use preset lines and emotes, with no free text to moderate. *(Round 2: the server side is done in `server/room.js`; the UI is next.)*
- [ ] **Finding things on big maps:** *(Round 3: search by name, plus "My home sun" and "My busiest border", are done; pins and the region list are not.)*
  - search for a sun by name
  - pin suns
  - jump to "my borders" and "my home sun"
  - a region list showing bonuses and who holds what
- [ ] **Bigger games:** Warzone players ask for 60–100 players. Consider up to 32 seats on maps of 500 suns or more.
- [ ] **Fog of war as a room option.** It's a Warzone staple: you see only your suns and their neighbours.
- [ ] **End-of-game screen:** *(Round 9: the graph of suns held over time and the standings are done; best moments and a scrubbable replay are not.)*
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

- [ ] **Round 5 research:**
  - [ ] **Fog-of-war replays:** after a fogged game, show a time-lapse of the whole map, plus each player's own view turn by turn. Dominating12 players asked for exactly this. It fits the end-of-game replay item above.
  - [ ] **Configurable rooms:** Warzone calls its configurability one of its best features (fog level, cards, ranked or practice). Next options for us:
    - card rules: escalating with the cap, fixed values, or no cards
    - fog of war
    - starting fleet size
  - [ ] **Non-binding truces:** online Diplomacy's appeal is negotiation. Keep it light, with no free-text chat: a "Propose a truce for 3 turns" button the other player accepts or ignores. The game shows truces on the map, but anyone can break one, and breaking it is announced.
  - [x] **Colour-blind support:** NetEase found colour-correction use matches the share of colour-blind players. Add a colour-blind-safe palette preset and a per-player pattern or glyph on stars and in the players list, so colour is never the only cue. *(Round 6: Okabe-Ito colour-blind-safe colours in the look editor, ship symbols beside names, and a menu option for symbols on every sun.)*
  - [ ] **Portrait and landscape:** 47% of players in that case study switched orientation. Keep both layouts first-class; the landscape phone layout is still untested.
  - [x] **Ranked play:** this needs accounts, so skip it for now. A local "your record" (wins, best game) in the browser is a free stand-in. *(Round 9: your record (wins, games, fastest win) on the title card and the results screen.)*

  Sources:
  - https://dominating12.com/forums/6/suggestions-feedback/2369/fog-of-war-reveal
  - https://forum.slitherine.com/viewtopic.php?p=764565
  - https://warzone.com/wiki/Settings
  - https://webdiplomacy.net
  - https://www.lovethework.com/work-awards/campaigns/accessible-design-of-infinite-boreders-1590685
  - https://steamdb.info/patchnotes/13285693

## Bugs and balance
- [x] **Hidden information leaked (round 8):** every update carried the whole deck in draw order and every player's hand, readable in the browser's developer tools. Now each viewer gets only their own hand (others as counts) and a deck count. Room checks cover it.
- [x] **Big maps never end (top bug, round 4):** a 6-player game on 1,000 suns had not finished after 12,000 turns, at about 11 ms a turn. Fixes to try:
  - **Fixed in round 5:** card income was the cause. Sets had reached about 9,000 ships each and swamped what territory earns. Sets are now capped at 40 ships (`TRADE_CAP` in `shared/rules.js`). Every big test game ends: 1,000 suns in 580–690 turns, 3,000 suns in 631.
  - `tests/mapgen.test.js` now runs full games on 1,000 and 3,000 suns.
  - the stall boldness should rise faster on big maps (scale it with suns per player)
  - a bigger starting fleet and more reinforcements on big maps
  - a lower default win % for 1,000 suns or more
  - faster bots (cache frontier, threat and region progress per turn instead of rescanning every sun at every step)
- [x] **Styles are uneven** (within about 3 points of fair since round 5) (soak). Win rate per seat, against a fair share of about 10%:
  - Round 1: aggressive 25.9%, territorial 14.7%, balanced 5.2%, card hunter 5.2%, defensive 0.9%.
  - Round 2, after tuning, 80 games: defensive 16.5%, aggressive 12.7%, territorial 9.6%, balanced 7.0%, card hunter 5.1%.
  - Round 5, after the tuner and the card cap, 120 games: territorial 17.3%, aggressive 10.5%, defensive 8.9%, card hunter 7.6%, balanced 6.3%.
  - The tuner now has identity rules: aggressive keeps the lowest odds, defensive the most hold and reserve, the card hunter the most card focus, territorial the most claiming. A second run is going.
  - Round 5, third tuner run (200 games): balanced 13.8%, aggressive 14.7%, territorial 12.9%, defensive 11.6%, card hunter 9.7%, against a fair share of 12.6%. Applied: card hunter margin 0 and region focus 2.7, territorial hold 0.66.
  - Hand-tuning is noisy, swinging several points between 50 and 80 games. Next: an automatic tuner (`TUNE=` env in `tests/soak.js`), running many seeds and nudging each style toward the fair share.
- [x] **Automatic tuner** (`tests/tune.js`, round 4): hill-climbs one style weight at a time across 240 games on 28 threads, keeping changes that bring win rates closer together. The first run is going in the background; apply `tests/tune_result.json` next round.
- [x] **Games are long:** (round 5: with the card cap the median is down to 781 turns, from 1,712; max 2,116) a median of 1,712 turns from one home sun to total conquest. At "fast" (0.15 s a move) a computer-only game takes hours. Consider a faster pace for computer-only games, or a bigger home start. *(Round 6: new games default to 100 suns, about 20 turns each, and the size picker shows measured lengths.)*
- [x] **Card trades snowball:** late games reached stacks of 40,000 ships. Fixed in round 5 by capping a set at 40 ships.

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
- **Round 4 (2026-11-25):**
  - Added the map-size picker, from 10 to 3,000 suns:
    - `data/stars.json` holds the 3,000 nearest systems out to 86 ly, from our own copy of the builder (`tools/starbuild`).
    - `shared/mapgen.js` builds lanes and regions for any size, the same map every time, in 1–100 ms.
    - The server, the solo game and the page all use the room's size.
    - The picker shows the sizes, rough game lengths, and a warning about fainter stars on big maps.
  - Glows and pick rings now draw as single point layers: 3,000 suns went from 34 to 79 fps.
  - Fixed: glows were too small at screen scales above 100%.
  - Fixed: a closed room made the page retry forever.
  - Added the automatic style tuner, running in the background.
  - Found: 1,000-sun games don't finish (logged as the top bug).
  - Unit tests: 10 rules and 16 map tests pass. The room checks pass (12).
- **Round 5 (2026-11-25):**
  - Fixed the top bug: big maps never ended because card sets reached about 9,000 ships each. Sets are now capped at 40, and 1,000- and 3,000-sun games end in about 600 turns.
  - The median game length fell to 781 turns, from 1,712.
  - Applied the tuner's style changes that keep each style's character: balanced elimination 3.2, aggressive region focus 2.1, territorial odds 1.42.
  - Gave the tuner identity rules. The second run skipped every candidate, because territorial claimed less than defensive. Fixed (territorial claim 6.5) and started a third run.
  - Online research (round ending in 5) added to Player wishes: fog-of-war replays, configurable rooms, non-binding truces, colour-blind support, orientation, and a local record as a stand-in for ranked play.
  - 28 of 28 tests pass, including full games on 1,000 and 3,000 suns.
- **Round 6 (2026-11-26):**
  - Ticked 10 items that were already done.
  - Long games: new games default to 100 suns, with measured length hints (50 suns ≈ 7 turns each, 100 ≈ 20, 300 ≈ 60).
  - Quick chat: a ☺ button with 14 preset lines and emoji, shown as a bubble over the sender's home sun, with a 2 s cooldown. AI players react now and then to eliminations, lost home suns and wins.
  - Colour-blind support: Okabe-Ito colours, ship symbols in the players list and sun card, and an optional symbol beside every sun's count.
  - First-game tips: three, shown once, with a light backdrop.
  - Idle rooms close and leave the lobby.
  - Fixed: the per-connection rate limit was never saved, so it didn't limit anything.
  - Tests: 28 of 28 unit tests and 14 of 14 room checks pass.
- **Round 7 (2026-11-26):**
  - Attack feedback: dice tumble in, each pair glows if won and dims if lost, a tally shows rolls and losses, and the roll stays visible in the move-in bar. Losses float up over both suns in every battle, including the AI's.
  - Fixed:
    - a die marked as won picked up the win screen's `.win` style and grew tall
    - claiming an empty sun showed the previous fight's dice
    - the debug hook kept the old map after a room changed size
  - Phones: the sun card is compact (holder and ships, tap for the science), and selecting a sun closes the players sheet. Checked at 360×640 and 844×390.
  - 28 of 28 tests pass.
- **Round 8 (2026-11-26):**
  - Fixed a fair-play leak: updates no longer include the deck order or other players' cards. Each viewer gets a personal message with only their own hand.
  - Online updates send only the suns that changed: a full board on joining or on request, otherwise diffs. A test game ran on 2 full boards and about 300 diffs with no resyncs. The page and the test client both resync if a diff doesn't line up.
  - The test players now pace their moves under the real rate limit.
  - 28 of 28 unit tests and 17 of 17 room checks pass.
- **Round 9 (2026-11-26):**
  - Results screen: a neon graph of suns held per player over the game (the rules record up to 120 samples, sent online only at game end), plus the standings.
  - Your record (wins, games, fastest win) on the title card and the results screen, kept in the browser.
  - Big maps default to a 65% win target. Watching an AI war now uses 100 suns, with "Watch another war" at the end.
  - Fixed: after the tips had been seen once, every later dialog (the results included) was pushed to the bottom of the screen.
  - 29 of 29 tests pass.
- **Round 10 (2026-11-26, code health only):**
  - `shared/looks.js` now holds the palette, highlights, AI names, hull keys, speed presets, `freeLook` and `botName`. They were copied in three places (server, solo, page).
  - `botStep` in `shared/bot.js` is the one "computer move that never stalls" used by the server, solo play and `playTurn` (which lost its unused `act` argument).
  - The page has a `hullInfo` helper. Removed unused `needsAction` and `scene.stop`.
  - Fixed the room test's stall at turn 40–47 (seen twice): it planned each human's move from another player's view, which since round 8 can't see their cards.
  - 29 of 29 unit tests and 17 of 17 room checks pass. The browser loads with no errors.
