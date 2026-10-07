// The API in front of the game rooms. In production the Pages site forwards /api/* here through
// a service binding, so students only ever talk to inkduel.stipe.app; this Worker has no public
// address of its own (school web filters often block *.workers.dev).

import type { Challenge, Settings } from '../../shared/protocol';
import type { Env } from './room';

export { Room } from './room';

function pin(): string {
  const n = crypto.getRandomValues(new Uint32Array(1))[0] % 900_000;
  return String(100_000 + n);
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url);

    if (url.pathname === '/api/rooms' && req.method === 'POST') {
      const body = (await req.json().catch(() => ({}))) as { settings?: Partial<Settings>; queue?: Challenge[] };
      for (let i = 0; i < 10; i++) {
        const p = pin();
        const token = await env.ROOMS.get(env.ROOMS.idFromName(p)).init(p, body.settings, body.queue);
        if (token) return Response.json({ pin: p, token }, { status: 201 });
      }
      return Response.json({ error: 'No free game PIN, try again.' }, { status: 503 });
    }

    const m = url.pathname.match(/^\/api\/rooms\/(\d{6})(?:\/ws|\/report)?$/);
    if (m) return env.ROOMS.get(env.ROOMS.idFromName(m[1])).fetch(req);

    if (url.pathname === '/api/health') return Response.json({ ok: true });
    return Response.json({ error: 'Not found' }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
