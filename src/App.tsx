import { usePath } from './lib/nav';
import { Board } from './pages/Board';
import { HostHome } from './pages/HostHome';
import { MyGames } from './pages/MyGames';
import { Join } from './pages/Join';
import { Play } from './pages/Play';
import { ReportPage } from './pages/Report';

export function App() {
  const path = usePath();
  let m: RegExpMatchArray | null;
  if ((m = path.match(/^\/host\/(\d{6})\/?$/))) return <Board key={m[1]} pin={m[1]} />;
  if (/^\/host\/?$/.test(path)) return <HostHome />;
  if (/^\/host\/games\/?$/.test(path)) return <MyGames />;
  if ((m = path.match(/^\/play\/(\d{6})\/?$/))) return <Play key={m[1]} pin={m[1]} />;
  if ((m = path.match(/^\/report\/(\d{6})\/?$/))) return <ReportPage key={m[1]} pin={m[1]} />;
  return <Join />;
}
