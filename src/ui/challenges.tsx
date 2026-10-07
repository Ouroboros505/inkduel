import { useMemo, useRef, useState } from 'react';
import type { Challenge, Kind, Level } from '../../shared/protocol';
import { blankChallenge, KINDS, LEVELS, LIBRARY } from '../lib/library';
import { load, loadCustom, save, saveCustom } from '../lib/store';
import { mmss } from '../lib/clock';
import { ChallengeArt, Modal, Stamp } from './bits';

const LEVEL_KEY = 'inkduel.level';

/**
 * The library's order: paintings first (the first six all paintings), then two paintings to
 * every emoji challenge, so the picture prompts lead and the rest stay mixed in.
 */
function artFirst(list: Challenge[]): Challenge[] {
  const art = list.filter((c) => c.image);
  const plain = list.filter((c) => !c.image);
  const out = art.splice(0, 6);
  while (art.length || plain.length) {
    out.push(...art.splice(0, 2));
    if (plain.length) out.push(plain.shift()!);
  }
  return out;
}

export function levelText(levels: Level[]) {
  if (levels.length === 3 || !levels.length) return 'All grades';
  const sorted = LEVELS.filter((l) => levels.includes(l.id)).map((l) => l.id);
  const lo = sorted[0].split('-')[0];
  const hi = sorted[sorted.length - 1].split('-')[1];
  return `Grades ${lo}–${hi}`;
}

function ChallengeTile({ c, onOpen, chosen }: { c: Challenge; onOpen: () => void; chosen: boolean }) {
  return (
    <button className={`tile${chosen ? ' chosen' : ''}`} onClick={onOpen}>
      <ChallengeArt challenge={c} className="tile-art" thumb />
      <span className="tile-body">
        <span className="tile-kind">
          {KINDS[c.kind]?.emoji} {KINDS[c.kind]?.label ?? 'Challenge'}
          {c.custom && <em> · mine</em>}
        </span>
        <span className="tile-title">{c.title || 'Untitled'}</span>
        <span className="tile-prompt">{c.prompt}</span>
        <span className="tile-meta">
          <span className="chip">{c.criterion || '—'}</span>
          <span>{mmss(c.seconds * 1000)}</span>
          <span>{levelText(c.levels)}</span>
        </span>
      </span>
      {chosen && (
        <Stamp className="tile-check" slam>
          added
        </Stamp>
      )}
    </button>
  );
}

/**
 * The library and the teacher's own challenges, with filters. `onPick` is the main action:
 * "Add to game" on the home screen, "Use this" when swapping on the board.
 */
export function ChallengeBrowser({ onPick, pickLabel, chosen = [] }: { onPick: (c: Challenge) => void; pickLabel: string; chosen?: string[] }) {
  const [tab, setTab] = useState<'library' | 'mine'>('library');
  const [level, setLevel] = useState<Level | 'all'>(() => load(LEVEL_KEY, '9-10'));
  const [kind, setKind] = useState<Kind | 'all' | 'pictures'>('all');
  const [q, setQ] = useState('');
  const [custom, setCustom] = useState(loadCustom);
  const [open, setOpen] = useState<Challenge | null>(null);
  const [editing, setEditing] = useState<Challenge | null>(null);
  const [note, setNote] = useState('');
  const importRef = useRef<HTMLInputElement>(null);

  const list = useMemo(() => {
    const src = tab === 'mine' ? custom : artFirst(LIBRARY);
    const needle = q.trim().toLowerCase();
    return src.filter(
      (c) =>
        (level === 'all' || c.levels.includes(level) || !c.levels.length) &&
        (kind === 'all' || (kind === 'pictures' ? !!c.image : c.kind === kind)) &&
        (!needle || `${c.title} ${c.prompt} ${c.criterion}`.toLowerCase().includes(needle)),
    );
  }, [tab, custom, level, kind, q]);

  const setLevelSaved = (l: Level | 'all') => {
    setLevel(l);
    save(LEVEL_KEY, l);
  };

  const store = (next: Challenge[]) => {
    setCustom(next);
    if (!saveCustom(next)) setNote('This browser is out of storage space: try a smaller picture.');
  };

  // Saving goes straight back to the library, with the new challenge first under My challenges.
  const saveEdited = (c: Challenge, pick: boolean) => {
    const next = custom.some((x) => x.id === c.id) ? custom.map((x) => (x.id === c.id ? c : x)) : [c, ...custom];
    store(next);
    setEditing(null);
    setTab('mine');
    if (pick) onPick(c);
    setNote(`Saved “${c.title}” in My challenges${pick ? ' and added it to your game' : ''}.`);
  };

  const remove = (c: Challenge) => {
    if (!confirm(`Delete "${c.title}" from your challenges?`)) return;
    store(custom.filter((x) => x.id !== c.id));
    setOpen(null);
  };

  const exportAll = () => {
    const blob = new Blob([JSON.stringify(custom, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'inkduel-challenges.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };

  const importFile = async (file: File) => {
    try {
      const data = JSON.parse(await file.text());
      const incoming: Challenge[] = (Array.isArray(data) ? data : [data]).filter((c) => c && typeof c.prompt === 'string');
      const ids = new Set(custom.map((c) => c.id));
      const fresh = incoming.map((c) => ({ ...blankChallenge(), ...c, custom: true, id: ids.has(c.id) ? `${c.id}-${Date.now().toString(36)}` : c.id }));
      store([...fresh, ...custom]);
      setTab('mine');
      setNote(`Imported ${fresh.length} challenge${fresh.length === 1 ? '' : 's'}.`);
    } catch {
      setNote("That file isn't an InkDuel challenge file.");
    }
  };

  return (
    <div className="browser">
      <div className="browser-tabs">
        <button className={tab === 'library' ? 'on' : ''} onClick={() => setTab('library')}>
          Library <span className="count">{LIBRARY.length}</span>
        </button>
        <button className={tab === 'mine' ? 'on' : ''} onClick={() => setTab('mine')}>
          My challenges <span className="count">{custom.length}</span>
        </button>
        <span className="spacer" />
        <button className="btn btn-small btn-accent" onClick={() => setEditing(blankChallenge())}>
          + Write your own
        </button>
      </div>

      <div className="filters">
        <div className="chips" role="group" aria-label="Grade level">
          {[{ id: 'all' as const, label: 'All grades' }, ...LEVELS].map((l) => (
            <button key={l.id} className={`chip-btn${level === l.id ? ' on' : ''}`} onClick={() => setLevelSaved(l.id)}>
              {l.label}
            </button>
          ))}
        </div>
        <div className="chips" role="group" aria-label="Type">
          <button className={`chip-btn${kind === 'all' ? ' on' : ''}`} onClick={() => setKind('all')}>
            Every type
          </button>
          <button className={`chip-btn${kind === 'pictures' ? ' on' : ''}`} onClick={() => setKind('pictures')}>
            🖼️ Paintings
          </button>
          {(Object.keys(KINDS) as Kind[]).map((k) => (
            <button key={k} className={`chip-btn${kind === k ? ' on' : ''}`} onClick={() => setKind(k)}>
              {KINDS[k].emoji} {KINDS[k].label}
            </button>
          ))}
        </div>
        <input className="search" type="search" placeholder="Search prompts" value={q} onChange={(e) => setQ(e.target.value)} />
      </div>

      {note && (
        <p className="note saved" onClick={() => setNote('')} role="status">
          ✓ {note} <span className="muted small">(tap to hide)</span>
        </p>
      )}

      {tab === 'mine' && (
        <div className="mine-tools">
          <button className="btn btn-small" onClick={exportAll} disabled={!custom.length}>
            Download my challenges
          </button>
          <button className="btn btn-small" onClick={() => importRef.current?.click()}>
            Import a file
          </button>
          <input ref={importRef} type="file" accept="application/json,.json" hidden onChange={(e) => e.target.files?.[0] && importFile(e.target.files[0])} />
        </div>
      )}

      {list.length ? (
        <div className="tiles">
          {list.map((c) => (
            <ChallengeTile key={c.id} c={c} chosen={chosen.includes(c.id)} onOpen={() => setOpen(c)} />
          ))}
        </div>
      ) : (
        <p className="empty">
          {tab === 'mine' && !custom.length
            ? 'Nothing here yet. "Write your own" makes a challenge with your prompt, your picture and your winning criterion. It stays in this browser.'
            : 'No challenge matches these filters.'}
        </p>
      )}

      {open && (
        <ChallengePreview
          c={open}
          pickLabel={chosen.includes(open.id) ? `${pickLabel} again` : pickLabel}
          onPick={() => {
            onPick(open);
            setOpen(null);
          }}
          onEdit={() => {
            setEditing(open.custom ? open : { ...open, id: `my-${Date.now().toString(36)}`, custom: true, title: `${open.title} (my version)` });
            setOpen(null);
          }}
          onDelete={open.custom ? () => remove(open) : undefined}
          onClose={() => setOpen(null)}
        />
      )}
      {editing && <ChallengeEditor initial={editing} pickLabel={pickLabel} onSave={saveEdited} onClose={() => setEditing(null)} />}
    </div>
  );
}

export function shareLink(c: Challenge): string {
  const { image, ...rest } = c;
  const keep = image && !image.startsWith('data:') ? { ...rest, image } : rest;
  const bytes = new TextEncoder().encode(JSON.stringify(keep));
  const b64 = btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `${location.origin}/host#c=${b64}`;
}

export function readShared(hash: string): Challenge | null {
  const m = hash.match(/^#c=([\w-]+)/);
  if (!m) return null;
  try {
    const b64 = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const bytes = Uint8Array.from(atob(b64), (ch) => ch.charCodeAt(0));
    const c = JSON.parse(new TextDecoder().decode(bytes)) as Challenge;
    if (typeof c.prompt !== 'string' || typeof c.title !== 'string') return null;
    return { ...blankChallenge(), ...c, custom: true, id: `shared-${Date.now().toString(36)}` };
  } catch {
    return null;
  }
}

export function ChallengePreview({
  c, pickLabel, onPick, onEdit, onDelete, onClose, extra,
}: {
  c: Challenge;
  pickLabel: string;
  onPick: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
  onClose: () => void;
  extra?: React.ReactNode;
}) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(shareLink(c));
      setCopied(true);
    } catch {
      prompt('Copy this link:', shareLink(c));
    }
  };
  return (
    <Modal onClose={onClose} label={c.title} back="Back to the library">
      <div className="preview">
        <ChallengeArt challenge={c} className="preview-art" polaroid />
        <div className="preview-body">
          <p className="tile-kind">
            {KINDS[c.kind]?.emoji} {KINDS[c.kind]?.label} · {levelText(c.levels)} · {mmss(c.seconds * 1000)}
          </p>
          <h2>{c.title}</h2>
          <p className="preview-prompt">{c.prompt}</p>
          <p className="preview-crit">
            <span className="sticky">Wins: {c.criterion}</span> <span className="hand">{c.question}</span>
          </p>
          {!!c.tips.length && (
            <>
              <h3>Tip card</h3>
              <ul className="tips">
                {c.tips.map((t) => (
                  <li key={t}>
                    <span className="sticky">{t}</span>
                  </li>
                ))}
              </ul>
            </>
          )}
          {extra}
          <div className="row">
            <button className="btn btn-accent" onClick={onPick}>
              {pickLabel}
            </button>
            {onEdit && (
              <button className="btn" onClick={onEdit}>
                {c.custom ? 'Edit' : 'Edit a copy'}
              </button>
            )}
            <button className="btn btn-ghost" onClick={copy}>
              {copied ? 'Link copied ✓' : 'Share link'}
            </button>
            {onDelete && (
              <button className="btn btn-ghost danger" onClick={onDelete}>
                Delete
              </button>
            )}
          </div>
        </div>
      </div>
    </Modal>
  );
}

async function shrinkImage(file: File): Promise<string> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = url;
    });
    const scale = Math.min(1, 1280 / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    // Pictures live in browser storage, which holds about 5 MB in all; keep each one small.
    let q = 0.82;
    let data = canvas.toDataURL('image/jpeg', q);
    while (data.length > 320_000 && q > 0.45) {
      q -= 0.1;
      data = canvas.toDataURL('image/jpeg', q);
    }
    return data;
  } finally {
    URL.revokeObjectURL(url);
  }
}

const TIMES = [60, 90, 120, 150, 180, 240, 300, 360, 420, 480, 600];

export function ChallengeEditor({
  initial, pickLabel, onSave, onClose,
}: {
  initial: Challenge;
  pickLabel: string;
  onSave: (c: Challenge, pick: boolean) => void;
  onClose: () => void;
}) {
  const [c, setC] = useState<Challenge>({ ...initial, tips: [...initial.tips, '', '', '', ''].slice(0, 4) });
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);
  const set = <K extends keyof Challenge>(k: K, v: Challenge[K]) => setC((x) => ({ ...x, [k]: v }));

  const submit = (e: React.FormEvent, pick = false) => {
    e.preventDefault();
    if (!c.title.trim() || !c.prompt.trim()) return setErr('A challenge needs a title and a prompt.');
    if (!c.levels.length) return setErr('Pick at least one grade level.');
    const criterion = c.criterion.trim() || 'Best writing';
    onSave(
      {
        ...c,
        title: c.title.trim(),
        prompt: c.prompt.trim(),
        criterion,
        question: c.question.trim() || `Which text wins for ${criterion.toLowerCase()}?`,
        tips: c.tips.map((t) => t.trim()).filter(Boolean),
        custom: true,
      },
      pick,
    );
  };

  const upload = async (file: File) => {
    try {
      set('image', await shrinkImage(file));
      set('credit', undefined);
    } catch {
      setErr("That file couldn't be read as a picture.");
    }
  };

  return (
    <Modal onClose={onClose} label="Edit challenge" wide back="Back without saving">
      <form className="editor" onSubmit={submit}>
        <h2>{initial.title ? 'Edit challenge' : 'Write your own challenge'}</h2>
        <div className="editor-grid">
          <div className="editor-main">
            <label>
              Title
              <input value={c.title} maxLength={80} onChange={(e) => set('title', e.target.value)} placeholder="The Last Message" autoFocus />
            </label>
            <label>
              Prompt <span className="muted">what goes up on the board</span>
              <textarea
                value={c.prompt}
                maxLength={1200}
                rows={4}
                onChange={(e) => set('prompt', e.target.value)}
                placeholder="Your phone buzzes at 2:13 a.m. One new message, from a number that was disconnected years ago. Write what it says and what happens next."
              />
            </label>
            <div className="two">
              <label>
                What wins <span className="muted">one or two words</span>
                <input value={c.criterion} maxLength={40} onChange={(e) => set('criterion', e.target.value)} placeholder="Suspense" />
              </label>
              <label>
                Writing time
                <select value={c.seconds} onChange={(e) => set('seconds', Number(e.target.value))}>
                  {TIMES.map((t) => (
                    <option key={t} value={t}>
                      {mmss(t * 1000)}
                    </option>
                  ))}
                </select>
              </label>
            </div>
            <label>
              Duel question <span className="muted">what students ask themselves when they judge</span>
              <input
                value={c.question}
                maxLength={160}
                onChange={(e) => set('question', e.target.value)}
                placeholder={`Which text builds more ${(c.criterion || 'suspense').toLowerCase()}?`}
              />
            </label>
            <fieldset>
              <legend>
                Tip card <span className="muted">sentence starters or questions, up to four</span>
              </legend>
              {c.tips.map((t, i) => (
                <input key={i} value={t} maxLength={200} placeholder={i === 0 ? 'Start with the exact words of the message.' : ''} onChange={(e) => set('tips', c.tips.map((x, j) => (j === i ? e.target.value : x)))} />
              ))}
            </fieldset>
          </div>
          <div className="editor-side">
            <div className="editor-art">
              <ChallengeArt challenge={c} />
            </div>
            <div className="row">
              <button type="button" className="btn btn-small" onClick={() => fileRef.current?.click()}>
                Upload picture
              </button>
              {c.image && (
                <button type="button" className="btn btn-small btn-ghost" onClick={() => setC((x) => ({ ...x, image: undefined, credit: undefined }))}>
                  Remove
                </button>
              )}
              <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
            </div>
            <label>
              …or a picture link
              <input
                value={c.image && !c.image.startsWith('data:') ? c.image : ''}
                placeholder="https://…"
                onChange={(e) => set('image', e.target.value.trim() || undefined)}
              />
            </label>
            <label>
              Emoji when there's no picture
              <input value={c.emoji ?? ''} maxLength={8} onChange={(e) => set('emoji', e.target.value)} className="emoji-input" />
            </label>
            <label>
              Type
              <select value={c.kind} onChange={(e) => set('kind', e.target.value as Kind)}>
                {(Object.keys(KINDS) as Kind[]).map((k) => (
                  <option key={k} value={k}>
                    {KINDS[k].label}
                  </option>
                ))}
              </select>
            </label>
            <fieldset className="levels">
              <legend>Grade level</legend>
              {LEVELS.map((l) => (
                <label key={l.id} className="check">
                  <input
                    type="checkbox"
                    checked={c.levels.includes(l.id)}
                    onChange={(e) => set('levels', e.target.checked ? [...c.levels, l.id] : c.levels.filter((x) => x !== l.id))}
                  />
                  {l.label}
                </label>
              ))}
            </fieldset>
          </div>
        </div>
        {err && <p className="error">{err}</p>}
        <div className="row end">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            Cancel
          </button>
          <button className="btn">Save</button>
          <button type="button" className="btn btn-accent" onClick={(e) => submit(e, true)}>
            Save & {pickLabel.toLowerCase()}
          </button>
        </div>
        <p className="muted small">Your challenges and pictures are saved in this browser only. Use "Download my challenges" to move them to another computer.</p>
      </form>
    </Modal>
  );
}
