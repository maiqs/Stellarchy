# Hundred Suns: a 3D Diplomacy map of the nearest stars

A map of Sol plus the 100 nearest star systems (out to 21.1 ly), placed at their real positions.

- `data/hygdata_v41.csv`: the HYG Database v4.1 by David Nash (astronexus), CC BY-SA 4.0. https://github.com/astronexus/HYG-Database
- `tools/`: C# builder. Run `dotnet run -c Release -- ../data/hygdata_v41.csv ../data/star_map.json 100 7`. The arguments are the system count and the lane length in ly.
  - It groups companion stars into systems and folds Proxima Centauri into Alpha Centauri.
  - It adds four well-known neighbours HYG lacks: Luhman 16, WISE 0855-0714, Teegarden's Star and SCR 1845-6357.
- `data/star_map.json`: the map.
  - Each system has an id, name, x/y/z in ly (equatorial, Sol at origin), distance, star count, spectral type, luminosity and whether it is a supply centre.
  - Each lane has its two ends, its length, and an `extra` flag for added long lanes.
- `hundred_suns.html`: the 3D viewer. Rebuild it by splicing `star_map.json` into `viewer_template.html`.

## Lane rule

1. Every pair of systems within L light years gets a lane (default 7 ly).
2. Any system left with fewer than 2 lanes gets lanes to its nearest neighbours.
3. Separate clusters are joined by their shortest gap.

At 7 ly this gives 187 lanes, 3.7 lanes per system on average (2 to 9), and 23 added long lanes. The median nearest-neighbour distance is 3.9 ly.

## Supply centres (proposal)

36 of 101 systems are supply centres: Sol, every multi-star system, and every single star brighter than 5% of the Sun.

Not done yet: home systems for the powers, and starting units.

# Three Hundred Suns: a 3D Risk map

`data/star_risk.json` and `three_hundred_suns.html` hold Sol plus the 300 nearest systems (out to 33.7 ly). Build them with `dotnet run -c Release -- ../data/hygdata_v41.csv ../data/star_risk.json 300 7 14` from `tools/`. The arguments are the system count, the lane length in ly, and the number of continents. Rebuild the page by splicing the JSON into `risk_template.html`.

- **Lanes:** systems within 7 ly are joined, plus fixes so no system is stranded. That gives 493 lanes, an average of 3.3 per system.
- **Continents:** 3D clusters (seeded from Sol), repaired so each one is connected through its own lanes, with tiny ones merged into a neighbour. Each is named after the constellation most of its stars lie in.
  - Constellations themselves don't work as continents. They are cones out from Earth: their members span 6 to 33 ly and split into 2 to 5 unconnected pieces. Add the argument `cons` after the continent count to print that check.
- **Bonus:** (systems + 2 × border systems) / 6, rounded.
- **Preview:** use `tools/serve/serve.ps1` (the "starmaps" entry in `.claude/launch.json`). The preview pane's file mode blocks the CDN scripts.

## Online play (browser)

The published page (https://claude.ai/artifact/48NmVWuctU1njsyJ3szB9m) declares the `db` and `user` capabilities.

- **Storage:** each game is one document at `games/<id>`, holding seats (user ids only), owner and armies arrays, turn, phase, reinforcements, log and rev.
- **Writes:** only the player whose turn it is writes during play. Joining a seat takes a short lease on the game document.
- **Rules:** reinforcements are max(3, systems / 3) plus continent bonuses. Attacks use up to 3 attack dice against 2 defence dice, with optional blitz. After an attack phase comes one fortify move through your own systems.
- **Winning:** the target is the chosen % of the 301 systems, never below a player's starting share + 15 points, or being the last player standing. The creator can skip a stuck player's turn.
- **Not done yet:** cards, a turn timer, AI players. Dice are rolled in the attacker's browser, which is fine among friends.
- **Testing:** `tests/mp_test.html` (via the starmaps server) loads `tests/mock_claude.js`, an in-memory db and switchable user. In the console, set `myId = 'u_bob'` to act as another player.

### Fleets and player looks (2026-11-25)

- **Ship classes:** frigate 1, destroyer 5, battleship 10, dreadnought 25. Armies are always shown in the fewest, largest ships (`fleetOf`).
- **Sizes:** a hull's length is the frigate's length × the cube root of its value, so its volume matches its mass. A dreadnought is about 2.9× a frigate's length.
- **Seats:** each stores `{uid, name, main, sub}`. The main colour fills stars and hulls; the sub colour is a thin star outline and a small detail on each hull.
- **Editing:** players edit their look from "Your name and colours" in the game panel. Their last look is remembered in their own browser.
- **Size:** up to 16 seats.

### Expand-outward start and computer players (2026-11-25)

- **Start mode:** "One home sun each" is the default (`mode: "legacy"`); "dealt" is the old random deal.
  - In the setup phase, players take turns picking an HQ at least 4 jumps from the others. The spacing relaxes if no system that far is left.
  - Each HQ starts with 10 ships, and holding your own HQ is worth +2 ships a turn.
  - Every other system starts unclaimed (owner -1, 0 armies); moving in claims it.
  - The win target is the chosen % of systems with no minimum (default 40%).
- **Computer players:** the creator adds them in the lobby (`seat.ai = true`). A seated human's browser runs their turns, one at a time, under a lease on `games/<id>/locks/bot` (2-minute expiry; the lease is retried every 15 s).
  - **HQ choice:** they pick an HQ with room around it.
  - **Reinforce:** they reinforce the frontier facing their goal continent (the one closest to completion), weighted by threat.
  - **Attack:** they blitz unclaimed systems freely, and enemies only with a clear advantage.
  - **Fortify:** they move their biggest interior stack to the most threatened connected border.
  - **Pace:** a 450 ms pause between moves so people can watch.

### Hull styles (2026-11-25)

- **Styles:** each seat stores `hull`: triangle (Star Destroyer-like wedge), brick (cube), tube (ringed cylinder), orb (sphere with a band) or saucer (disc with a dome).
- **Classes:** a player's frigates, destroyers, battleships and dreadnoughts are all the same shape, scaled by mass. Details in the sub colour.
- **Choosing:** players pick a style in "Your name and colours". Bots get a random style, and the example deal cycles through all five.
- **Rendering pitfall:** in three.js r128, `setColorAt` sizes the colour buffer from the mesh's current `count`. Create the buffer while `count` is the full capacity, then set `count` to 0.

### Computer-only games (2026-11-25)

- **Creating:** the lobby's "Computer-only game" button fills every seat with bots (styles rotate through all five) and starts the game straight away.
- **Who runs the bots:** with no human seats, any watcher who may write to the page runs them, under the same lease.
- **Bot speed:** a per-viewer setting in localStorage (`hs_pace`): slow 900 ms, normal 450 ms, fast 150 ms, instant 25 ms per move.
- **Seats:** the creator can now also remove their own seat in the lobby.
- **Tested:** a 5-bot game finished in 124 turns (about 45 s at instant speed).

### Animated fleets (2026-11-25)

- **Persistent ships:** `fleet[i]` holds each system's ships between updates, and `buildFleets(fx)` diffs wanted against current ships.
  - Ships that stay keep orbiting.
  - New ships launch from the sun (reinforcements), fly in from a neighbouring system (moves and conquests), or emerge from a wreck (splits and merges).
  - Lost ships explode about 0.5 s later, after the laser bolts arrive. A ship bigger than the remaining loss breaks apart instead, and smaller ships come out of it.
- **Shared animation events:** each commit can carry animation events in `game.fx` (the last 24, each tagged with its `rev`):
  - `{t:"rf", s}`: reinforcement
  - `{t:"mv", from, to}`: move
  - `{t:"bt", from, to, a, d, la, ld, cap}`: battle

  Every viewer plays the events newer than the last ones it has seen; nothing replays when a game is first opened.
- **Effects:** laser bolts are an additive LineSegments pool (160). Debris is an additive Points pool (2400 particles) in the owner's main colour, the sub colour and white.

### Cards (2026-11-25)

- **The deck:** 303 cards, one per system (`id % 3`: frigate, destroyer or battleship) plus 2 wilds. It lives in `game.deck`, `game.discard` and `game.cards[seat]`.
- **Earning:** a turn with any conquest or claim (`game.conq`) draws 1 card at the end of the turn. Games started before cards existed get a deck on their first draw.
- **Sets:** 3 alike, 1 of each, or any 2 plus a wild.
- **Trade values:** 4, 6, 8, 10, 12, 15, then +5 each. `game.trades` counts trades across the whole table.
- **Pictured system:** if a traded card shows a system you own, it gets +2 ships.
- **Must trade:** at 5 or more cards, before placing.
- **Taking cards:** wiping a player out takes their cards.
- **Bots:** they trade whenever they hold a set.
- **Tested:** in a 5-bot game, all 303 cards were accounted for and 22 trades escalated to +95.
- **Card types by sun colour (2026-11-25, Paul):** each system's card type comes from its spectral class.
  - The split is 201 red (M, L, T, Y), 48 orange (K) and 52 yellow-white (G, F, A, white dwarfs).
  - Systems with no catalogued type are sorted by luminosity: below 0.05 Sun is red, below 0.5 is orange.
- **Card faces:** they show the spectral class and its plain name, a rough surface temperature (by class and subclass), luminosity, star count, distance, and a short fact for about 35 famous neighbours (`STAR_FACTS`: planets, Vulcan at 40 Eridani, and so on). The system panel shows the same.
