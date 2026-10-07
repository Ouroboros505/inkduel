import { useEffect, useMemo, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import type { Challenge, ClientMsg, HostEntry, HostView, Settings, TeamInfo } from '../../shared/protocol';
import { mmss, remaining, useWithin } from '../lib/clock';
import { navigate } from '../lib/nav';
import { useRoom } from '../lib/room';
import { setMuted, sound } from '../lib/sound';
import { spot, TECHNIQUES, type Technique } from '../lib/spotlight';
import { K, load, localImage, save, saveReport, type HostCreds } from '../lib/store';
import {
  ChallengeArt, Countdown, fmtPin, HelloSticker, Highlighted, Logo, Modal, Nibs, plural, Qr, RISO, Squiggle, Stamp, TeamBadge, teamVars,
} from '../ui/bits';
import { ChallengeBrowser } from '../ui/challenges';
import { SettingsForm } from './HostHome';

type Send = (m: ClientMsg) => void;

const CONFETTI = (extra: string[]) => [...extra, RISO[0], RISO[1], RISO[2], '#ffffff'];

export function Board({ pin }: { pin: string }) {
  const creds = load<HostCreds | null>(K.host(pin), null);
  if (!creds) return <NotHost pin={pin} />;
  return <BoardLive pin={pin} token={creds.token} />;
}

function NotHost({ pin }: { pin: string }) {
  return (
    <main className="join">
      <Logo size={40} />
      <div className="join-card center">
        <h2>This browser isn't running game {fmtPin(pin)}</h2>
        <p className="muted">Only the computer that started a game can show its board.</p>
        <button className="btn btn-accent" onClick={() => navigate('/host')}>
          Start a new game
        </button>
      </div>
    </main>
  );
}

function BoardLive({ pin, token }: { pin: string; token: string }) {
  const [toast, setToast] = useState('');
  const [denied, setDenied] = useState(false);
  const [panel, setPanel] = useState(false);
  const [picker, setPicker] = useState<null | 'swap' | 'next'>(null);
  const [reader, setReader] = useState<number | null>(null);
  const [muted, setMutedState] = useState(() => load(K.sound, false));
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  const { view, status, offset, send } = useRoom<HostView>(
    pin,
    (send) => send({ t: 'hello', role: 'host', token }),
    (msg) => {
      if (msg.t === 'report') saveReport(msg.report);
      if (msg.t === 'error') {
        if (msg.code === 'bad-token') setDenied(true);
        setToast(msg.message);
        clearTimeout(toastTimer.current);
        toastTimer.current = setTimeout(() => setToast(''), 4000);
      }
    },
  );

  useEffect(() => {
    setMuted(muted);
    save(K.sound, muted);
  }, [muted]);

  // Keep a copy of the report in this browser after every round, so the teacher has the texts
  // even if she never opens the report page.
  useEffect(() => {
    if (view && (view.phase === 'results' || view.phase === 'summary')) send({ t: 'report' });
  }, [view?.phase, view?.round]);

  useEffect(() => {
    if (view?.phase !== 'finals') setReader(null);
  }, [view?.phase]);

  useBoardSounds(view, offset);
  const hurry = useWithin(view?.clock, offset, 20_000) && view?.phase === 'writing';

  if (denied) return <NotHost pin={pin} />;
  if (status === 'gone')
    return (
      <main className="join">
        <Logo size={40} />
        <div className="join-card center">
          <h2>This game has ended</h2>
          <p className="muted">Rooms are deleted a day after the last activity.</p>
          <button className="btn btn-accent" onClick={() => navigate(`/report/${pin}`)}>
            Open the saved report
          </button>
        </div>
      </main>
    );
  if (!view)
    return (
      <main className="join">
        <Logo size={40} />
        <p className="hand-note">{status === 'retrying' ? 'Reconnecting to the game…' : 'Opening the board…'}</p>
      </main>
    );

  const fins = view.finalists.map((id) => view.entries.find((e) => e.id === id)).filter((e): e is HostEntry => !!e);
  const totalRounds = view.round + view.queue.length;

  return (
    <div className={`board phase-${view.phase}${hurry ? ' hurry' : ''}`}>
      <header className="board-top">
        <Logo size={26} light />
        {view.phase !== 'lobby' && view.phase !== 'summary' && (
          <span className="board-join">
            Join at <b>{location.host}</b> · PIN <b>{fmtPin(view.pin)}</b>
          </span>
        )}
        <span className="spacer" />
        {view.round > 0 && view.phase !== 'summary' && (
          <span className="board-round">
            Round {view.round}
            {totalRounds > 1 ? ` of ${totalRounds}` : ''}
          </span>
        )}
        {status !== 'open' && <span className="conn">reconnecting…</span>}
        <button className="icon-btn" onClick={() => setMutedState((m) => !m)} aria-label={muted ? 'Sound on' : 'Sound off'} title={muted ? 'Sound on' : 'Sound off'}>
          {muted ? '🔇' : '🔊'}
        </button>
        <button
          className="icon-btn"
          title="Full screen"
          aria-label="Full screen"
          onClick={() => (document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen()).catch(() => {})}
        >
          ⛶
        </button>
        <button className={`btn btn-small${panel ? ' on' : ''}`} onClick={() => setPanel((p) => !p)}>
          Teacher panel
        </button>
      </header>

      <main className="board-stage">
        {view.phase === 'lobby' && <Lobby view={view} send={send} />}
        {view.phase === 'intro' && <Intro view={view} />}
        {view.phase === 'writing' && <WritingStage view={view} offset={offset} />}
        {view.phase === 'duel' && <DuelStage view={view} offset={offset} />}
        {view.phase === 'finals' && <FinalsStage view={view} fins={fins} send={send} onRead={setReader} />}
        {view.phase === 'vote' && <VoteStage view={view} fins={fins} offset={offset} />}
        {view.phase === 'results' && <ResultsStage view={view} fins={fins} send={send} />}
        {view.phase === 'summary' && <SummaryStage view={view} />}
      </main>

      <footer className="board-controls">
        <Controls view={view} send={send} offset={offset} openPicker={setPicker} />
      </footer>

      {reader !== null && fins[reader] && (
        <Reader entries={fins} index={reader} teams={view.teams} setIndex={setReader} onClose={() => setReader(null)} />
      )}
      {panel && <TeacherPanel view={view} send={send} onClose={() => setPanel(false)} />}
      {picker && (
        <Modal onClose={() => setPicker(null)} label="Pick a challenge" wide>
          <h2 className="modal-title">{picker === 'swap' ? 'Swap this round’s challenge' : 'Pick the next challenge'}</h2>
          <ChallengeBrowser
            pickLabel="Use this one"
            onPick={(c: Challenge) => {
              if (picker === 'swap') send({ t: 'swap', challenge: c });
              else send({ t: 'queue', challenges: [c, ...view.queue.slice(1)] });
              setPicker(null);
            }}
          />
        </Modal>
      )}
      {toast && <div className="toast">{toast}</div>}
    </div>
  );
}

function useBoardSounds(view: HostView | null, offset: number) {
  const prev = useRef<{ phase: string; players: number } | null>(null);
  useEffect(() => {
    if (!view) return;
    const p = prev.current;
    prev.current = { phase: view.phase, players: view.players.length };
    if (!p) return;
    if (view.phase !== p.phase) {
      if (view.phase === 'writing' || view.phase === 'duel' || view.phase === 'vote') sound.start();
      if (p.phase === 'writing') sound.end();
      if (view.phase === 'results') sound.fanfare();
    } else if (view.phase === 'lobby' && view.players.length > p.players) sound.join();
  }, [view]);

  const clock = view?.clock;
  const phase = view?.phase;
  useEffect(() => {
    if (!clock || clock.endsAt === null || clock.paused !== null) return;
    let last = -1;
    const id = setInterval(() => {
      const left = remaining(clock, offset);
      if (left === null) return;
      const s = Math.ceil(left / 1000);
      if (s === last) return;
      last = s;
      if (s === 20 && phase === 'writing') sound.warn();
      else if (s <= 5 && s > 0) sound.tick();
    }, 200);
    return () => clearInterval(id);
  }, [clock?.endsAt, clock?.paused, offset, phase]);
}

// ---- stages ---------------------------------------------------------------------------------

function Lobby({ view, send }: { view: HostView; send: Send }) {
  const [armed, setArmed] = useState<string | null>(null);
  const url = `${location.origin}/?pin=${view.pin}`;
  const next = view.queue[0];
  const n = view.players.length;
  return (
    <div className="lobby">
      <section className="lobby-join">
        <h1 className="lobby-head">
          Grab a device.
          <br />
          <span>Join the duel.</span>
        </h1>
        <p className="lobby-go">
          Go to <b className="hl">{location.host}</b>
        </p>
        <div className="pin-card">
          <span className="pin-label">game PIN ↓</span>
          <div className="lobby-pin">{fmtPin(view.pin)}</div>
        </div>
        <div className="lobby-qr">
          <figure className="polaroid taped">
            <Qr text={url} size={170} />
            <figcaption>scan me</figcaption>
          </figure>
          <p className="lobby-qr-note">
            No account.
            <br />
            Just your first name.
          </p>
        </div>
      </section>
      <section className="lobby-players">
        <div className="lobby-count">
          {n ? `${plural(n, 'writer')} in!` : 'Waiting for writers…'}
          <Squiggle />
        </div>
        {view.locked && <p className="note">🔒 The game is locked: nobody new can join.</p>}
        {n ? (
          <div className="sticker-wall">
            {view.players.map((p) => (
              <button
                key={p.id}
                className={`${p.online ? '' : 'off'}${armed === p.id ? ' armed' : ''}`}
                onClick={() => (armed === p.id ? (send({ t: 'kick', id: p.id }), setArmed(null)) : setArmed(p.id))}
                onBlur={() => setArmed(null)}
                title="Click twice to remove"
              >
                <HelloSticker name={armed === p.id ? 'remove?' : p.name} seed={p.name} />
              </button>
            ))}
          </div>
        ) : (
          <div className="lobby-empty">
            <Nibs size={90} />
            <p className="hand-note">Name stickers land here as students join.</p>
          </div>
        )}
        {next && (
          <div className="up-next card">
            <ChallengeArt challenge={next} className="up-next-art" />
            <div>
              <span className="eyebrow">First challenge</span>
              <b>{next.title}</b>
              <small>
                Wins: {next.criterion} · {mmss(next.seconds * 1000)} to write
              </small>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}

function Intro({ view }: { view: HostView }) {
  const c = view.challenge!;
  return (
    <div className="stage-intro">
      <div className="intro-main">
        <div className="intro-text">
          <Stamp slam className="round-stamp">
            Round {view.round}
          </Stamp>
          <h1 className="board-title">{c.title}</h1>
          <div className="prompt-sheet notebook">
            <p className="board-prompt">{c.prompt}</p>
          </div>
          <div className="crit">
            <span className="sticky">Wins: {c.criterion}</span>
            <span className="hand">{c.question}</span>
          </div>
          {view.settings.tips && c.tips.length > 0 && (
            <ul className="board-tips">
              {c.tips.map((t) => (
                <li key={t} className="sticky">
                  {t}
                </li>
              ))}
            </ul>
          )}
        </div>
        <ChallengeArt challenge={c} className="board-art" polaroid />
      </div>
      <div className="team-strip">
        {view.teams.map((t) => (
          <div key={t.id} className="team-tile" style={teamVars(t)}>
            <span className="team-tile-emoji">{t.emoji}</span>
            <span>
              <b>{t.name}</b>
              <br />
              <small>
                {plural(t.size, 'writer')}
                {t.points > 0 ? ` · ${plural(t.points, 'point')}` : ''}
              </small>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function WritingStage({ view, offset }: { view: HostView; offset: number }) {
  const c = view.challenge!;
  const max = Math.max(1, ...Object.values(view.teamWords));
  // Picture prompts need the picture while students write; emoji-only challenges don't.
  const hasPicture = !!(c.image ?? (c.custom ? localImage(c.id) : undefined));
  return (
    <div className="stage-writing">
      <div className="writing-left">
        <p className="eyebrow">Write!</p>
        <h1 className="board-title small">{c.title}</h1>
        <div className="prompt-row">
          <div className="prompt-col">
            <div className="prompt-sheet notebook">
              <p className="board-prompt">{c.prompt}</p>
            </div>
            <div className="crit">
              <span className="sticky">Wins: {c.criterion}</span>
            </div>
          </div>
          {hasPicture && <ChallengeArt challenge={c} className="board-art prompt-pic" polaroid />}
        </div>
      </div>
      <div className="writing-right">
        <Countdown clock={view.clock} offset={offset} size={290} />
        <div className="live-stats">
          <div>
            <b>{view.progress.done}</b>
            <span>of {view.progress.total} done</span>
          </div>
          <div>
            <b>{view.progress.words.toLocaleString()}</b>
            <span>words so far</span>
          </div>
        </div>
        <div className="race" aria-label="Words per team">
          {view.teams.map((t) => {
            const w = view.teamWords[t.id] ?? 0;
            const pct = (w / max) * 100;
            return (
              <div key={t.id} className="lane" style={teamVars(t)}>
                <div className="lane-track">
                  <div className="lane-fill" style={{ width: `${pct}%` }} />
                  <span className="runner" style={{ left: `${Math.max(4, Math.min(96, pct))}%` }}>
                    {t.emoji}
                  </span>
                </div>
                <b>{w.toLocaleString()}</b>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function DuelStage({ view, offset }: { view: HostView; offset: number }) {
  const c = view.challenge!;
  const pct = view.progress.total ? (view.progress.done / view.progress.total) * 100 : 0;
  return (
    <div className="stage-duel">
      <div className="duel-hero">
        <div className="mini-duel" aria-hidden="true">
          <div className="mini-card">A</div>
          <span className="vs">VS</span>
          <div className="mini-card">B</div>
        </div>
        <h1 className="duel-title">
          Duel <span>time!</span>
        </h1>
        <p className="board-sub">Two texts from your team are on your screen. Read both, then pick the one that answers:</p>
        <div className="speech">
          <p className="board-q">{c.question}</p>
        </div>
      </div>
      <div className="duel-side">
        <Countdown clock={view.clock} offset={offset} size={240} warnAt={10_000} />
        <div className="progress">
          <div className="progress-track">
            <div className="progress-fill" style={{ width: `${pct}%` }} />
          </div>
          <span>
            {view.progress.done} of {plural(view.progress.total, 'duel')} judged
          </span>
        </div>
      </div>
    </div>
  );
}

function FinalCard({ e, i, team, onRead, onVeto }: { e: HostEntry; i: number; team?: TeamInfo; onRead?: () => void; onVeto?: () => void }) {
  const [armed, setArmed] = useState(false);
  return (
    <article className="final index-card final-card" style={teamVars(team)}>
      <div className="card-head">
        <span className="letter">{String.fromCharCode(65 + i)}</span>
        <TeamBadge team={team} />
        <span className="spacer" />
        {onVeto &&
          (armed ? (
            <button className="btn btn-small danger" onClick={onVeto} onBlur={() => setArmed(false)}>
              Swap for runner-up?
            </button>
          ) : (
            <button className="icon-btn veto" title="Replace this text with the team's runner-up" aria-label="Replace this text" onClick={() => setArmed(true)}>
              ✕
            </button>
          ))}
      </div>
      <p className="card-text">{e.text}</p>
      <footer>
        <span className="muted">{plural(e.words, 'word')}</span>
        {onRead && (
          <button className="btn btn-small" onClick={onRead}>
            Read aloud ▸
          </button>
        )}
      </footer>
    </article>
  );
}

function FinalsStage({ view, fins, send, onRead }: { view: HostView; fins: HostEntry[]; send: Send; onRead: (i: number) => void }) {
  if (!fins.length)
    return (
      <div className="stage-center">
        <h1 className="board-title">No finalists this round</h1>
        <p className="hand-note">Nobody wrote enough to duel. Try another challenge!</p>
      </div>
    );
  return (
    <div className="stage-finals">
      <div className="stage-head">
        <p className="eyebrow">The finalists</p>
        <h1 className="board-title small">{fins.length > 1 ? 'The best text from each team' : 'The winning text'}</h1>
        <p className="board-sub">Each one won its team's duels. Read them aloud, then open the vote.</p>
      </div>
      <div className={`final-grid n${fins.length}`}>
        {fins.map((e, i) => (
          <FinalCard key={e.id} e={e} i={i} team={view.teams.find((t) => t.id === e.team)} onRead={() => onRead(i)} onVeto={() => send({ t: 'veto', id: e.id })} />
        ))}
      </div>
    </div>
  );
}

function Reader({ entries, index, teams, setIndex, onClose }: { entries: HostEntry[]; index: number; teams: TeamInfo[]; setIndex: (i: number) => void; onClose: () => void }) {
  const e = entries[index];
  const team = teams.find((t) => t.id === e.team);
  const found = useMemo(() => spot(e.text), [e.text]);
  const [tech, setTech] = useState<Technique | null>(null);
  useEffect(() => setTech(null), [index]);
  useEffect(() => {
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') onClose();
      if (ev.key === 'ArrowRight' && index < entries.length - 1) setIndex(index + 1);
      if (ev.key === 'ArrowLeft' && index > 0) setIndex(index - 1);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [index, entries.length]);
  const kinds = (Object.keys(TECHNIQUES) as Technique[]).filter((k) => found[k]);
  return (
    <div className="reader" style={teamVars(team)}>
      <header>
        <span className="letter">{String.fromCharCode(65 + index)}</span>
        <TeamBadge team={team} big />
        <span className="spacer" />
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <div className="reader-page">
        <div className="reader-text notebook" key={tech ?? 'none'}>
          <Highlighted text={e.text} marks={tech ? found[tech] : undefined} color={tech ? TECHNIQUES[tech].color : undefined} />
        </div>
      </div>
      <footer>
        <button className="btn" disabled={index === 0} onClick={() => setIndex(index - 1)}>
          ◂ {index > 0 ? String.fromCharCode(64 + index) : ''}
        </button>
        <div className="tech-chips">
          <span className="tech-label">Spot the technique:</span>
          {kinds.map((k) => (
            <button
              key={k}
              className={`tech${tech === k ? ' on' : ''}`}
              style={{ '--chip': TECHNIQUES[k].color } as React.CSSProperties}
              title={TECHNIQUES[k].hint}
              onClick={() => setTech(tech === k ? null : k)}
            >
              {TECHNIQUES[k].label}
              {k !== 'opening' && <small>{found[k]!.length}</small>}
            </button>
          ))}
        </div>
        <button className="btn" disabled={index === entries.length - 1} onClick={() => setIndex(index + 1)}>
          {index < entries.length - 1 ? String.fromCharCode(66 + index) : ''} ▸
        </button>
      </footer>
      {tech && <p className="tech-hint">{TECHNIQUES[tech].hint}</p>}
    </div>
  );
}

function VoteStage({ view, fins, offset }: { view: HostView; fins: HostEntry[]; offset: number }) {
  const pct = view.progress.total ? (view.progress.done / view.progress.total) * 100 : 0;
  return (
    <div className="stage-vote">
      <div className="stage-head row-head">
        <div>
          <p className="eyebrow">Class vote · on your screen</p>
          <h1 className="board-title small">{view.challenge?.question}</h1>
          <p className="board-sub">You can vote for any text except your own.</p>
        </div>
        <div className="vote-side">
          {view.clock.endsAt !== null || view.clock.paused !== null ? <Countdown clock={view.clock} offset={offset} size={150} warnAt={10_000} /> : null}
          <div className="progress">
            <div className="progress-track">
              <div className="progress-fill" style={{ width: `${pct}%` }} />
            </div>
            <span>
              {view.progress.done} of {plural(view.progress.total, 'vote')}
            </span>
          </div>
        </div>
      </div>
      <div className={`final-grid n${fins.length}`}>
        {fins.map((e, i) => (
          <FinalCard key={e.id} e={e} i={i} team={view.teams.find((t) => t.id === e.team)} />
        ))}
      </div>
    </div>
  );
}

function ResultsStage({ view, fins, send }: { view: HostView; fins: HostEntry[]; send: Send }) {
  const max = Math.max(1, ...fins.map((e) => e.votes));
  const winners = view.teams.filter((t) => view.winners.includes(t.id));
  const top = fins.find((e) => view.winners.includes(e.team));
  const topTeam = view.teams.find((t) => t.id === top?.team);
  useEffect(() => {
    if (!winners.length) return;
    const colors = CONFETTI(winners.map((w) => w.color));
    void confetti({ particleCount: 160, spread: 100, origin: { x: 0.3, y: 0.6 }, colors });
    const id = setTimeout(() => void confetti({ particleCount: 140, spread: 100, origin: { x: 0.7, y: 0.6 }, colors }), 350);
    return () => clearTimeout(id);
  }, [view.round]);
  const standings = [...view.teams].sort((a, b) => b.points - a.points);
  return (
    <div className="stage-results">
      <div className="results-head">
        <span className="results-emoji" aria-hidden="true">
          {winners.length ? winners.map((w) => w.emoji).join(' ') : '🤝'}
        </span>
        <h1 className="board-title">{winners.length ? `The ${winners.map((w) => w.name).join(' & ')} win round ${view.round}!` : `Round ${view.round}: no votes`}</h1>
      </div>
      <div className="results-left">
        <div className="result-bars">
          {fins.map((e, i) => {
            const team = view.teams.find((t) => t.id === e.team);
            return (
              <div key={e.id} className={`rbar${view.winners.includes(e.team) ? ' win' : ''}`} style={teamVars(team)}>
                <span className="letter">{String.fromCharCode(65 + i)}</span>
                <span className="rbar-team">{team?.emoji}</span>
                <div className="rbar-track">
                  <div className="rbar-fill" style={{ width: `${(e.votes / max) * 100}%`, animationDelay: `${i * 0.15}s` }} />
                </div>
                <b className="rbar-n">{e.votes}</b>
                <button className={`reveal${e.revealed ? ' shown' : ''}`} onClick={() => send({ t: 'reveal', id: e.id })} title="Show or hide the writer's name">
                  {e.revealed ? e.authorName : 'who wrote it?'}
                </button>
              </div>
            );
          })}
        </div>
        {top && (
          <article className="winning-text index-card" style={teamVars(topTeam)}>
            <Stamp slam>Winner</Stamp>
            <p className="card-text">{top.text}</p>
            {top.revealed && <cite>by {top.authorName}</cite>}
          </article>
        )}
      </div>
      <div className="scoreboard card">
        <h3>Scoreboard</h3>
        {standings.map((t) => (
          <div key={t.id} className="score">
            <TeamBadge team={t} />
            <span className="spacer" />
            {view.points[t.id] ? <span className="plus">+{view.points[t.id]}</span> : null}
            <b>{t.points}</b>
          </div>
        ))}
      </div>
    </div>
  );
}

function SummaryStage({ view }: { view: HostView }) {
  const standings = [...view.teams].sort((a, b) => b.points - a.points);
  const wall = view.entries.filter((e) => !e.held && e.text.trim());
  const champs = standings.filter((t) => t.points === standings[0]?.points && t.points > 0);
  useEffect(() => {
    void confetti({ particleCount: 220, spread: 120, origin: { y: 0.55 }, colors: CONFETTI(champs.map((c) => c.color)) });
  }, []);
  return (
    <div className="stage-summary">
      <div className="summary-title">
        <Stamp slam>Final scores</Stamp>
        <h1 className="board-title">{champs.length ? `The ${champs.map((c) => c.name).join(' & ')} win the game!` : 'Game over!'}</h1>
      </div>
      <div className="podium">
        {standings.slice(0, 3).map((t, i) => (
          <div key={t.id} className={`step step-${i + 1}`} style={teamVars(t)}>
            <span className="step-emoji">{t.emoji}</span>
            <b>{t.name}</b>
            <span>{plural(t.points, 'point')}</span>
            <div className="step-block">{i + 1}</div>
          </div>
        ))}
      </div>
      <div className="summary-right">
        <div className="summary-stats">
          <div>
            <b>{view.stats.words.toLocaleString()}</b>
            <span>words written</span>
          </div>
          <div>
            <b>{view.stats.texts}</b>
            <span>texts</span>
          </div>
          <div>
            <b>{view.stats.rounds}</b>
            <span>{view.stats.rounds === 1 ? 'round' : 'rounds'}</span>
          </div>
          <div>
            <b>{view.players.length}</b>
            <span>writers</span>
          </div>
        </div>
        {wall.length > 0 && (
          <div className="wall" aria-label="Texts from the last round">
            <div className="wall-track">
              {[...wall, ...wall].map((e, i) => (
                <p key={i} className="wall-text" style={teamVars(view.teams.find((t) => t.id === e.team))}>
                  {e.text}
                </p>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

// ---- controls -------------------------------------------------------------------------------

function Controls({ view, send, offset, openPicker }: { view: HostView; send: Send; offset: number; openPicker: (m: 'swap' | 'next') => void }) {
  const paused = view.clock.paused !== null;
  const unlock = () => sound.unlock();
  const end = (
    <button className="btn btn-ghost" onClick={() => confirm('End the game now and show the final scores?') && send({ t: 'end' })}>
      End game
    </button>
  );
  switch (view.phase) {
    case 'lobby':
      return (
        <>
          <button className="btn btn-ghost" onClick={() => send({ t: 'lock', locked: !view.locked })}>
            {view.locked ? '🔓 Unlock' : '🔒 Lock joining'}
          </button>
          <span className="spacer" />
          {!view.queue.length && (
            <button className="btn" onClick={() => openPicker('next')}>
              Pick a challenge
            </button>
          )}
          <button className="btn btn-accent btn-big" disabled={!view.players.length || !view.queue.length} onClick={() => (unlock(), send({ t: 'start' }))}>
            {view.players.length ? `Start with ${plural(view.players.length, 'writer')} ▸` : 'Waiting for writers…'}
          </button>
        </>
      );
    case 'intro':
      return (
        <>
          {end}
          <span className="spacer" />
          <button className="btn" onClick={() => openPicker('swap')}>
            Swap challenge
          </button>
          <button className="btn btn-accent btn-big" onClick={() => (unlock(), send({ t: 'write' }))}>
            Start writing · {mmss((view.challenge?.seconds ?? 0) * 1000)} ▸
          </button>
        </>
      );
    case 'writing':
    case 'duel':
    case 'vote': {
      const left = remaining(view.clock, offset);
      const label = view.phase === 'writing' ? 'End writing now' : view.phase === 'duel' ? 'End the duels now' : 'Close the vote';
      return (
        <>
          {end}
          <span className="spacer" />
          {(view.clock.endsAt !== null || paused) && (
            <>
              <button className="btn" onClick={() => send({ t: paused ? 'resume' : 'pause' })}>
                {paused ? '▶ Resume' : '❚❚ Pause'}
              </button>
              <button className="btn" onClick={() => send({ t: 'time', seconds: 30 })}>
                +30 s
              </button>
              {left !== null && left > 40_000 && (
                <button className="btn" onClick={() => send({ t: 'time', seconds: -30 })}>
                  −30 s
                </button>
              )}
            </>
          )}
          <button className="btn btn-accent btn-big" onClick={() => send({ t: 'skip' })}>
            {label} ▸
          </button>
        </>
      );
    }
    case 'finals':
      return (
        <>
          {end}
          <span className="spacer" />
          <button className="btn btn-accent btn-big" onClick={() => (unlock(), send({ t: 'vote' }))}>
            {view.finalists.length > 1 ? 'Open the class vote ▸' : 'Show the result ▸'}
          </button>
        </>
      );
    case 'results': {
      const next = view.queue[0];
      return (
        <>
          <button className="btn btn-ghost" onClick={() => send({ t: 'end' })}>
            Finish the game
          </button>
          <span className="spacer" />
          {next ? (
            <>
              <span className="next-up">
                next up: <b>{next.title}</b>
              </span>
              <button className="btn" onClick={() => openPicker('next')}>
                Change
              </button>
              <button className="btn btn-accent btn-big" onClick={() => send({ t: 'next' })}>
                Next round ▸
              </button>
            </>
          ) : (
            <button className="btn btn-accent btn-big" onClick={() => openPicker('next')}>
              Play another round ▸
            </button>
          )}
        </>
      );
    }
    case 'summary':
      return (
        <>
          <button className="btn" onClick={() => navigate('/host')}>
            New game
          </button>
          <span className="spacer" />
          <button className="btn btn-accent btn-big" onClick={() => window.open(`/report/${view.pin}`, '_blank')}>
            Open the teacher report ▸
          </button>
        </>
      );
  }
}

// ---- teacher panel --------------------------------------------------------------------------

function TeacherPanel({ view, send, onClose }: { view: HostView; send: Send; onClose: () => void }) {
  const [tab, setTab] = useState<'students' | 'texts' | 'settings'>('students');
  const [armed, setArmed] = useState<string | null>(null);
  const [openText, setOpenText] = useState<string | null>(null);
  const teamOf = (id: number | null) => view.teams.find((t) => t.id === id);
  const hasTexts = view.entries.some((e) => e.text);
  const set = <K extends keyof Settings>(k: K, v: Settings[K]) => send({ t: 'settings', settings: { ...view.settings, [k]: v } });
  return (
    <aside className="panel" aria-label="Teacher panel">
      <header>
        <h2>Teacher panel</h2>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          ✕
        </button>
      </header>
      <p className="panel-warn">Names show here! If your screen is projected, close this before the class looks.</p>
      <div className="browser-tabs">
        <button className={tab === 'students' ? 'on' : ''} onClick={() => setTab('students')}>
          Students <span className="count">{view.players.length}</span>
        </button>
        <button className={tab === 'texts' ? 'on' : ''} onClick={() => setTab('texts')} disabled={!hasTexts}>
          Texts
        </button>
        <button className={tab === 'settings' ? 'on' : ''} onClick={() => setTab('settings')}>
          Settings
        </button>
      </div>

      {tab === 'students' && (
        <table className="panel-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Team</th>
              <th>{view.phase === 'writing' ? 'Words' : ''}</th>
              <th />
            </tr>
          </thead>
          <tbody>
            {[...view.players]
              .sort((a, b) => (a.team ?? 9) - (b.team ?? 9) || a.name.localeCompare(b.name))
              .map((p) => (
                <tr key={p.id} className={p.online ? '' : 'off'}>
                  <td>
                    <span className={`dot${p.online ? ' on' : ''}`} title={p.online ? 'Connected' : 'Not connected'} />
                    {p.name}
                    {p.late && <small className="muted"> next round</small>}
                  </td>
                  <td>{teamOf(p.team)?.emoji ?? '–'}</td>
                  <td>{view.phase === 'writing' ? `${p.words}${p.done ? ' ✓' : ''}` : ''}</td>
                  <td>
                    <button
                      className={`btn btn-small${armed === p.id ? ' danger' : ' btn-ghost'}`}
                      onClick={() => (armed === p.id ? (send({ t: 'kick', id: p.id }), setArmed(null)) : setArmed(p.id))}
                      onBlur={() => setArmed(null)}
                    >
                      {armed === p.id ? 'Remove?' : 'Remove'}
                    </button>
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      )}

      {tab === 'texts' && (
        <div className="panel-texts">
          {view.teams.map((t) => (
            <section key={t.id}>
              <h3>
                <TeamBadge team={t} />
              </h3>
              {view.entries
                .filter((e) => e.team === t.id)
                .sort((a, b) => b.wins - a.wins || b.words - a.words)
                .map((e) => (
                  <div key={e.id} className={`ptext${e.held ? ' held' : ''}`}>
                    <button className="ptext-head" onClick={() => setOpenText(openText === e.id ? null : e.id)}>
                      <b>{e.authorName}</b>
                      <span className="muted">
                        {plural(e.words, 'word')}
                        {e.reads ? ` · won ${e.wins}/${e.reads}` : ''}
                      </span>
                      {e.finalist && <span className="chip chip-accent">finalist</span>}
                      {e.held && <span className="chip chip-warn">{e.heldDetail}</span>}
                    </button>
                    {openText === e.id && <p className="ptext-body">{e.text || <em>Nothing written.</em>}</p>}
                  </div>
                ))}
            </section>
          ))}
          <p className="muted small">Held texts sit out the duels and the final. The full report has every text.</p>
        </div>
      )}

      {tab === 'settings' && (
        <div className="panel-settings">
          <label className="toggle">
            <input type="checkbox" checked={view.locked} onChange={(e) => send({ t: 'lock', locked: e.target.checked })} />
            <span className="switch" aria-hidden="true" />
            Lock the game (nobody new can join)
          </label>
          <SettingsForm settings={view.settings} set={set} live />
          <p className="muted small">Changes apply from the next phase on.</p>
        </div>
      )}
    </aside>
  );
}
