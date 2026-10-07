// Everything the teacher keeps lives in her own browser: her challenges, her settings, past game
// reports. Nothing here is needed for a game to run, so every read and write tolerates a browser
// that refuses storage (private windows, locked-down school profiles).

import type { Challenge, Report, Settings } from '../../shared/protocol';

export const K = {
  custom: 'inkduel.custom',
  playlist: 'inkduel.playlist',
  settings: 'inkduel.settings',
  sound: 'inkduel.sound',
  games: 'inkduel.games',
  host: (pin: string) => `inkduel.host.${pin}`,
  player: (pin: string) => `inkduel.player.${pin}`,
  report: (pin: string) => `inkduel.report.${pin}`,
  pending: (pin: string) => `inkduel.pending.${pin}`,
};

export function load<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

export function save(key: string, value: unknown): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export function drop(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    // nothing to do
  }
}

export interface HostCreds {
  token: string;
  createdAt: number;
}

export interface GameIndexEntry {
  pin: string;
  createdAt: number;
  savedAt: number;
  players: number;
  rounds: number;
  titles: string[];
}

export const loadCustom = () => load<Challenge[]>(K.custom, []);
export const saveCustom = (list: Challenge[]) => save(K.custom, list);
export const loadSettings = (): Partial<Settings> => load<Partial<Settings>>(K.settings, {});

/** Stores a game report, making room by dropping the oldest reports if the browser is full. */
export function saveReport(report: Report) {
  const index = load<GameIndexEntry[]>(K.games, []).filter((g) => g.pin !== report.pin || g.createdAt !== report.createdAt);
  index.unshift({
    pin: report.pin,
    createdAt: report.createdAt,
    savedAt: report.savedAt,
    players: report.players.length,
    rounds: report.rounds.length,
    titles: report.rounds.map((r) => r.challenge.title),
  });
  while (!save(K.report(report.pin), report) && index.length > 1) {
    const old = index.pop()!;
    drop(K.report(old.pin));
  }
  save(K.games, index.slice(0, 30));
}

/** The image a teacher uploaded for one of her own challenges; uploads never leave her browser. */
export function localImage(challengeId: string | undefined): string | undefined {
  if (!challengeId) return undefined;
  return loadCustom().find((c) => c.id === challengeId)?.image;
}
