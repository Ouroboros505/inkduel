import { navigate } from '../lib/nav';
import { hostGames } from '../lib/store';
import { Logo, Squiggle } from './bits';

/** The teacher's header on every page that isn't the board: build a game, or look at her games. */
export function HostNav({ active }: { active: 'build' | 'games' | 'report' }) {
  const live = hostGames().length;
  const go = (to: string) => (e: React.MouseEvent) => {
    e.preventDefault();
    navigate(to);
  };
  return (
    <header className="home-top">
      <a href="/host" className="logo-link" onClick={go('/host')} aria-label="InkDuel: teacher home">
        <Logo size={34} />
      </a>
      <p className="home-tag">
        timed writing duels for your class. free, no student accounts.
        <Squiggle />
      </p>
      <span className="spacer" />
      <nav className="host-nav" aria-label="Teacher pages">
        <a href="/host" className={`nav-tab${active === 'build' ? ' on' : ''}`} onClick={go('/host')}>
          ✏️ Build a game
        </a>
        <a href="/host/games" className={`nav-tab${active === 'games' ? ' on' : ''}`} onClick={go('/host/games')}>
          🗂️ My games
          {live > 0 && <span className="live-dot">{live} live</span>}
        </a>
      </nav>
    </header>
  );
}
