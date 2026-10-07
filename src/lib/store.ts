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

const DAY = 24 * 3600_000;

/** Games this browser is hosting that may still be running: rooms live a day after their last activity. */
export function hostGames(): { pin: string; token: string; createdAt: number }[] {
  const out: { pin: string; token: string; createdAt: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      const m = key.match(/^inkduel\.host\.(\d{6})$/);
      if (!m) continue;
      const creds = load<HostCreds | null>(key, null);
      if (creds && Date.now() - creds.createdAt < 2 * DAY) out.push({ pin: m[1], token: creds.token, createdAt: creds.createdAt });
    }
  } catch {
    // storage blocked: nothing to list
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function forgetHost(pin: string) {
  drop(K.host(pin));
}

export function loadGames(): GameIndexEntry[] {
  return load<GameIndexEntry[]>(K.games, []);
}

export function loadReport(pin: string): Report | null {
  return load<Report | null>(K.report(pin), null);
}

export function deleteGame(pin: string) {
  drop(K.report(pin));
  save(K.games, loadGames().filter((g) => g.pin !== pin));
}

export function clearGames() {
  for (const g of loadGames()) drop(K.report(g.pin));
  drop(K.games);
}
