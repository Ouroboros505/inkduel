// Who judges which pair of texts. Each student judges pairs from their own team, never their own
// text, and every eligible text is read by at least two classmates per duel round.
//
// The construction: shuffle a team's texts into a ring T[0..m-1] and line the authors up in the
// same order. Author k judges T[k+a] and T[k+b]; for fixed offsets a != b, both non-zero mod m,
// text j is judged by authors j-a and j-b, so exactly twice. Students without an eligible text
// (blank, held back) top the ring up with extra pairs. Students who still have nothing to judge,
// such as the two authors in a team of two texts, borrow a pair from another team.

export interface DuelPlan {
  voter: string;
  team: number;
  a: string;
  b: string;
  /** The pair came from another team. */
  cross: boolean;
}

export interface TeamPool {
  team: number;
  /** Everyone on the team who can judge this round. */
  voters: string[];
  /** Eligible texts: entry id and author. */
  texts: { id: string; author: string }[];
}

type Rand = () => number;

export function shuffle<T>(xs: T[], rand: Rand = Math.random): T[] {
  const a = xs.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Ring offsets for duel round d (0-based) with m texts, or null if there is no valid pair. */
function offsets(d: number, m: number): [number, number] | null {
  if (m < 3) return null;
  if (d === 0) return [1, 2];
  if (m === 4) return [1, 3];
  if (m >= 5) return [2, 4];
  return null;
}

export function planDuels(pools: TeamPool[], perStudent: number, rand: Rand = Math.random): DuelPlan[] {
  const plans: DuelPlan[] = [];
  const count = new Map<string, number>();
  const give = (p: DuelPlan) => {
    plans.push(p);
    count.set(p.voter, (count.get(p.voter) ?? 0) + 1);
  };

  for (const pool of pools) {
    const ring = shuffle(pool.texts, rand);
    const m = ring.length;
    const authors = ring.map((t) => t.author);
    const others = shuffle(pool.voters.filter((v) => !authors.includes(v)), rand);
    for (let d = 0; d < perStudent; d++) {
      const off = offsets(d, m);
      if (off) {
        ring.forEach((t, k) => {
          if (!pool.voters.includes(t.author)) return;
          give({ voter: t.author, team: pool.team, a: ring[(k + off[0]) % m].id, b: ring[(k + off[1]) % m].id, cross: false });
        });
      }
      if (m >= 2) {
        others.forEach((v, i) => {
          const x = (i + d) % m;
          let y = (i + d + 1 + Math.floor(i / m)) % m;
          if (y === x) y = (x + 1) % m;
          give({ voter: v, team: pool.team, a: ring[x].id, b: ring[y].id, cross: false });
        });
      }
    }
  }

  // Anyone still short of duels borrows pairs from other teams, so nobody sits idle.
  const byTeam = new Map(pools.map((p) => [p.team, p]));
  const pairable = pools.filter((p) => p.texts.length >= 2);
  for (const pool of pools) {
    for (const v of pool.voters) {
      let have = count.get(v) ?? 0;
      const candidates = shuffle(pairable.filter((p) => p.team !== pool.team), rand);
      for (const other of candidates) {
        if (have >= perStudent) break;
        const [a, b] = shuffle(byTeam.get(other.team)!.texts, rand);
        give({ voter: v, team: other.team, a: a.id, b: b.id, cross: true });
        have++;
      }
    }
  }

  // Show each pair in random order, so the left card isn't always the same text.
  return plans.map((p) => (rand() < 0.5 ? p : { ...p, a: p.b, b: p.a }));
}

export function teamCount(players: number, setting: number): number {
  // A teacher's explicit choice wins, even if it makes tiny teams (handy for a two-device demo).
  if (setting) return Math.max(1, Math.min(setting, players));
  if (players >= 16) return 4;
  if (players >= 9) return 3;
  if (players >= 4) return 2;
  return 1;
}
