import { useEffect, useRef, useState } from 'react';
import { MAX_NAME } from '../../shared/protocol';
import { navigate } from '../lib/nav';
import { roomExists } from '../lib/room';
import { K, load, save } from '../lib/store';
import { Logo } from '../ui/bits';

export function Join() {
  const fromLink = new URLSearchParams(location.search).get('pin')?.replace(/\D/g, '').slice(0, 6) ?? '';
  const [pin, setPin] = useState(fromLink);
  const [step, setStep] = useState<'pin' | 'name'>('pin');
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const check = async (p: string) => {
    if (p.length !== 6) return setError('The game PIN has 6 digits.');
    setBusy(true);
    setError('');
    const room = await roomExists(p);
    setBusy(false);
    if (!room.ok) return setError('No game with that PIN. Check the board and try again.');
    if (room.phase === 'summary') return setError('That game has finished.');
    // This browser already joined: go straight back in.
    if (load(K.player(p), null)) return navigate(`/play/${p}`);
    if (room.locked) return setError('That game is locked. Ask your teacher to unlock it.');
    setStep('name');
  };

  useEffect(() => {
    if (fromLink.length === 6) void check(fromLink);
  }, []);

  useEffect(() => {
    if (step === 'name') nameRef.current?.focus();
  }, [step]);

  const join = (e: React.FormEvent) => {
    e.preventDefault();
    const n = name.trim();
    if (!n) return setError('Type your name.');
    save(K.pending(pin), n);
    navigate(`/play/${pin}`);
  };

  return (
    <main className="join">
      <Logo size={44} />
      {step === 'pin' ? (
        <form
          className="join-card"
          onSubmit={(e) => {
            e.preventDefault();
            void check(pin);
          }}
        >
          <label htmlFor="pin">Game PIN</label>
          <input
            id="pin"
            className="pin-input"
            inputMode="numeric"
            autoComplete="off"
            placeholder="123 456"
            value={pin.length > 3 ? `${pin.slice(0, 3)} ${pin.slice(3)}` : pin}
            onChange={(e) => {
              setError('');
              setPin(e.target.value.replace(/\D/g, '').slice(0, 6));
            }}
            autoFocus
          />
          <button className="btn btn-accent btn-big wide" disabled={busy}>
            {busy ? 'Checking…' : 'Enter'}
          </button>
          <p className="join-hint">the PIN is up on the board ↑</p>
          {error && <p className="error">{error}</p>}
        </form>
      ) : (
        <form className="join-card" onSubmit={join}>
          <label htmlFor="name">Your name</label>
          <input
            id="name"
            ref={nameRef}
            className="name-input"
            maxLength={MAX_NAME}
            autoComplete="off"
            placeholder="First name and initial"
            value={name}
            onChange={(e) => {
              setError('');
              setName(e.target.value);
            }}
          />
          <button className="btn btn-accent btn-big wide">Join the game</button>
          {error && <p className="error">{error}</p>}
          <button type="button" className="link-btn" onClick={() => setStep('pin')}>
            ← Different PIN
          </button>
        </form>
      )}
      <p className="join-foot">
        Teacher?{' '}
        <a href="/host" onClick={(e) => (e.preventDefault(), navigate('/host'))}>
          Host a game →
        </a>
      </p>
    </main>
  );
}
