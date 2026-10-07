// Board sounds, synthesised so there are no audio files to load. Browsers only allow audio after
// a click, and the teacher clicks to start every phase, so the context is always unlocked in time.

let ctx: AudioContext | null = null;
let muted = false;

export function setMuted(m: boolean) {
  muted = m;
}

function audio(): AudioContext | null {
  if (muted) return null;
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(freq: number, start: number, dur: number, gain = 0.08, type: OscillatorType = 'sine') {
  const a = audio();
  if (!a) return;
  const t = a.currentTime + start;
  const osc = a.createOscillator();
  const g = a.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(gain, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  osc.connect(g).connect(a.destination);
  osc.start(t);
  osc.stop(t + dur + 0.05);
}

export const sound = {
  unlock: () => void audio(),
  tick: () => tone(880, 0, 0.08, 0.05, 'square'),
  warn: () => {
    tone(660, 0, 0.18, 0.08);
    tone(880, 0.2, 0.25, 0.08);
  },
  end: () => {
    tone(196, 0, 1.6, 0.14, 'triangle');
    tone(392, 0, 1.2, 0.05);
  },
  start: () => {
    tone(523, 0, 0.15, 0.08);
    tone(784, 0.12, 0.3, 0.08);
  },
  join: () => tone(1046, 0, 0.12, 0.04),
  fanfare: () => [523, 659, 784, 1046].forEach((f, i) => tone(f, i * 0.12, i === 3 ? 0.7 : 0.2, 0.09, 'triangle')),
};
