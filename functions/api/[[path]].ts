// Everything under /api goes to the game-room Worker (inkduel-rooms) through a service binding,
// WebSocket upgrades included. See worker/src/index.ts.
interface Env {
  API: { fetch: (req: Request) => Promise<Response> };
}

export const onRequest = ({ request, env }: { request: Request; env: Env }) => env.API.fetch(request);
