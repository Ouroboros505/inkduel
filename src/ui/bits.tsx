import { useEffect, useMemo, type CSSProperties, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import qrcode from 'qrcode-generator';
import type { Challenge, Clock, TeamInfo } from '../../shared/protocol';
import { mmss, remaining, useTick } from '../lib/clock';
import { segments, type Mark as SpotMark } from '../lib/spotlight';
import { navigate } from '../lib/nav';
import { localImage } from '../lib/store';

// The look: a risograph zine on a writer's desk. Fluorescent inks on cream paper, ink outlines
// with hard shadows, and the props of a classroom: name stickers, tape, sticky notes, a red pen
// and a rubber stamp.

export const RISO = ['#ff4fa3', '#ffd23f', '#2f62e0', '#00a3a3', '#ff6b35', '#7a4fd6', '#1d9e5a'];

export function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Ink or white, whichever reads better on this colour. */
export function onColor(hex: string): string {
  const n = parseInt(hex.replace('#', ''), 16);
  const lin = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255);
  return (L + 0.05) / 0.061 >= 1.05 / (L + 0.05) ? 'var(--ink)' : '#fff';
}

export function teamVars(team: TeamInfo | undefined): CSSProperties {
  return team ? ({ '--team': team.color, '--team-on': onColor(team.color) } as CSSProperties) : {};
}

/** A small, stable tilt for things stuck on the page, so a reload doesn't reshuffle them. */
export function tilt(seed: string, max = 4): number {
  return ((hash(seed) % 1000) / 1000) * 2 * max - max;
}

/** Two crossed pen nibs, printed in two inks that overprint where they cross. */
export function Nibs({ size = 32 }: { size?: number }) {
  const nib = 'M32 3c9.5 9.2 13.6 20.8 11.6 33.4L32 61 20.4 36.4C18.4 23.8 22.5 12.2 32 3z';
  return (
    <svg viewBox="0 0 64 64" width={size} height={size} aria-hidden="true" className="nibs">
      <g transform="rotate(-38 32 32)" style={{ mixBlendMode: 'multiply' }}>
        <path d={nib} fill="var(--blue)" />
        <path d="M32 31v30" stroke="var(--paper)" strokeWidth="2.6" />
        <circle cx="32" cy="29" r="3.6" fill="var(--paper)" />
      </g>
      <g transform="rotate(38 32 32)" style={{ mixBlendMode: 'multiply' }}>
        <path d={nib} fill="var(--pink)" />
        <path d="M32 31v30" stroke="var(--paper)" strokeWidth="2.6" />
        <circle cx="32" cy="29" r="3.6" fill="var(--paper)" />
      </g>
    </svg>
  );
}

export function Logo({ size = 28, light = false }: { size?: number; light?: boolean }) {
  return (
    <span className={`logo${light ? ' light' : ''}`} style={{ fontSize: size * 0.86 }}>
      <Nibs size={size * 1.1} />
      <span className="logo-word">
        Ink<span>Duel</span>
      </span>
    </span>
  );
}

/**
 * The logo as the way home: the teacher home for teachers, the join page for students. `ask` is
 * shown first when leaving would interrupt something; nothing is lost either way.
 */
export function LogoLink({ to, size = 28, light = false, mark = false, ask, onGo }: { to: string; size?: number; light?: boolean; mark?: boolean; ask?: string; onGo?: () => void }) {
  return (
    <a
      href={to}
      className="logo-link"
      aria-label={to === '/' ? 'InkDuel: join a game' : 'InkDuel: teacher home'}
      onClick={(e) => {
        e.preventDefault();
        if (ask && !confirm(ask)) return;
        if (onGo) onGo();
        else navigate(to);
      }}
    >
      {mark ? <Nibs size={size} /> : <Logo size={size} light={light} />}
    </a>
  );
}

export function TeamBadge({ team, big = false }: { team: TeamInfo | undefined; big?: boolean }) {
  if (!team) return null;
  return (
    <span className={`team-badge${big ? ' big' : ''}`} style={teamVars(team)}>
      <span className="team-emoji">{team.emoji}</span>
      {team.name}
    </span>
  );
}

/** The "HELLO my name is" sticker every student gets when they walk in. */
export function HelloSticker({ name, seed = name, big = false }: { name: string; seed?: string; big?: boolean }) {
  const c = RISO[hash(seed) % RISO.length];
  return (
    <span className={`hello${big ? ' big' : ''}`} style={{ '--c': c, '--on': onColor(c), '--rot': `${tilt(seed, 5)}deg` } as CSSProperties}>
      <span className="hello-top">
        HELLO
        <small>my name is</small>
      </span>
      <span className="hello-name">{name}</span>
    </span>
  );
}

export function Stamp({ children, slam = false, className = '' }: { children: ReactNode; slam?: boolean; className?: string }) {
  return <span className={`stamp${slam ? ' slam' : ''} ${className}`}>{children}</span>;
}

/** A hand-drawn underline. */
export function Squiggle({ color = 'var(--pink)', className = '' }: { color?: string; className?: string }) {
  return (
    <svg className={`squiggle ${className}`} viewBox="0 0 200 14" preserveAspectRatio="none" aria-hidden="true">
      <path d="M2 9c18-7 30-7 44 0s28 6 42-1 28-7 42 0 28 6 42-1 18-4 26-2" fill="none" stroke={color} strokeWidth="4" strokeLinecap="round" />
    </svg>
  );
}

export function Countdown({ clock, offset, size = 120, warnAt = 20_000 }: { clock: Clock | null | undefined; offset: number; size?: number; warnAt?: number }) {
  const running = !!clock && clock.endsAt !== null && clock.paused === null;
  useTick(running);
  const left = remaining(clock, offset);
  if (left === null || !clock) return null;
  const total = clock.total ?? left;
  const frac = total > 0 ? Math.min(1, left / total) : 0;
  const c = 2 * Math.PI * 42;
  const paused = clock.paused !== null;
  const cls = ['countdown', running && left <= warnAt ? 'warn' : '', paused ? 'paused' : '', left === 0 ? 'zero' : ''].join(' ');
  return (
    <div className={cls} style={{ width: size, height: size }} role="timer" aria-label={`${mmss(left)} left`}>
      <svg viewBox="0 0 100 100">
        <circle cx="50" cy="50" r="47" className="rim" />
        <circle cx="50" cy="50" r="42" className="track" />
        <circle cx="50" cy="50" r="42" className="bar" strokeDasharray={c} strokeDashoffset={c * (1 - frac)} transform="rotate(-90 50 50)" />
      </svg>
      <span className="countdown-text" style={{ fontSize: size * 0.25 }}>
        {mmss(left)}
        {paused && <small>paused</small>}
      </span>
    </div>
  );
}

export function Qr({ text, size = 200 }: { text: string; size?: number }) {
  const svg = useMemo(() => {
    const q = qrcode(0, 'M');
    q.addData(text);
    q.make();
    return q.createSvgTag({ cellSize: 4, margin: 1, scalable: true });
  }, [text]);
  return <div className="qr" style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
}

export function Modal({ onClose, children, wide = false, label, back = 'Back' }: { onClose: () => void; children: ReactNode; wide?: boolean; label: string; back?: string }) {
  useEffect(() => {
    const key = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [onClose]);
  return createPortal(
    <div className="modal-back" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className={`modal${wide ? ' wide' : ''}`} role="dialog" aria-modal="true" aria-label={label}>
        <div className="modal-top">
          <button className="btn btn-small" onClick={onClose}>
            ← {back}
          </button>
          <span className="muted small">or press Esc</span>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}

export function Highlighted({ text, marks, color }: { text: string; marks?: SpotMark[]; color?: string }) {
  return (
    <>
      {segments(text, marks).map((s, i) =>
        s.hit ? (
          <mark key={i} style={{ '--hl': color } as CSSProperties}>
            {s.text}
          </mark>
        ) : (
          <span key={i}>{s.text}</span>
        ),
      )}
    </>
  );
}

/**
 * A challenge's picture: her uploaded image or a shipped painting as a taped-down print, or,
 * without one, the emoji as a die-cut sticker on a halftone block of riso ink.
 */
export function ChallengeArt({ challenge, className = '', polaroid = false, thumb = false }: { challenge: Challenge; className?: string; polaroid?: boolean; thumb?: boolean }) {
  // The server drops uploaded pictures, so a custom challenge coming back from the room has none:
  // fall back to the copy in this browser.
  const full = challenge.image ?? (challenge.custom ? localImage(challenge.id) : undefined);
  // Shipped paintings come in two sizes; small tiles load the thumbnail.
  const src = thumb && full?.startsWith('/img/') ? full.replace('/img/', '/img/t/') : full;
  if (src)
    return (
      <figure className={`art${polaroid ? ' polaroid taped' : ''} ${className}`} style={{ '--rot': `${tilt(challenge.id, 2.5)}deg` } as CSSProperties}>
        <img src={src} alt="" loading="lazy" />
        {challenge.credit && <figcaption>{challenge.credit}</figcaption>}
      </figure>
    );
  const c = RISO[hash(challenge.id) % RISO.length];
  return (
    <div className={`art art-emoji ${className}`} style={{ '--c': c, '--rot': `${tilt(challenge.id, 8)}deg` } as CSSProperties} aria-hidden="true">
      <span>{challenge.emoji ?? '✍️'}</span>
    </div>
  );
}

export function fmtPin(pin: string) {
  return `${pin.slice(0, 3)} ${pin.slice(3)}`;
}

export function plural(n: number, one: string, many = `${one}s`) {
  return `${n.toLocaleString()} ${n === 1 ? one : many}`;
}
