import { useEffect, useMemo, useState } from 'react';
import { DEFAULT_SETTINGS, type Challenge, type Settings } from '../../shared/protocol';
import { mmss } from '../lib/clock';
import { KINDS } from '../lib/library';
import { navigate } from '../lib/nav';
import { K, load, loadCustom, loadSettings, save, saveCustom, type GameIndexEntry, type HostCreds } from '../lib/store';
import { fmtPin, Logo, Squiggle } from '../ui/bits';
import { ChallengeBrowser, ChallengePreview, readShared } from '../ui/challenges';

const DAY = 24 * 3600_000;

function recentGames(): { pin: string; createdAt: number }[] {
  const out: { pin: string; createdAt: number }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i) ?? '';
      const m = key.match(/^inkduel\.host\.(\d{6})$/);
      if (!m) continue;
      const creds = load<HostCreds | null>(key, null);
      if (creds && Date.now() - creds.createdAt < DAY) out.push({ pin: m[1], createdAt: creds.createdAt });
    }
  } catch {
    // storage blocked: nothing to resume
  }
  return out.sort((a, b) => b.createdAt - a.createdAt);
}

export function HostHome() {
  const [playlist, setPlaylist] = useState<Challenge[]>(() => load(K.playlist, []));
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...loadSettings() }));
  const [shared, setShared] = useState<Challenge | null>(() => readShared(location.hash));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [games] = useState(() => load<GameIndexEntry[]>(K.games, []));
  const live = useMemo(recentGames, []);

  useEffect(() => void save(K.playlist, playlist), [playlist]);
  useEffect(() => void save(K.settings, settings), [settings]);

  const add = (c: Challenge) => setPlaylist((p) => [...p, c]);
  const move = (i: number, d: number) =>
    setPlaylist((p) => {
      const next = p.slice();
      const [x] = next.splice(i, 1);
      next.splice(Math.max(0, Math.min(next.length, i + d)), 0, x);
      return next;
    });

  const create = async () => {
    if (!playlist.length) return;
    setBusy(true);
    setError('');
    try {
      const res = await fetch('/api/rooms', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ settings, queue: playlist }),
      });
      if (!res.ok) throw new Error();
      const { pin, token } = (await res.json()) as { pin: string; token: string };
      save(K.host(pin), { token, createdAt: Date.now() } satisfies HostCreds);
      navigate(`/host/${pin}`);
    } catch {
      setError("Couldn't reach the InkDuel server. Check the connection and try again.");
      setBusy(false);
    }
  };

  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  return (
    <div className="home">
      <header className="home-top">
        <a href="/" onClick={(e) => (e.preventDefault(), navigate('/'))}>
          <Logo size={34} />
        </a>
        <p className="home-tag">
          timed writing duels for your class. free, no student accounts.
          <Squiggle />
        </p>
      </header>

      {live.length > 0 && (
        <div className="resume">
          {live.map((g) => (
            <button key={g.pin} className="btn" onClick={() => navigate(`/host/${g.pin}`)}>
              Back to game {fmtPin(g.pin)} →
            </button>
          ))}
        </div>
      )}

      <div className="home-grid">
        <aside className="game-panel notebook">
          <h2>Your game</h2>
          {playlist.length ? (
            <ol className="playlist">
              {playlist.map((c, i) => (
                <li key={`${c.id}-${i}`}>
                  <span className="pl-n">{i + 1}</span>
                  <span className="pl-body">
                    <b>{c.title}</b>
                    <small>
                      {KINDS[c.kind]?.emoji} {c.criterion} · {mmss(c.seconds * 1000)}
                    </small>
                  </span>
                  <span className="pl-tools">
                    <button aria-label="Move up" disabled={i === 0} onClick={() => move(i, -1)}>
                      ↑
                    </button>
                    <button aria-label="Move down" disabled={i === playlist.length - 1} onClick={() => move(i, 1)}>
                      ↓
                    </button>
                    <button aria-label="Remove" onClick={() => setPlaylist((p) => p.filter((_, j) => j !== i))}>
                      ×
                    </button>
                  </span>
                </li>
              ))}
            </ol>
          ) : (
            <p className="empty">
              ← pick challenges from the library.
              <br />
              each one is a round: write, duel, vote.
            </p>
          )}

          <button className="btn btn-accent btn-big wide" disabled={!playlist.length || busy} onClick={create}>
            {busy ? 'Opening the room…' : playlist.length ? `Start a game · ${playlist.length} round${playlist.length > 1 ? 's' : ''}` : 'Start a game'}
          </button>
          {error && <p className="error">{error}</p>}

          <button className="link-btn" onClick={() => setShowSettings((x) => !x)}>
            {showSettings ? '▾' : '▸'} Game settings
          </button>
          {showSettings && <SettingsForm settings={settings} set={set} />}

          {games.length > 0 && (
            <>
              <h3>Past games on this computer</h3>
              <ul className="past">
                {games.slice(0, 8).map((g) => (
                  <li key={`${g.pin}-${g.createdAt}`}>
                    <a href={`/report/${g.pin}`} onClick={(e) => (e.preventDefault(), navigate(`/report/${g.pin}`))}>
                      {new Date(g.createdAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })} · {g.players} students · {g.titles.join(', ')}
                    </a>
                  </li>
                ))}
              </ul>
            </>
          )}
        </aside>

        <main className="library">
          <ChallengeBrowser onPick={add} pickLabel="Add to game" chosen={playlist.map((c) => c.id)} />
        </main>
      </div>

      <footer className="home-foot">
        <p>
          Students join at <b>{location.host}</b> with the PIN on your board: no accounts, no emails. Their texts are deleted from the server a day after the
          game; your report stays in this browser.
        </p>
      </footer>

      {shared && (
        <ChallengePreview
          c={shared}
          pickLabel="Save to my challenges"
          onPick={() => {
            saveCustom([shared, ...loadCustom()]);
            add(shared);
            setShared(null);
            history.replaceState(null, '', '/host');
          }}
          onClose={() => {
            setShared(null);
            history.replaceState(null, '', '/host');
          }}
          extra={<p className="note">A colleague shared this challenge with you. Saving it also adds it to your game.</p>}
        />
      )}
    </div>
  );
}

export function SettingsForm({ settings, set, live = false }: { settings: Settings; set: <K extends keyof Settings>(k: K, v: Settings[K]) => void; live?: boolean }) {
  const [blocked, setBlocked] = useState(settings.blocked.join(', '));
  return (
    <div className="settings">
      {!live && (
        <label>
          Teams
          <select value={settings.teams} onChange={(e) => set('teams', Number(e.target.value) as Settings['teams'])}>
            <option value={0}>By class size (2 to 4)</option>
            <option value={2}>2 teams</option>
            <option value={3}>3 teams</option>
            <option value={4}>4 teams</option>
          </select>
        </label>
      )}
      <label>
        Duels per student
        <select value={settings.duels} onChange={(e) => set('duels', Number(e.target.value) as 1 | 2)}>
          <option value={1}>1 duel: every text read twice</option>
          <option value={2}>2 duels: every text read four times</option>
        </select>
      </label>
      <label>
        Time to judge
        <select value={settings.duelSeconds} onChange={(e) => set('duelSeconds', Number(e.target.value))}>
          <option value={0}>Auto: longer texts get more time</option>
          {[30, 45, 60, 90, 120].map((s) => (
            <option key={s} value={s}>
              {s} seconds a duel
            </option>
          ))}
        </select>
      </label>
      <label>
        Class vote
        <select value={settings.voteSeconds} onChange={(e) => set('voteSeconds', Number(e.target.value))}>
          {[30, 45, 60, 90].map((s) => (
            <option key={s} value={s}>
              {s} seconds
            </option>
          ))}
          <option value={0}>No timer: I close it</option>
        </select>
      </label>
      <Toggle on={settings.spellcheck} set={(v) => set('spellcheck', v)} label="Spell check while writing" />
      <Toggle on={settings.blockPaste} set={(v) => set('blockPaste', v)} label="Block pasting (no copied or AI text)" />
      <Toggle on={settings.tips} set={(v) => set('tips', v)} label="Tip cards with sentence starters" />
      <Toggle on={settings.teamCard} set={(v) => set('teamCard', v)} label="Show teammates' first words while writing" />
      <Toggle on={settings.holdNames} set={(v) => set('holdNames', v)} label="Hold back texts that name a classmate" />
      <label>
        Extra words to hold back <span className="muted">comma-separated</span>
        <input
          value={blocked}
          onChange={(e) => setBlocked(e.target.value)}
          onBlur={() =>
            set(
              'blocked',
              blocked
                .split(',')
                .map((w) => w.trim())
                .filter(Boolean),
            )
          }
          placeholder="e.g. a nickname, an inside joke"
        />
      </label>
    </div>
  );
}

function Toggle({ on, set, label }: { on: boolean; set: (v: boolean) => void; label: string }) {
  return (
    <label className="toggle">
      <input type="checkbox" checked={on} onChange={(e) => set(e.target.checked)} />
      <span className="switch" aria-hidden="true" />
      {label}
    </label>
  );
}
