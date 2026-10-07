// Types shared by the board, the student app and the room server. Everything that crosses the
// WebSocket is defined here, so the two sides can't drift apart.

export const MAX_TEXT = 3000;
export const MAX_NAME = 20;
export const MAX_PLAYERS = 60;

export type Level = '6-8' | '9-10' | '11-12';
export type Kind = 'story' | 'description' | 'argument' | 'poetry' | 'literature' | 'reflection' | 'wordplay';

export interface Challenge {
  id: string;
  title: string;
  prompt: string;
  /** Short name of what wins, shown as a chip: "Suspense". */
  criterion: string;
  /** The duel question: "Which text builds more suspense?" */
  question: string;
  seconds: number;
  levels: Level[];
  kind: Kind;
  /** Sentence starters and guiding questions, at most four. */
  tips: string[];
  /** A URL. Images the teacher uploads stay in her browser and never reach the server. */
  image?: string;
  credit?: string;
  emoji?: string;
  custom?: boolean;
}

export interface Settings {
  /** 0 = pick from class size. */
  teams: 0 | 2 | 3 | 4;
  /** Duels each student judges per round. */
  duels: 1 | 2;
  /** 0 = scale with text length. */
  duelSeconds: number;
  /** 0 = no limit; the teacher closes the vote. */
  voteSeconds: number;
  spellcheck: boolean;
  blockPaste: boolean;
  teamCard: boolean;
  tips: boolean;
  /** Hold back texts that name a classmate. */
  holdNames: boolean;
  /** Extra words that hold a text back, on top of the built-in list. */
  blocked: string[];
}

export const DEFAULT_SETTINGS: Settings = {
  teams: 0,
  duels: 1,
  duelSeconds: 0,
  voteSeconds: 60,
  spellcheck: true,
  blockPaste: true,
  teamCard: true,
  tips: true,
  holdNames: true,
  blocked: [],
};

// Risograph ink colours: orange, violet, teal, blue.
export const TEAM_STYLES = [
  { name: 'Foxes', emoji: '🦊', color: '#ff6b35' },
  { name: 'Owls', emoji: '🦉', color: '#7a4fd6' },
  { name: 'Otters', emoji: '🦦', color: '#00a3a3' },
  { name: 'Wolves', emoji: '🐺', color: '#2f62e0' },
] as const;

export interface TeamInfo {
  id: number;
  name: string;
  emoji: string;
  color: string;
  points: number;
  size: number;
}

export type Phase = 'lobby' | 'intro' | 'writing' | 'duel' | 'finals' | 'vote' | 'results' | 'summary';

/** Deadlines are server epoch ms; clients correct for their own clock offset. */
export interface Clock {
  endsAt: number | null;
  /** Remaining ms while paused. */
  paused: number | null;
  /** Full length of the phase in ms, for progress rings. */
  total: number | null;
}

export type HoldReason = 'empty' | 'name' | 'word' | 'removed';

export interface EntryCard {
  id: string;
  team: number;
  text: string;
  words: number;
}

export interface HostPlayer {
  id: string;
  name: string;
  team: number | null;
  online: boolean;
  /** Words in this round's draft. */
  words: number;
  done: boolean;
  late: boolean;
}

export interface HostEntry extends EntryCard {
  author: string;
  authorName: string;
  held: HoldReason | null;
  heldDetail: string;
  wins: number;
  reads: number;
  finalist: boolean;
  vetoed: boolean;
  votes: number;
  revealed: boolean;
}

export interface RoundSummary {
  n: number;
  title: string;
  points: Record<number, number>;
  winners: number[];
}

export interface HostView {
  role: 'host';
  pin: string;
  phase: Phase;
  clock: Clock;
  locked: boolean;
  settings: Settings;
  teams: TeamInfo[];
  players: HostPlayer[];
  round: number;
  challenge: Challenge | null;
  queue: Challenge[];
  /** writing: writers done / writers; duel: duels judged / duels; vote: votes / voters. */
  progress: { done: number; total: number; words: number };
  /** Words written per team this round, live during writing. */
  teamWords: Record<number, number>;
  entries: HostEntry[];
  finalists: string[];
  winners: number[];
  points: Record<number, number>;
  history: RoundSummary[];
  stats: { words: number; texts: number; rounds: number };
}

export interface MyResult {
  words: number;
  reads: number;
  wins: number;
  finalist: boolean;
  held: HoldReason | null;
}

export interface PlayerView {
  role: 'player';
  pin: string;
  phase: Phase;
  clock: Clock;
  me: { id: string; name: string; team: number | null; late: boolean };
  teams: TeamInfo[];
  round: number;
  challenge: Challenge | null;
  rules: { spellcheck: boolean; blockPaste: boolean; teamCard: boolean; tips: boolean };
  /** Own text this round, to restore after a reload. */
  draft: { text: string; done: boolean } | null;
  /** Openings of teammates' texts, anonymous. */
  snippets: string[];
  duels: { id: string; a: EntryCard; b: EntryCard; pick: 0 | 1 | null }[];
  finalists: (EntryCard & { mine: boolean; votes?: number })[];
  vote: string | null;
  winners: number[];
  points: Record<number, number>;
  result: MyResult | null;
  summary: null | {
    words: number;
    texts: number;
    mine: { round: number; title: string; text: string }[];
  };
}

export type View = HostView | PlayerView;

export interface ReportEntry {
  author: string;
  name: string;
  team: number;
  text: string;
  words: number;
  held: HoldReason | null;
  heldDetail: string;
  wins: number;
  reads: number;
  finalist: boolean;
  votes: number;
}

export interface Report {
  pin: string;
  createdAt: number;
  savedAt: number;
  teams: TeamInfo[];
  players: { id: string; name: string; team: number | null }[];
  rounds: {
    n: number;
    challenge: Challenge;
    entries: ReportEntry[];
    points: Record<number, number>;
    winners: number[];
  }[];
}

export type HostMsg =
  | { t: 'hello'; role: 'host'; token: string }
  | { t: 'start' }
  | { t: 'queue'; challenges: Challenge[] }
  | { t: 'swap'; challenge: Challenge }
  | { t: 'write' }
  | { t: 'skip' }
  | { t: 'time'; seconds: number }
  | { t: 'pause' }
  | { t: 'resume' }
  | { t: 'veto'; id: string }
  | { t: 'vote' }
  | { t: 'reveal'; id: string }
  | { t: 'next' }
  | { t: 'end' }
  | { t: 'kick'; id: string }
  | { t: 'lock'; locked: boolean }
  | { t: 'settings'; settings: Settings }
  | { t: 'report' };

export type PlayerMsg =
  | { t: 'hello'; role: 'player'; id: string; token: string }
  | { t: 'join'; name: string }
  | { t: 'draft'; text: string; done?: boolean }
  | { t: 'pick'; duel: string; pick: 0 | 1 }
  | { t: 'cast'; id: string };

export type ClientMsg = HostMsg | PlayerMsg;

export type ServerMsg =
  | { t: 'view'; view: View; now: number }
  | { t: 'joined'; id: string; token: string }
  | { t: 'error'; code: string; message: string }
  | { t: 'report'; report: Report }
  | { t: 'kicked' };

export function countWords(text: string): number {
  const m = text.trim().match(/[\p{L}\p{N}][\p{L}\p{N}'’-]*/gu);
  return m ? m.length : 0;
}

/** Duel time in seconds when the teacher leaves it on auto: enough to read two texts of this length. */
export function autoDuelSeconds(avgWords: number, duels: number): number {
  const one = Math.round(20 + avgWords * 0.6);
  return Math.min(90, Math.max(30, one)) * duels;
}
