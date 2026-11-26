// Player-name filter (launch protection): names that contain a common slur or obscenity are replaced.
// Checked on a normalised copy (lower case, common digit/symbol swaps undone, repeats and separators removed),
// so "F.u.u.c.k" or "sh1t" are caught. Deliberately short: catching the obvious, not policing words like "Scunthorpe".
const BLOCK = ["fuck", "shit", "cunt", "nigger", "nigga", "faggot", "fag", "retard", "whore", "slut", "rape", "nazi", "hitler", "kike", "spic", "chink", "tranny", "dick", "cock", "pussy", "bitch", "twat", "wank", "porn"];
// words that contain a blocked piece but are fine
const ALLOW = ["scunthorpe", "cockpit", "peacock", "hitchcock", "dickens", "shitake", "shiitake", "grape", "drape", "therapist", "spicy", "fagin"];
const SWAP = { "0": "o", "1": "i", "!": "i", "3": "e", "4": "a", "@": "a", "5": "s", "$": "s", "7": "t", "8": "b", "9": "g", "|": "i" };
export function normalise(name) {
  return String(name).toLowerCase().replace(/[0-9!@$|]/g, c => SWAP[c] || c).replace(/[^a-z]/g, "").replace(/(.)\1+/g, "$1");
}
export function isOffensive(name) {
  let n = normalise(name); for (const ok of ALLOW) n = n.split(normalise(ok)).join("");
  return BLOCK.some(b => n.includes(normalise(b)));
}
export const DEFAULT_NAME = "Stellarch";
export const safeName = name => isOffensive(name) ? DEFAULT_NAME : name;
