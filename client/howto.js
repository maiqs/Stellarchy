// How to play (round 40: moved out of app.js; plain text, no game state)
export const HOW_TO_PLAY = `<div class="dlg how"><h2>How to play</h2>
    <p class="hint">Take suns until you hold the win target, or every sun for total conquest. Each sun is a real star near Earth.</p>
    <h3>Your turn</h3>
    <ol>
      <li><b>Reinforce.</b> New ships: a third of your suns (at least 3), plus region bonuses, plus 2 while you hold your home sun. Tap or hold your suns to place them, or Spread on borders. Then Confirm.</li>
      <li><b>Attack.</b> Tap (or drag from) one of your suns with 2+ ships, then a neighbour. Empty suns are simply taken. Battles are dice: up to 3 attacking against up to 2 defending, highest against highest, and defenders win ties. After a capture, choose how many ships move in.</li>
      <li><b>Fortify.</b> One move between two of your suns joined through your own space. Then End turn.</li>
    </ol>
    <h3>Cards</h3>
    <p class="hint">Take at least one sun in a turn to earn a card, named for its sun's colour: red, orange or yellow-white, plus wilds. Trade three of a kind, or one of each, for ships. With five cards you must trade. Knocking a player out takes their cards.</p>
    <h3>Regions</h3>
    <p class="hint">Suns are grouped into regions. Hold a whole region for its bonus every turn. The sun card shows the region and its bonus.</p>
    <h3>Room options</h3>
    <ul>
      <li><b>Fog of war:</b> you see only your suns and their neighbours.</li>
      <li><b>Flagships ⚑:</b> each player's flagship adds 1 to the best defending die there. Lose it and you are out.</li>
      <li><b>Cards:</b> rising sets (capped at 40), fixed 8-ship sets, or no cards.</li>
      <li><b>Truces 🤝:</b> offer one from the players panel. They last 3 rounds and aren't binding, but breaking one is announced to everyone.</li>
      <li><b>Turn timer:</b> if you run out, the AI plays in your style until you act again.</li>
      <li><b>AI players:</b> Recruit (gentle, for learning), Captain (standard) or Admiral (+3 ships a turn, said openly).</li>
    </ul>
    <h3>Keyboard</h3>
    <p class="hint"><b>Enter</b> the glowing button · <b>E</b> done attacking or end turn · <b>S</b> spread on borders · <b>U</b> undo · <b>Esc</b> clear the selection · <b>← →</b> ships to move · <b>C</b> cards · <b>P</b> players · <b>L</b> log · <b>F</b> find · <b>H</b> home view · <b>?</b> this guide</p>
    <h3>Fair dice</h3>
    <p class="hint">Online, every die is rolled by the server, so nobody can tamper with their own rolls. The AI never gets better dice, and only Admiral AI get extra ships, as the setup says. Your own roll average is on the results screen.</p>
    <h3>Fair clocks</h3>
    <p class="hint">In rooms with a turn timer, your clock starts when your turn reaches your screen, not before. More ships to place means more time. If time runs out, a one-off 30 s time bank kicks in before the AI plays your turn, and you can take your seat back any time.</p>
    <div class="row end"><button class="btn go" id="howOk" type="button">Got it</button></div></div>`;
