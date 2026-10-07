import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, type Challenge, type Settings } from '../../shared/protocol';
import { mmss } from '../lib/clock';
import { KINDS } from '../lib/library';
import { navigate } from '../lib/nav';
import { hostGames, K, load, loadCustom, loadSettings, save, saveCustom, type HostCreds } from '../lib/store';
import { ChallengeArt, fmtPin } from '../ui/bits';
import { ChallengeBrowser, ChallengePreview, readShared } from '../ui/challenges';
import { HostNav, MobileTabs, type HomeTab } from '../ui/hostnav';

const TABS: HomeTab[] = ['library', 'game', 'settings'];

export function HostHome() {
  const [playlist, setPlaylist] = useState<Challenge[]>(() => load(K.playlist, []));
  const [settings, setSettings] = useState<Settings>(() => ({ ...DEFAULT_SETTINGS, ...loadSettings() }));
  const [shared, setShared] = useState<Challenge | null>(() => readShared(location.hash));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [settingsKey, setSettingsKey] = useState(0);
  const [live] = useState(hostGames);
  // Phones show one section at a time (see MobileTabs); wider screens show them all.
  const [tab, setTabState] = useState<HomeTab>(() => {
    const t = new URLSearchParams(location.search).get('tab') as HomeTab | null;
    return t && TABS.includes(t) ? t : 'library';
  });
  const setTab = (t: HomeTab) => {
    setTabState(t);
    history.replaceState(null, '', t === 'library' ? '/host' : `/host?tab=${t}`);
    window.scrollTo(0, 0);
  };

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
  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    setSettingsKey((k) => k + 1);
  };

  return (
    <div className={`home m-${tab}`}>
      <HostNav active="build" />

      {live.length > 0 && (
        <div className="live-banner sticky">
          <span>
            🔴 {live.length === 1 ? `Game ${fmtPin(live[0].pin)} may still be running.` : `${live.length} games may still be running.`}
          </span>
          {live.length === 1 && (
            <button className="btn btn-small btn-accent" onClick={() => navigate(`/host/${live[0].pin}`)}>
              Back to the board ▸
            </button>
          )}
          <button className="btn btn-small" onClick={() => navigate('/host/games')}>
            My games
          </button>
        </div>
      )}

      <div className="home-grid">
        <aside className="game-panel notebook">
          <div className="gp-game">
          <h2>Your game</h2>
          {playlist.length ? (
            <ol className="playlist">
              {playlist.map((c, i) => (
                <li key={`${c.id}-${i}`}>
                  <span className="pl-n">{i + 1}</span>
                  <ChallengeArt challenge={c} className="pl-art" thumb />
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
              pick challenges from the<span className="nowrap"> library<span className="desk-arrow">{'\u00a0→'}</span></span>
              <br />
              each one is a round: write, duel, vote.
            </p>
          )}

          <button className="btn btn-accent btn-big wide" disabled={!playlist.length || busy} onClick={create}>
            {busy ? 'Opening the room…' : playlist.length ? `Start a game · ${playlist.length} round${playlist.length > 1 ? 's' : ''}` : 'Start a game'}
          </button>
          {playlist.length > 0 && (
            <button className="link-btn" onClick={() => setPlaylist([])}>
              Clear the list
            </button>
          )}
          {error && <p className="error">{error}</p>}
          <button className="btn m-add" onClick={() => setTab('library')}>
            + Add challenges from the library
          </button>
          </div>

          <div className="gp-settings">
          <div className="settings-head">
            <h3>Game settings</h3>
            <button className="link-btn" onClick={resetSettings}>
              Reset to defaults
            </button>
          </div>
          <SettingsForm key={settingsKey} settings={settings} set={set} />
          </div>
        </aside>

        <main className="library">
          <ChallengeBrowser onPick={add} pickLabel="Add to game" chosen={playlist.map((c) => c.id)} />
        </main>
      </div>

      {playlist.length > 0 && tab !== 'game' && (
        <div className="m-startbar">
          <button className="m-startbar-info" onClick={() => setTab('game')}>
            🎮 <b>{playlist.length === 1 ? '1 round' : `${playlist.length} rounds`}</b> ready <span>review ›</span>
          </button>
          <button className="btn btn-accent" disabled={busy} onClick={create}>
            {busy ? 'Opening…' : 'Start ▸'}
          </button>
        </div>
      )}
      <MobileTabs active={tab} onTab={setTab} rounds={playlist.length} />

      <footer className="home-foot">
        <p>
          Students join at <b>{location.host}</b> with the PIN on your board: no accounts, no emails. Their texts are deleted from the server a day after the
          game; your reports stay in this browser, under My games.
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
