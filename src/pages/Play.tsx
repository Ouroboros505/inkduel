import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { countWords, MAX_NAME, MAX_TEXT, type ClientMsg, type PlayerView, type TeamInfo } from '../../shared/protocol';
import { useTimeUp, useWithin } from '../lib/clock';
import { navigate } from '../lib/nav';
import { useRoom, type Status } from '../lib/room';
import { drop, K, load, save } from '../lib/store';
import { ChallengeArt, Countdown, HelloSticker, LogoLink, plural, Stamp, TeamBadge, teamVars } from '../ui/bits';

type Send = (m: ClientMsg) => void;
interface Creds {
  id: string;
  token: string;
}

export function Play({ pin }: { pin: string }) {
  const [creds, setCreds] = useState<Creds | null>(() => load<Creds | null>(K.player(pin), null));
  const [askName, setAskName] = useState(false);
  const [error, setError] = useState('');
  const [stop, setStop] = useState<string | null>(null);
  const credsRef = useRef(creds);
  const pending = useRef<string | null>(load<string | null>(K.pending(pin), null));
  credsRef.current = creds;

  const { view, status, offset, send } = useRoom<PlayerView>(
    pin,
    (send) => {
      const c = credsRef.current;
      if (c) send({ t: 'hello', role: 'player', id: c.id, token: c.token });
      else if (pending.current) send({ t: 'join', name: pending.current });
      else setAskName(true);
    },
    (msg) => {
      if (msg.t === 'joined') {
        const c = { id: msg.id, token: msg.token };
        save(K.player(pin), c);
        drop(K.pending(pin));
        pending.current = null;
        setCreds(c);
        setAskName(false);
        setError('');
      } else if (msg.t === 'error') {
        if (msg.code === 'unknown-player') {
          drop(K.player(pin));
          setCreds(null);
          setAskName(true);
        } else if (msg.code === 'name-taken' || msg.code === 'bad-name') {
          pending.current = null;
          drop(K.pending(pin));
          setError(msg.message);
          setAskName(true);
        } else if (['locked', 'full', 'over', 'gone'].includes(msg.code)) {
          drop(K.pending(pin));
          setStop(msg.message);
        }
      } else if (msg.t === 'kicked') {
        drop(K.player(pin));
        setStop('Your teacher removed you from this game.');
      }
    },
  );

  if (stop || status === 'gone')
    return (
      <Notice title={stop ?? 'This game has ended.'}>
        <button className="btn btn-accent" onClick={() => navigate('/')}>
          Join another game
        </button>
      </Notice>
    );

  if (askName && !creds)
    return (
      <NameForm
        error={error}
        onJoin={(name) => {
          pending.current = name;
          setError('');
          send({ t: 'join', name });
        }}
      />
    );

  if (!view)
    return (
      <Notice title={status === 'retrying' ? 'Reconnecting…' : 'Joining…'}>
        <p className="muted">Game {pin}</p>
      </Notice>
    );

  return <Game view={view} offset={offset} send={send} status={status} />;
}

function Notice({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <main className="join">
      <LogoLink to="/" size={40} />
      <div className="join-card center">
        <h2>{title}</h2>
        {children}
      </div>
    </main>
  );
}

function NameForm({ onJoin, error }: { onJoin: (name: string) => void; error: string }) {
  const [name, setName] = useState('');
  return (
    <main className="join">
      <LogoLink to="/" size={40} />
      <form
        className="join-card"
        onSubmit={(e) => {
          e.preventDefault();
          if (name.trim()) onJoin(name.trim());
        }}
      >
        <label htmlFor="name">Your name</label>
        <input id="name" className="name-input" maxLength={MAX_NAME} autoFocus autoComplete="off" placeholder="First name and initial" value={name} onChange={(e) => setName(e.target.value)} />
        <button className="btn btn-accent btn-big wide">Join the game</button>
        {error && <p className="error">{error}</p>}
      </form>
    </main>
  );
}

function Game({ view, offset, send, status }: { view: PlayerView; offset: number; send: Send; status: Status }) {
  const team = view.teams.find((t) => t.id === view.me.team);
  const timed = ['writing', 'duel', 'vote'].includes(view.phase) && !view.me.late;
  return (
    <div className="play" style={teamVars(team)}>
      <header className="play-top">
        <span className="play-me">
          <LogoLink to="/" mark size={30} ask={view.phase === 'summary' ? undefined : 'Leave this game? You can get back in with the same PIN.'} />
          {team && <TeamBadge team={team} />}
          <span className="play-name">{view.me.name}</span>
        </span>
        {status !== 'open' && <span className="conn">reconnecting…</span>}
        {timed && <Countdown clock={view.clock} offset={offset} size={54} />}
      </header>
      <main className="play-main">
        <Phase view={view} offset={offset} send={send} status={status} team={team} />
      </main>
    </div>
  );
}

function Phase({ view, offset, send, status, team }: { view: PlayerView; offset: number; send: Send; status: Status; team?: TeamInfo }) {
  if (view.me.late && view.phase !== 'summary')
    return (
      <Wait emoji="⏳" title="You're in for the next round">
        This round started before you joined. {team ? `You're on the ${team.name}.` : ''} Watch the board until the next round.
      </Wait>
    );
  switch (view.phase) {
    case 'lobby':
      return (
        <div className="wait">
          <HelloSticker name={view.me.name} big />
          <h2>You're in!</h2>
          <p>The game starts when your teacher is ready.</p>
          <p className="hand-note">eyes on the board ↑</p>
        </div>
      );
    case 'intro':
      return <Intro view={view} team={team} />;
    case 'writing':
      return <Writing key={view.round} view={view} offset={offset} send={send} status={status} />;
    case 'duel':
      return <Duels key={view.round} view={view} send={send} />;
    case 'finals':
    case 'vote':
      return <Finals view={view} send={send} />;
    case 'results':
      return <Results view={view} team={team} />;
    case 'summary':
      return <Summary view={view} />;
  }
}

function Wait({ emoji, title, children }: { emoji: string; title: string; children?: React.ReactNode }) {
  return (
    <div className="wait">
      <div className="wait-emoji" aria-hidden="true">
        {emoji}
      </div>
      <h2>{title}</h2>
      {children && <p>{children}</p>}
    </div>
  );
}

function Intro({ view, team }: { view: PlayerView; team?: TeamInfo }) {
  const c = view.challenge;
  return (
    <div className="intro">
      {team && (
        <div className="team-reveal" style={teamVars(team)}>
          <span className="team-reveal-emoji">{team.emoji}</span>
          <span>
            You're on the <b>{team.name}</b>
          </span>
        </div>
      )}
      {c && (
        <section className="prompt-card">
          {c.image && <ChallengeArt challenge={c} className="intro-art" />}
          <p className="eyebrow">Round {view.round}</p>
          <h2>{c.title}</h2>
          <p className="prompt-text">{c.prompt}</p>
          <p>
            <span className="chip chip-accent">Wins: {c.criterion}</span>
          </p>
        </section>
      )}
      <p className="muted center">Get ready. Writing starts when your teacher says go.</p>
    </div>
  );
}

function Writing({ view, offset, send, status }: { view: PlayerView; offset: number; send: Send; status: Status }) {
  const c = view.challenge!;
  const [text, setText] = useState(view.draft?.text ?? '');
  const [done, setDone] = useState(view.draft?.done ?? false);
  const [showPrompt, setShowPrompt] = useState(true);
  const [showTips, setShowTips] = useState(false);
  const [notice, setNotice] = useState('');
  const timeUp = useTimeUp(view.clock, offset);
  const hurry = useWithin(view.clock, offset, 20_000);
  const area = useRef<HTMLTextAreaElement>(null);
  const textRef = useRef(text);
  const doneRef = useRef(done);
  const timer = useRef<ReturnType<typeof setTimeout>>(undefined);
  const firstUnsent = useRef<number | null>(null);
  textRef.current = text;
  doneRef.current = done;

  const flush = useCallback(() => {
    clearTimeout(timer.current);
    firstUnsent.current = null;
    send({ t: 'draft', text: textRef.current, done: doneRef.current });
  }, [send]);

  // Drafts go up after a short pause in typing, and at least every few seconds while typing
  // flat out, so a closed lid or a dead battery loses almost nothing.
  const change = (v: string) => {
    if (timeUp) return;
    setText(v);
    textRef.current = v;
    clearTimeout(timer.current);
    const now = Date.now();
    firstUnsent.current ??= now;
    if (now - firstUnsent.current > 3000) flush();
    else timer.current = setTimeout(flush, 700);
  };

  // Time's up: send the final version straight away. The room keeps accepting it for a moment.
  useEffect(() => {
    if (timeUp) flush();
  }, [timeUp, flush]);

  // Back from a dropped connection: make sure the room has the latest text.
  useEffect(() => {
    if (status === 'open') flush();
  }, [status, flush]);

  useEffect(() => () => clearTimeout(timer.current), []);

  const toggleDone = () => {
    const d = !done;
    setDone(d);
    doneRef.current = d;
    flush();
  };

  const insertTip = (tip: string) => {
    const el = area.current;
    if (!el || timeUp) return;
    const start = el.selectionStart ?? text.length;
    const end = el.selectionEnd ?? text.length;
    const before = text.slice(0, start);
    const pad = before && !/\s$/.test(before) ? ' ' : '';
    const ins = pad + tip.replace(/…$/, '').trimEnd() + ' ';
    change(before + ins + text.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + ins.length;
    });
  };

  const blocked = (e: React.SyntheticEvent) => {
    if (!view.rules.blockPaste) return;
    e.preventDefault();
    setNotice('Pasting is turned off for this game. Your own words only!');
    setTimeout(() => setNotice(''), 3500);
  };

  const words = countWords(text);

  return (
    <div className={`writing${hurry ? ' hurry' : ''}${timeUp ? ' over' : ''}`}>
      <section className={`prompt-card compact${showPrompt ? '' : ' folded'}`}>
        <button className="fold" onClick={() => setShowPrompt((x) => !x)} aria-expanded={showPrompt}>
          <b>{c.title}</b>
          <span className="chip chip-accent">Wins: {c.criterion}</span>
          <span className="fold-arrow">{showPrompt ? '▴' : '▾'}</span>
        </button>
        {showPrompt && (
          <>
            {c.image && <ChallengeArt challenge={c} className="intro-art" />}
            <p className="prompt-text">{c.prompt}</p>
          </>
        )}
      </section>

      {view.rules.teamCard && view.snippets.length > 0 && !timeUp && (
        <div className="team-card">
          <span className="team-card-label">Your team is writing:</span>
          {view.snippets.slice(0, 3).map((s, i) => (
            <span key={i} className="snippet">
              “{s}”
            </span>
          ))}
        </div>
      )}

      <textarea
        ref={area}
        className="write-area notebook"
        value={text}
        onChange={(e) => change(e.target.value)}
        onPaste={blocked}
        onDrop={blocked}
        spellCheck={view.rules.spellcheck}
        autoCorrect={view.rules.spellcheck ? 'on' : 'off'}
        autoCapitalize="sentences"
        autoComplete="off"
        maxLength={MAX_TEXT}
        readOnly={timeUp}
        placeholder="Start writing here…"
        autoFocus
        aria-label="Your text"
      />

      {notice && <p className="notice">{notice}</p>}

      <div className="write-bar">
        <span className="wordcount">{plural(words, 'word')}</span>
        {view.rules.tips && c.tips.length > 0 && !timeUp && (
          <button className={`btn btn-small${showTips ? ' on' : ''}`} onClick={() => setShowTips((x) => !x)}>
            💡 Need a spark?
          </button>
        )}
        <span className="spacer" />
        {!timeUp && (
          <button className={`btn btn-small ${done ? 'btn-good' : ''}`} onClick={toggleDone} disabled={!words && !done}>
            {done ? '✓ Done (keep editing)' : "I'm done"}
          </button>
        )}
      </div>

      {showTips && !timeUp && (
        <ul className="tip-list">
          {c.tips.map((t) => (
            <li key={t}>
              <button className="sticky" onClick={() => insertTip(t)}>
                {t}
              </button>
            </li>
          ))}
          <li className="muted small tip-hint">Tap a note to add it where your cursor is.</li>
        </ul>
      )}

      {timeUp && (
        <div className="times-up" role="status">
          <Stamp slam>Time's up!</Stamp>
          <p>Your text is in. {words ? `${plural(words, 'word')} sent.` : ''} Get ready to judge.</p>
        </div>
      )}
    </div>
  );
}

function Duels({ view, send }: { view: PlayerView; send: Send }) {
  const [picked, setPicked] = useState<Record<string, 0 | 1>>({});
  const pick = (id: string, p: 0 | 1) => {
    setPicked((x) => ({ ...x, [id]: p }));
    send({ t: 'pick', duel: id, pick: p });
  };
  const duels = view.duels.map((d) => ({ ...d, pick: picked[d.id] ?? d.pick }));
  const current = duels.find((d) => d.pick === null);
  const q = view.challenge?.question ?? 'Which text is better?';

  if (!duels.length)
    return (
      <Wait emoji="🍿" title="Sit back this time">
        There's no duel for you this round. Your text is being read right now.
      </Wait>
    );
  if (!current)
    return (
      <Wait emoji="⚖️" title="Thanks for judging!">
        Waiting for everyone else to finish. Look at the board.
      </Wait>
    );

  const n = duels.indexOf(current) + 1;
  return (
    <div className="duel">
      <p className="eyebrow">{duels.length > 1 ? `Duel ${n} of ${duels.length}` : 'Your duel'}</p>
      <h2 className="duel-q">{q}</h2>
      <div className="duel-cards" key={current.id}>
        {[current.a, null, current.b].map((card, i) =>
          card ? (
            <article key={card.id} className="duel-card index-card">
              <div className="card-head">
                <span className="letter">{i ? 'B' : 'A'}</span>
                <b>Text {i ? 'B' : 'A'}</b>
                <span className="spacer" />
                <span className="muted small">{plural(card.words, 'word')}</span>
              </div>
              <p className="card-text">{card.text}</p>
              <button className="btn btn-accent wide" onClick={() => pick(current.id, (i ? 1 : 0) as 0 | 1)}>
                {i ? 'B' : 'A'} wins
              </button>
            </article>
          ) : (
            <span key="vs" className="vs" aria-hidden="true">
              VS
            </span>
          ),
        )}
      </div>
      <p className="muted small center">Judge by the question above, not by who you think wrote it.</p>
    </div>
  );
}

function Finals({ view, send }: { view: PlayerView; send: Send }) {
  const [mine, setMine] = useState<string | null>(view.vote);
  useEffect(() => setMine(view.vote), [view.vote]);
  const voting = view.phase === 'vote';
  const cast = (id: string) => {
    setMine(id);
    send({ t: 'cast', id });
  };
  if (!view.finalists.length)
    return (
      <Wait emoji="📣" title="Finals">
        Look at the board.
      </Wait>
    );
  return (
    <div className="finals">
      <p className="eyebrow">{voting ? 'Vote for the best text' : 'The finalists'}</p>
      <h2 className="duel-q">{voting ? view.challenge?.question : 'Read along while your teacher reads them aloud.'}</h2>
      {view.result?.finalist && <p className="banner">⭐ Your text made it to the final!</p>}
      <div className="final-list">
        {view.finalists.map((f, i) => {
          const team = view.teams.find((t) => t.id === f.team);
          return (
            <article key={f.id} className={`final-card index-card${mine === f.id ? ' chosen' : ''}`} style={teamVars(team)}>
              <div className="card-head">
                <span className="letter">{String.fromCharCode(65 + i)}</span>
                <TeamBadge team={team} />
              </div>
              <p className="card-text">{f.text}</p>
              {voting &&
                (f.mine ? (
                  <p className="muted small">This one's yours: vote for another.</p>
                ) : (
                  <button className={`btn wide ${mine === f.id ? 'btn-good' : 'btn-accent'}`} onClick={() => cast(f.id)}>
                    {mine === f.id ? '✓ Your vote' : `Vote ${String.fromCharCode(65 + i)}`}
                  </button>
                ))}
            </article>
          );
        })}
      </div>
    </div>
  );
}

function Results({ view, team }: { view: PlayerView; team?: TeamInfo }) {
  const won = team && view.winners.includes(team.id);
  useEffect(() => {
    if (won) void confetti({ particleCount: 120, spread: 80, origin: { y: 0.7 }, colors: [team!.color, '#ffd96a', '#ffffff'] });
  }, [won]);
  const winners = view.teams.filter((t) => view.winners.includes(t.id));
  const r = view.result;
  return (
    <div className="results-me">
      <div className="wait-emoji" aria-hidden="true">
        {winners.length ? winners.map((w) => w.emoji).join(' ') : '🤝'}
      </div>
      <h2>{won ? 'Your team won the round!' : winners.length ? `The ${winners.map((w) => w.name).join(' & ')} win the round` : 'Round over'}</h2>
      {team && (
        <p>
          The {team.name} got <b>{plural(view.points[team.id] ?? 0, 'point')}</b> this round, {team.points} in total.
        </p>
      )}
      {r && (
        <div className="red-pen" aria-label="Your feedback">
          {r.held ? (
            <p>{heldText(r.held)}</p>
          ) : (
            <>
              <p>
                {plural(r.words, 'word')}
                {r.reads > 0 ? `, read by ${plural(r.reads, 'classmate')}.` : '.'}
              </p>
              {r.wins > 0 && <p>Won {r.wins === r.reads ? (r.wins === 1 ? 'its duel' : `all ${r.wins} duels`) : `${r.wins} of ${r.reads} duels`}. Nice work!</p>}
              {r.finalist && <p>★ Made the final!</p>}
            </>
          )}
        </div>
      )}
      <p className="muted">Next round coming up. Watch the board.</p>
    </div>
  );
}

function heldText(reason: string) {
  switch (reason) {
    case 'empty':
      return 'Your text was too short to go into the duels this time. Your teacher can still read it.';
    case 'name':
      return "Your text was kept out of the duels because it uses a classmate's name. Your teacher can still read it.";
    case 'word':
      return 'Your text was kept out of the duels because of a word that isn’t allowed here. Your teacher can still read it.';
    default:
      return 'Your text was kept out of the duels this round.';
  }
}

function Summary({ view }: { view: PlayerView }) {
  const standings = [...view.teams].sort((a, b) => b.points - a.points);
  const s = view.summary;
  const download = () => {
    if (!s) return;
    const body = s.mine.map((m) => `Round ${m.round}: ${m.title}\n\n${m.text}\n`).join('\n---\n\n');
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([body], { type: 'text/plain' }));
    a.download = `inkduel-${view.me.name.replace(/\W+/g, '-').toLowerCase()}.txt`;
    a.click();
    URL.revokeObjectURL(a.href);
  };
  return (
    <div className="summary-me">
      <div className="wait-emoji" aria-hidden="true">
        🏆
      </div>
      <h2>Game over. Thanks for writing!</h2>
      <ol className="standings">
        {standings.map((t, i) => (
          <li key={t.id} style={{ '--team': t.color } as React.CSSProperties}>
            <span className="st-place">{i + 1}</span>
            <TeamBadge team={t} />
            <b>{plural(t.points, 'point')}</b>
          </li>
        ))}
      </ol>
      {s && (
        <>
          <p>
            The class wrote <b>{plural(s.words, 'word')}</b> in {plural(s.texts, 'text')}.
          </p>
          {s.mine.length > 0 && (
            <button className="btn btn-accent" onClick={download}>
              Download my writing ({plural(s.mine.length, 'text')})
            </button>
          )}
        </>
      )}
    </div>
  );
}
