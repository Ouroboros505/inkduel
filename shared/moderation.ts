// Holds back texts and names that shouldn't go in front of the class. Deliberately narrow: a held
// text is only kept out of the duels and the finals, and the teacher still sees it with the
// reason, so a false positive costs little. Words common in literature class are left out
// ("bastard", "damn", "hell") because high schoolers quote Shakespeare.

// Matched at the start of a word, so endings are covered: "fuck" catches "fucking", "fucker".
const STEMS = [
  'fuck', 'motherfuck', 'shit', 'bullshit', 'bitch', 'cunt', 'nigger', 'nigga', 'faggot', 'whore',
  'slut', 'wank', 'twat', 'dickhead', 'asshole', 'arsehole', 'porn', 'jizz', 'blowjob', 'handjob',
];
// Only as whole words, because they hide inside innocent ones (class, cocktail, cumulative,
// retardant). "Dick" and "Nazi" are left out: Moby Dick and history essays.
const WHOLE = [
  'ass', 'asses', 'dumbass', 'jackass', 'fag', 'fags', 'cock', 'cocks', 'cum', 'retard', 'retards',
  'retarded', 'tits', 'titties', 'boobs', 'penis', 'vagina', 'kys', 'spic', 'chink', 'kike',
  'tranny', 'pussy',
];
// First names that are also ordinary words; matching these would hold back half the class.
const COMMON_NAMES = new Set([
  'will', 'grace', 'hope', 'may', 'rose', 'mark', 'bill', 'faith', 'joy', 'june', 'april',
  'august', 'art', 'sky', 'river', 'rob', 'pat', 'sue', 'ray', 'dawn', 'eve', 'jay', 'jack',
  'max', 'sunny', 'summer', 'autumn', 'winter', 'brook', 'lily', 'ivy', 'iris', 'amber', 'ruby',
  'pearl', 'violet', 'jade', 'storm', 'star', 'king', 'prince', 'chase', 'hunter', 'miles',
  'grant', 'drew', 'wade', 'lane', 'cliff', 'dale', 'glen', 'forest', 'rocky', 'crystal',
  'destiny', 'harmony', 'honey', 'candy', 'melody', 'angel', 'baby', 'major', 'bear', 'wolf',
  'fox', 'robin', 'wren', 'jordan', 'paris', 'sage', 'reed', 'page', 'win', 'don', 'van', 'del',
  'the', 'and', 'you', 'her', 'his', 'one',
]);

const LEET: Record<string, string> = { '0': 'o', '1': 'i', '3': 'e', '4': 'a', '5': 's', '7': 't', '@': 'a', '$': 's' };

function normalize(text: string): string {
  return text.toLowerCase().replace(/[013457@$]/g, (c) => LEET[c] ?? c);
}

function words(text: string): string[] {
  return normalize(text).match(/[\p{L}]+/gu) ?? [];
}

/** The first blocked word found, or null. `extra` are the teacher's own words, matched whole. */
export function findBlocked(text: string, extra: string[] = []): string | null {
  const ws = words(text);
  const extras = new Set(extra.map((w) => w.trim().toLowerCase()).filter(Boolean));
  for (const w of ws) {
    if (WHOLE.includes(w) || extras.has(w)) return w;
    for (const s of STEMS) if (w.startsWith(s)) return w;
  }
  // Spelled out one letter at a time: "f.u.c.k", "s h i t". Only runs of single letters, because
  // squashing whole sentences finds "shit" in "this hit".
  for (const run of normalize(text).match(/(?<![\p{L}])(?:\p{L}[\s.*_-]+){2,}\p{L}(?![\p{L}])/gu) ?? []) {
    const joined = run.replace(/[^\p{L}]/gu, '');
    if (STEMS.some((s) => joined.startsWith(s)) || WHOLE.includes(joined)) return joined;
  }
  return null;
}

/** The first classmate whose name appears in the text, or null. */
export function findName(text: string, names: string[]): string | null {
  const ws = new Set(words(text));
  for (const full of names) {
    for (const part of full.toLowerCase().split(/[^\p{L}]+/u)) {
      if (part.length < 3 || COMMON_NAMES.has(part)) continue;
      if (ws.has(part)) return full;
    }
  }
  return null;
}

/** Cleans a student's chosen name, or returns null if it can't be used. */
export function cleanName(raw: string, max: number): string | null {
  const name = raw.replace(/\s+/g, ' ').replace(/[<>]/g, '').trim().slice(0, max);
  if (!/[\p{L}\p{N}]/u.test(name)) return null;
  if (findBlocked(name)) return null;
  return name;
}
