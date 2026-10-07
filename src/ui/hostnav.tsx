import { navigate } from '../lib/nav';
import { hostGames, K, load } from '../lib/store';
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

export type HomeTab = 'library' | 'game' | 'settings';

/**
 * On phones the teacher pages become an app: one section per screen and a tab bar under the
 * thumb. Hidden on wider screens, where everything fits side by side.
 */
export function MobileTabs({ active, onTab, rounds: count }: { active: HomeTab | 'games'; onTab?: (t: HomeTab) => void; rounds?: number }) {
  const live = hostGames().length;
  const rounds = count ?? load<unknown[]>(K.playlist, []).length;
  const go = (t: HomeTab) => (onTab ? onTab(t) : navigate(`/host?tab=${t}`));
  return (
    <nav className="m-tabs" aria-label="Teacher sections">
      <button className={active === 'library' ? 'on' : ''} onClick={() => go('library')}>
        <span aria-hidden="true">📚</span>Library
      </button>
      <button className={active === 'game' ? 'on' : ''} onClick={() => go('game')}>
        <span aria-hidden="true">🎮</span>Your game
        {rounds > 0 && <i className="m-badge">{rounds}</i>}
      </button>
      <button className={active === 'settings' ? 'on' : ''} onClick={() => go('settings')}>
        <span aria-hidden="true">⚙️</span>Settings
      </button>
      <button className={active === 'games' ? 'on' : ''} onClick={() => navigate('/host/games')}>
        <span aria-hidden="true">🗂️</span>My games
        {live > 0 && <i className="m-badge live">{live}</i>}
      </button>
    </nav>
  );
}
