// Finds writing techniques in a finalist's text so the teacher can point at them while reading
// aloud: tap "Comparisons" and the similes light up. Plain rules, no AI: it runs instantly, costs
// nothing, and a miss is harmless because the teacher is the one reading. It errs towards
// precision; a technique it can't find reliably (personification, irony) is left to the class.

export type Technique =
  | 'opening' | 'simile' | 'sound' | 'alliteration' | 'dialogue' | 'question'
  | 'senses' | 'repetition' | 'connective' | 'evidence';

export const TECHNIQUES: Record<Technique, { label: string; color: string; hint: string }> = {
  opening: { label: 'Opening line', color: '#ffd96a', hint: 'How does the first sentence pull the reader in?' },
  simile: { label: 'Comparisons', color: '#9fe3df', hint: 'Similes compare two things with "like" or "as".' },
  sound: { label: 'Sound words', color: '#ffb3a7', hint: 'Onomatopoeia: words that sound like what they mean.' },
  alliteration: { label: 'Alliteration', color: '#c6f0b5', hint: 'Neighbouring words that start with the same sound.' },
  dialogue: { label: 'Dialogue', color: '#cbbcff', hint: "What do the characters' own words reveal?" },
  question: { label: 'Questions', color: '#ffc4f0', hint: 'A question pulls the reader into the thinking.' },
  senses: { label: 'Senses', color: '#f6f19a', hint: 'Sight, sound, smell, taste and touch.' },
  repetition: { label: 'Repetition', color: '#a9e4ff', hint: 'Repeated words or openings build rhythm and emphasis.' },
  connective: { label: 'Linking words', color: '#d9e6ff', hint: 'Words that link ideas: however, because, therefore.' },
  evidence: { label: 'Evidence', color: '#ffd8a8', hint: 'Numbers, examples and sources back up a claim.' },
};

export interface Mark {
  start: number;
  end: number;
}

const STOP = new Set(
  'a an the and or but so of to in on at by for with from into onto up out off over under is was were be been am are it its i me my we us our you your he him his she her they them their this that these those as than then there here not no do did does had has have will would can could should just very'.split(' '),
);

const SOUNDS = new Set(
  `bang boom kaboom crash creak creaked creaking hiss hissed hissing buzz buzzed buzzing whoosh whooshed swoosh swish swished thud thudded thump thumped splash splashed drip dripped dripping crack cracked crackle crackled crackling sizzle sizzled rumble rumbled rumbling screech screeched clang clanged clank clink snap snapped pop popped crunch crunched roar roared howl howled slam slammed tick tock ding dong beep beeped honk honked rustle rustled rustling squeak squeaked squeaking splat whack whacked zap zoom zoomed gurgle gurgled hum hummed humming click clicked clicking clatter clattered thunk plop plopped fizz fizzed growl growled grunt grunted grumble murmur murmured whisper whispered whispering mumble mumbled chirp chirped tweet meow woof moo oink hoot hooted ribbit achoo boing bonk pow wham bam vroom whir whirr whirred purr purred shh shush sniff sniffed slurp slurped gulp gulped burp hiccup smack smacked knock knocked rattle rattled jingle jingled jangle thwack wail wailed shriek shrieked yelp yelped groan groaned squelch squish flutter fluttered flap flapped pitter patter clap clapped stomp stomped tap tapped bzz zzz`.split(/\s+/),
);

const SENSES = new Set(
  `smell smelled smells scent stink stench aroma fragrant musty smoky reek reeked taste tasted bitter sweet sour salty spicy savory tangy sugary crunchy creamy juicy greasy silky rough smooth sticky slimy soggy damp wet moist icy freezing frozen chilly warm burning scorching sweaty soft sharp prickly fuzzy velvet velvety feathery itchy numb glow glowed glowing glimmer glimmered shimmer shimmered shimmering sparkle sparkled sparkling glitter glittered flicker flickered flickering dim dull bright blinding shadow shadows shadowy gleam gleamed golden crimson scarlet silver pale gray grey murky hazy foggy misty echo echoed echoing silence silent deafening loud quiet shrill muffled thunder thundered stinging throbbing aching tingling`.split(/\s+/),
);

const CONNECTIVES = [
  'on the other hand', 'in contrast', 'for example', 'for instance', 'as a result', 'in addition',
  'in conclusion', 'even though', 'however', 'therefore', 'moreover', 'furthermore', 'although',
  'consequently', 'nevertheless', 'meanwhile', 'firstly', 'secondly', 'finally', 'because',
  'unless', 'whereas', 'instead', 'similarly', 'despite', 'otherwise', 'thus', 'hence',
];

const EVIDENCE = [
  'according to', 'studies show', 'research shows', 'scientists', 'experts', 'survey', 'statistics',
  'evidence', 'data', 'for example', 'for instance', 'such as', 'percent', 'study', 'studies', 'research',
];

// "I like the", "would like a": like as a verb, not a comparison.
const NOT_SIMILE_BEFORE = new Set(
  "i you we they he she would do does did don't didn't doesn't won't to really also kinda people everyone everybody who will can could should might not 'd".split(' '),
);

// "such as a", "known as the", "worked as a": as, but not a comparison.
const NOT_SHORT_SIMILE = new Set(
  'such same known so just twice as much many well soon long far work works worked working serve serves served act acts acted acting used use dressed treated seen regarded described born start started job role posing posed'.split(' '),
);

function words(text: string) {
  const out: { w: string; start: number; end: number }[] = [];
  for (const m of text.matchAll(/[\p{L}][\p{L}'’-]*/gu)) out.push({ w: m[0].toLowerCase(), start: m.index!, end: m.index! + m[0].length });
  return out;
}

function merge(marks: Mark[]): Mark[] {
  const sorted = marks.filter((m) => m.end > m.start).sort((a, b) => a.start - b.start);
  const out: Mark[] = [];
  for (const m of sorted) {
    const last = out[out.length - 1];
    if (last && m.start <= last.end) last.end = Math.max(last.end, m.end);
    else out.push({ ...m });
  }
  return out;
}

function phraseMarks(text: string, phrases: string[]): Mark[] {
  const marks: Mark[] = [];
  for (const p of phrases) {
    const re = new RegExp(`\\b${p.replace(/ /g, '\\s+')}\\b`, 'gi');
    for (const m of text.matchAll(re)) marks.push({ start: m.index!, end: m.index! + m[0].length });
  }
  return marks;
}

/** Extends a mark from `start` to the end of its phrase: the next punctuation, or eight words. */
function phraseFrom(text: string, start: number): number {
  const rest = text.slice(start);
  const stop = rest.search(/[,.;:!?\n—–"”]/);
  const chunk = stop === -1 ? rest : rest.slice(0, stop);
  const ws = [...chunk.matchAll(/\S+/g)];
  if (ws.length > 9) return start + ws[8].index! + ws[8][0].length;
  return start + chunk.replace(/\s+$/, '').length;
}

function sentences(text: string): Mark[] {
  const out: Mark[] = [];
  for (const m of text.matchAll(/[^.!?\n]+[.!?]*["”']?/g)) {
    const lead = m[0].length - m[0].trimStart().length;
    const s = m.index! + lead;
    const e = m.index! + m[0].trimEnd().length;
    if (e > s) out.push({ start: s, end: e });
  }
  return out;
}

export function spot(text: string): Partial<Record<Technique, Mark[]>> {
  const found: Partial<Record<Technique, Mark[]>> = {};
  const ws = words(text);
  const sents = sentences(text);

  if (sents.length) found.opening = [sents[0]];

  found.dialogue = [...text.matchAll(/[“"][^“”"\n]{2,}[”"]/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].length }));

  found.question = sents.filter((s) => text.slice(s.start, s.end).replace(/["”']+$/, '').endsWith('?'));

  const similes: Mark[] = [];
  for (const m of text.matchAll(/\b(like|as if|as though)\b/gi)) {
    const before = text.slice(0, m.index!).match(/([\p{L}']+)\W*$/u)?.[1]?.toLowerCase();
    const after = text.slice(m.index! + m[0].length).match(/^\s*([^\s])/)?.[1];
    if (m[0].toLowerCase() === 'like' && ((before && NOT_SIMILE_BEFORE.has(before)) || after === ',' || !after)) continue;
    similes.push({ start: m.index!, end: phraseFrom(text, m.index! + m[0].length) });
  }
  for (const m of text.matchAll(/\bas\s+[\p{L}]+\s+as\b/giu)) similes.push({ start: m.index!, end: phraseFrom(text, m.index! + m[0].length) });
  // "calm as a frozen lake": the first "as" left out.
  for (const m of text.matchAll(/\b([\p{L}]+)\s+as\s+an?\s/giu)) {
    if (NOT_SHORT_SIMILE.has(m[1].toLowerCase())) continue;
    similes.push({ start: m.index!, end: phraseFrom(text, m.index! + m[0].length) });
  }
  found.simile = similes;

  found.sound = ws
    .filter((w) => SOUNDS.has(w.w) || SOUNDS.has(w.w.replace(/(.)\1{2,}/g, '$1$1')) || SOUNDS.has(w.w.replace(/(.)\1+/g, '$1')))
    .map(({ start, end }) => ({ start, end }));

  found.senses = ws.filter((w) => SENSES.has(w.w)).map(({ start, end }) => ({ start, end }));

  // Alliteration: three or more content words in a row on the same consonant, allowing one
  // small word in between ("the silent, silver sea").
  const allit: Mark[] = [];
  let run: typeof ws = [];
  let gap = 0;
  const flush = () => {
    if (run.length >= 3) allit.push({ start: run[0].start, end: run[run.length - 1].end });
    run = [];
    gap = 0;
  };
  let prevEnd = 0;
  for (const w of ws) {
    // A sentence break ends a run: "stopped. Somewhere" isn't alliteration.
    if (/[.!?\n;:]/.test(text.slice(prevEnd, w.start))) flush();
    prevEnd = w.end;
    if (STOP.has(w.w)) {
      if (run.length && ++gap > 1) flush();
      continue;
    }
    const c = w.w[0];
    if (!/[bcdfghjklmnpqrstvwxyz]/.test(c)) {
      flush();
      continue;
    }
    if (run.length && run[0].w[0] === c) {
      run.push(w);
      gap = 0;
    } else {
      flush();
      run = [w];
    }
  }
  flush();
  found.alliteration = allit;

  const rep: Mark[] = [];
  for (const m of text.matchAll(/\b([\p{L}']{2,})(?:[,\s]+\1\b)+/giu)) rep.push({ start: m.index!, end: m.index! + m[0].length });
  const openers = new Map<string, Mark[]>();
  for (const s of sents) {
    const first = text.slice(s.start, s.end).match(/^["“]?([\p{L}']+)(\s+[\p{L}']+)?/u);
    if (!first) continue;
    const one = first[1].toLowerCase();
    if (['the', 'a', 'i', 'it', 'he', 'she', 'they', 'we', 'and', 'but', 'then', 'so', 'there', 'this', 'you'].includes(one)) {
      const two = (first[0].replace(/^["“]/, '')).toLowerCase();
      if (!first[2]) continue;
      const list = openers.get(two) ?? [];
      list.push({ start: s.start, end: s.start + first[0].length });
      openers.set(two, list);
    } else {
      const list = openers.get(one) ?? [];
      list.push({ start: s.start, end: s.start + first[1].length + (first[0].startsWith('"') || first[0].startsWith('“') ? 1 : 0) });
      openers.set(one, list);
    }
  }
  for (const list of openers.values()) if (list.length >= 2) rep.push(...list);
  const trigrams = new Map<string, Mark[]>();
  for (let i = 0; i + 2 < ws.length; i++) {
    const tri = ws.slice(i, i + 3);
    if (tri.filter((w) => STOP.has(w.w)).length >= 2) continue;
    const key = tri.map((w) => w.w).join(' ');
    const list = trigrams.get(key) ?? [];
    list.push({ start: tri[0].start, end: tri[2].end });
    trigrams.set(key, list);
  }
  for (const list of trigrams.values()) if (list.length >= 2) rep.push(...list);
  found.repetition = rep;

  found.connective = phraseMarks(text, CONNECTIVES);
  found.evidence = [
    ...phraseMarks(text, EVIDENCE),
    ...[...text.matchAll(/\b\d[\d,.]*\s?%?/g)].map((m) => ({ start: m.index!, end: m.index! + m[0].trimEnd().length })),
  ];

  for (const k of Object.keys(found) as Technique[]) {
    const merged = merge(found[k] ?? []);
    if (merged.length) found[k] = merged;
    else delete found[k];
  }
  return found;
}

/** Splits text into plain and highlighted runs for rendering. */
export function segments(text: string, marks: Mark[] | undefined): { text: string; hit: boolean }[] {
  if (!marks?.length) return [{ text, hit: false }];
  const out: { text: string; hit: boolean }[] = [];
  let at = 0;
  for (const m of marks) {
    if (m.start > at) out.push({ text: text.slice(at, m.start), hit: false });
    out.push({ text: text.slice(m.start, m.end), hit: true });
    at = m.end;
  }
  if (at < text.length) out.push({ text: text.slice(at), hit: false });
  return out;
}
