import { useEffect, useMemo, useState } from 'react';
import type { Report } from '../../shared/protocol';
import { navigate } from '../lib/nav';
import { clearGames, deleteGame, forgetHost, hostGames, loadGames, loadReport, saveReport } from '../lib/store';
import { fmtPin, plural, Stamp, TeamBadge, tilt } from '../ui/bits';
import { HostNav } from '../ui/hostnav';

interface RoomInfo {
  ok: boolean;
  phase?: string;
  players?: number;
  round?: number;
  rounds?: number;
}

const PHASE: Record<string, string> = {
  lobby: 'In the lobby, waiting to start',
  intro: 'Reading the challenge',
  writing: 'Writing',
  duel: 'Duels',
  finals: 'Finalists',
  vote: 'Class vote',
  results: 'Round results',
  summary: 'Final scores',
};

function ago(t: number): string {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  return h < 24 ? `${h} h ago` : `${Math.round(h / 24)} d ago`;
}

function gameWords(r: Report) {
  return r.rounds.reduce((n, x) => n + x.entries.reduce((m, e) => m + e.words, 0), 0);
}

export function MyGames() {
  const [games, setGames] = useState(loadGames);
  const [live, setLive] = useState(() => hostGames().map((g) => ({ ...g, info: null as RoomInfo | null })));
  const [busy, setBusy] = useState<string | null>(null);

  // Ask the server which of this browser's games are still running; forget the ones that ended.
  useEffect(() => {
    let stop = false;
    const check = async () => {
      const list = hostGames();
      const infos = await Promise.all(
        list.map(async (g) => {
          try {
            const res = await fetch(`/api/rooms/${g.pin}`);
            return { ...g, info: (res.ok ? await res.json() : { ok: false }) as RoomInfo };
          } catch {
            return { ...g, info: null };
          }
        }),
      );
      if (stop) return;
      for (const g of infos) if (g.info && !g.info.ok) forgetHost(g.pin);
      setLive(infos.filter((g) => !g.info || g.info.ok));
    };
    void check();
    const id = setInterval(check, 15_000);
    return () => {
      stop = true;
      clearInterval(id);
    };
  }, []);

  const reports = useMemo(() => games.map((g) => ({ g, r: loadReport(g.pin) })), [games]);

  const stats = useMemo(() => {
    const rs = reports.map((x) => x.r).filter((r): r is Report => !!r);
    const entries = rs.flatMap((r) => r.rounds.flatMap((x) => x.entries));
    const texts = entries.filter((e) => e.words > 0);
    const words = texts.reduce((n, e) => n + e.words, 0);
    const played = new Map<string, number>();
    for (const r of rs) for (const x of r.rounds) played.set(x.challenge.title, (played.get(x.challenge.title) ?? 0) + 1);
    const favs = [...played.entries()].sort((a, b) => b[1] - a[1]).slice(0, 3);
    const chart = rs
      .slice(0, 10)
      .reverse()
      .map((r) => ({ at: r.createdAt, words: gameWords(r) }));
    return {
      games: rs.length,
      students: rs.reduce((n, r) => n + r.players.length, 0),
      texts: texts.length,
      words,
      avg: texts.length ? Math.round(words / texts.length) : 0,
      rounds: rs.reduce((n, r) => n + r.rounds.length, 0),
      favs,
      chart,
    };
  }, [reports]);

  const end = async (pin: string, token: string) => {
    if (!confirm(`End game ${fmtPin(pin)}? Students are sent out and the room is deleted. You keep the report.`)) return;
    setBusy(pin);
    const auth = { Authorization: `Bearer ${token}` };
    try {
      const res = await fetch(`/api/rooms/${pin}/report`, { headers: auth });
      if (res.ok) saveReport((await res.json()) as Report);
      await fetch(`/api/rooms/${pin}`, { method: 'DELETE', headers: auth });
    } catch {
      // offline: the room still expires on its own a day after its last activity
    }
    forgetHost(pin);
    setLive((l) => l.filter((g) => g.pin !== pin));
    setGames(loadGames());
    setBusy(null);
  };

  const remove = (pin: string) => {
    if (!confirm('Delete this game and its report from this computer? This cannot be undone.')) return;
    deleteGame(pin);
    setGames(loadGames());
  };

  const clearAll = () => {
    if (!confirm(`Delete all ${games.length} past games and their reports from this computer? This cannot be undone.`)) return;
    clearGames();
    setGames([]);
  };

  const maxWords = Math.max(1, ...stats.chart.map((c) => c.words));

  return (
    <div className="home games-page">
      <HostNav active="games" />

      <section className="games-section">
        <h2 className="section-title">
          <span className="hl">Live now</span>
        </h2>
        {live.length ? (
          <div className="live-grid">
            {live.map((g) => (
              <article key={g.pin} className="live-card card">
                <Stamp className="on-air">{g.info?.phase === 'summary' ? 'Done' : 'On air'}</Stamp>
                <span className="eyebrow">Game PIN</span>
                <b className="live-pin">{fmtPin(g.pin)}</b>
                <p className="live-phase">
                  {g.info?.phase ? PHASE[g.info.phase] : 'Checking…'}
                  {g.info?.round ? ` · round ${g.info.round}${g.info.rounds && g.info.rounds > 1 ? ` of ${g.info.rounds}` : ''}` : ''}
                </p>
                <p className="muted small">
                  {g.info?.players !== undefined ? `${plural(g.info.players, 'student')} · ` : ''}started {ago(g.createdAt)}
                </p>
                <div className="row">
                  <button className="btn btn-accent" onClick={() => navigate(`/host/${g.pin}`)}>
                    Open the board ▸
                  </button>
                  <button className="btn btn-ghost danger" disabled={busy === g.pin} onClick={() => end(g.pin, g.token)}>
                    {busy === g.pin ? 'Closing…' : g.info?.phase === 'summary' ? 'Close the room' : 'End game'}
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : (
          <p className="hand-note left">
            No game running right now.{' '}
            <a href="/host" onClick={(e) => (e.preventDefault(), navigate('/host'))}>
              Build one →
            </a>
          </p>
        )}
      </section>

      {stats.games > 0 && (
        <section className="games-section">
          <h2 className="section-title">
            <span className="hl">Your classes in numbers</span>
          </h2>
          <div className="stat-row">
            <div className="stat">
              <b>{stats.games}</b>
              <span>{stats.games === 1 ? 'game' : 'games'}</span>
            </div>
            <div className="stat">
              <b>{stats.rounds}</b>
              <span>rounds</span>
            </div>
            <div className="stat">
              <b>{stats.texts.toLocaleString()}</b>
              <span>texts written</span>
            </div>
            <div className="stat">
              <b>{stats.words.toLocaleString()}</b>
              <span>words written</span>
            </div>
            <div className="stat">
              <b>{stats.avg}</b>
              <span>words a text</span>
            </div>
            <div className="stat">
              <b>{stats.students}</b>
              <span>student seats</span>
            </div>
          </div>
          <div className="stat-extra">
            {stats.chart.length > 1 && (
              <div className="chart card" aria-label="Words written per game">
                <h3>Words per game</h3>
                <div className="bars">
                  {stats.chart.map((c, i) => (
                    <div key={i} className="bar-col" title={`${c.words} words`}>
                      <span className="bar-n">{c.words}</span>
                      <div className="bar" style={{ height: `${(c.words / maxWords) * 100}%` }} />
                      <span className="bar-date">{new Date(c.at).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            {stats.favs.length > 0 && (
              <div className="favs sticky">
                <h3>Most played</h3>
                <ol>
                  {stats.favs.map(([title, n]) => (
                    <li key={title}>
                      {title} <small>×{n}</small>
                    </li>
                  ))}
                </ol>
              </div>
            )}
          </div>
        </section>
      )}

      <section className="games-section">
        <div className="row">
          <h2 className="section-title">
            <span className="hl">Past games</span>
          </h2>
          <span className="spacer" />
          {games.length > 0 && (
            <button className="btn btn-small btn-ghost danger" onClick={clearAll}>
              Clear all
            </button>
          )}
        </div>
        {games.length ? (
          <div className="past-grid">
            {reports.map(({ g, r }) => {
              const winner = r ? [...r.teams].sort((a, b) => b.points - a.points)[0] : undefined;
              return (
                <article key={`${g.pin}-${g.createdAt}`} className="past-card taped" style={{ '--rot': `${tilt(g.pin, 1.6)}deg` } as React.CSSProperties}>
                  <p className="past-date">
                    {new Date(g.createdAt).toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })}
                    <small> · PIN {fmtPin(g.pin)}</small>
                  </p>
                  <ol className="past-titles">
                    {g.titles.map((t, i) => (
                      <li key={i}>{t}</li>
                    ))}
                  </ol>
                  <p className="past-meta">
                    {plural(g.players, 'student')} · {plural(g.rounds, 'round')}
                    {r ? ` · ${plural(gameWords(r), 'word')}` : ''}
                  </p>
                  {winner && winner.points > 0 && (
                    <p className="past-winner">
                      won by <TeamBadge team={winner} />
                    </p>
                  )}
                  <div className="row">
                    <button className="btn btn-small btn-accent" disabled={!r} onClick={() => navigate(`/report/${g.pin}`)}>
                      Report ▸
                    </button>
                    <button className="btn btn-small btn-ghost danger" onClick={() => remove(g.pin)}>
                      Delete
                    </button>
                  </div>
                </article>
              );
            })}
          </div>
        ) : (
          <p className="hand-note left">Games you finish show up here, with their reports.</p>
        )}
      </section>
    </div>
  );
}
