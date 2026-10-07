# CLAUDE.md: InkDuel

Timed writing duels for a classroom, live at **https://inkduel.stipe.app**. A free stand-in for
WeWillWrite, built for Alex's friend, an English teacher with high schoolers (14-16). The teacher
projects a board; students join on their own devices with a PIN and a first name, no accounts.

## The game

Lobby (PIN + QR, name stickers) → students are split into 2-4 teams → for each round: the
challenge goes up (intro) → everyone writes against the clock; texts auto-submit → **duels**: each
student judges two texts from their own team, never their own, every text read at least twice →
the best text per team goes to the **final**, read aloud with technique highlights → class vote
(not for your own text) → points = votes → next round or the final summary. The teacher gets a
report of every text (by round or by student; CSV, Google Docs copy, print).

Texts that are blank, name a classmate, or use a blocked word are **held back** from duels and
finals; the teacher still sees them, with the reason. See `shared/moderation.ts`.

## Layout

```
shared/        protocol.ts (every message and view), duels.ts (who judges what), moderation.ts
worker/        the room server: one Durable Object per game (room.ts), API entry (index.ts)
functions/     Pages Function: forwards /api/* to the Worker through a service binding
src/           React app: pages/ (Join, Play, HostHome, Board, Report), ui/, lib/
public/img/    public-domain paintings and NASA photos for picture prompts
scripts/       mounts.sh, dev-api.sh, deploy.sh, simulate.mjs, e2e.mjs
```

The room owns the clock and the scores; browsers only send commands and get a view tailored to
them (`hostView` / `playerView` in room.ts). Uploaded challenge pictures never reach the server:
they live in the teacher's browser and the board shows its own copy.

## Commands

```bash
npm run dev      # mounts, then wrangler dev (API :8787) + vite (:5173); open /host and /
npm run sim      # simulated class against :8787: node scripts/simulate.mjs <url> <students> <duels>
npm run e2e      # full game in headless Chromium, 7 students, 25 screenshots
npm run build    # typecheck + build into dist/
npm run deploy   # Worker + Pages + domain; verify with curl https://inkduel.stipe.app/api/health
```

## This machine (Aura)

- Source lives on the Drive mount; `node_modules`, `dist` and `.wrangler` are **bindfs mounts**
  from `~/Storage/Developer/{modules/inkduel,build-inkduel/*}` (scripts/mounts.sh, re-run by the npm
  scripts after a reboot). rclone can't hold symlinks.
- `wrangler dev` must not run on the Drive mount: rclone rewrites file times after each upload and
  wrangler restarts the server about once a minute, dropping every connection. `scripts/dev-api.sh`
  runs it from a content-synced mirror in `~/Storage/Developer/build-inkduel/api`.
- Deploy token: the stipe token in `~/Hackathon/.env.local` (Pages, Workers Scripts, DNS on
  stipe.app). Never print it.

## Shipping

Commit, push (`git@github.com:Ouroboros505/inkduel.git`, private), `npm run deploy`. A push alone
deploys nothing. After deploying, `npm run sim -- https://inkduel.stipe.app 12` is a cheap end-to-end
check (it creates a throwaway room that expires in a day).

## Style

The look is a risograph zine on a writer's desk: cream paper, fluorescent inks, ink outlines with
hard shadows, name stickers, tape, sticky notes, notebook paper, a red pen, a rubber stamp. Fonts:
Bricolage Grotesque (display), Fraunces (texts), Caveat (handwriting), Atkinson Hyperlegible (UI).
Keep new screens in that language; avoid soft gradients and generic card UIs.
