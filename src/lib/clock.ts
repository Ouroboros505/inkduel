import { useEffect, useState } from 'react';
import type { Clock } from '../../shared/protocol';

/** Milliseconds left on a phase clock, or null if the phase isn't timed. */
export function remaining(clock: Clock | null | undefined, offset: number): number | null {
  if (!clock) return null;
  if (clock.paused !== null) return clock.paused;
  if (clock.endsAt === null) return null;
  return Math.max(0, clock.endsAt - (Date.now() + offset));
}

/**
 * Re-renders the calling component a few times a second while a clock runs. Only small
 * components should tick: re-rendering a whole page four times a second is what makes cheap
 * Chromebooks stutter.
 */
export function useTick(active: boolean, ms = 250) {
  const [, setN] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setN((n) => n + 1), ms);
    return () => clearInterval(id);
  }, [active, ms]);
}

/** True once the clock has run out; re-renders once at that moment rather than ticking. */
export function useTimeUp(clock: Clock | null | undefined, offset: number): boolean {
  const left = remaining(clock, offset);
  const [, setN] = useState(0);
  useEffect(() => {
    if (left === null || left <= 0 || clock?.paused !== null) return;
    const id = setTimeout(() => setN((n) => n + 1), left + 30);
    return () => clearTimeout(id);
  }, [clock?.endsAt, clock?.paused, left === null || left <= 0]);
  return left !== null && left <= 0 && clock?.paused === null;
}

/** True during the last `ms` of the clock, for the "hurry up" flash. */
export function useWithin(clock: Clock | null | undefined, offset: number, ms: number): boolean {
  const left = remaining(clock, offset);
  const [, setN] = useState(0);
  const inside = left !== null && left <= ms && clock?.paused === null;
  useEffect(() => {
    if (left === null || inside || clock?.paused !== null) return;
    const id = setTimeout(() => setN((n) => n + 1), left - ms + 30);
    return () => clearTimeout(id);
  }, [clock?.endsAt, clock?.paused, inside]);
  return inside;
}

export function mmss(ms: number): string {
  const s = Math.ceil(ms / 1000);
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}
