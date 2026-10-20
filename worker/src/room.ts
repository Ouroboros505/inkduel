// One game room. A Durable Object holds the room's whole state, owns the clock, and pushes a
// tailored view to the board and to every student over WebSockets. The board only sends
// commands; nothing a browser says about time or scores is trusted.

import { DurableObject } from 'cloudflare:workers';
import {
  autoDuelSeconds, countWords, DEFAULT_SETTINGS, MAX_NAME, MAX_PLAYERS, MAX_TEXT, TEAM_STYLES,
  type Challenge, type ClientMsg, type Clock, type EntryCard, type HoldReason, type HostEntry,
  type HostMsg, type HostView, type Phase, type PlayerView, type Report, type RoundSummary,
  type ServerMsg, type Settings, type TeamInfo,
} from '../../shared/protocol';
import { planDuels, shuffle, teamCount } from '../../shared/duels';
import { cleanName, findBlocked, findName } from '../../shared/moderation';

export interface Env {
  ROOMS: DurableObjectNamespace<Room>;
}

const TTL = 24 * 3600_000; // a room is deleted a day after its last activity
const GRACE = 1500; // drafts still accepted this long after the writing deadline
const NO_CLOCK: Clock = { endsAt: null, paused: null, total: null };

interface PlayerRec {
  id: string;
  token: string;
  name: string;
  team: number | null;
  joinedAt: number;
}

interface Entry {
  id: string;
  author: string;
  team: number;
  text: string;
  words: number;
  done: boolean;
  held: HoldReason | null;
  heldDetail: string;
  wins: number;
  reads: number;
  vetoed: boolean;
  votes: number;
  revealed: boolean;
}

interface Duel {
  id: string;
  voter: string;
  team: number;
  a: string;
  b: string;
  cross: boolean;
  pick: 0 | 1 | null;
}

interface Round {
  n: number;
  challenge: Challenge;
  entries: Entry[];
  duels: Duel[];
  /** Eligible entry ids per team, best first; the finalist is the first one not vetoed. */
  ranking: Record<number, string[]>;
  finalists: string[];
  votes: Record<string, string>;
  points: Record<number, number>;
  winners: number[];
  closed: boolean;
}

interface State {
  pin: string;
  token: string;
  createdAt: number;
  lastActive: number;
  phase: Phase;
  clock: Clock;
  locked: boolean;
  settings: Settings;
  teams: Omit<TeamInfo, 'size'>[];
  players: PlayerRec[];
  queue: Challenge[];
  round: number;
}

type Attachment = { role: 'host' } | { role: 'player'; id: string } | null;

function rid(len = 10): string {
  const bytes = crypto.getRandomValues(new Uint8Array(len));
  return Array.from(bytes, (b) => 'abcdefghijkmnpqrstuvwxyz23456789'[b % 32]).join('');
}

function cleanChallenge(c: Challenge): Challenge {
  const str = (v: unknown, max: number) => (typeof v === 'string' ? v.slice(0, max) : '');
  const image = str(c.image, 600);
  return {
    id: str(c.id, 60) || rid(),
    title: str(c.title, 80) || 'Untitled challenge',
    prompt: str(c.prompt, 1200),
    criterion: str(c.criterion, 40) || 'Best',
    question: str(c.question, 160) || 'Which text is better?',
    seconds: Math.min(900, Math.max(30, Math.round(Number(c.seconds) || 240))),
    levels: Array.isArray(c.levels) ? c.levels.filter((l) => ['6-8', '9-10', '11-12'].includes(l)) : [],
    kind: c.kind,
    tips: Array.isArray(c.tips) ? c.tips.slice(0, 4).map((t) => str(t, 200)).filter(Boolean) : [],
    // Uploaded pictures are data: URLs that stay on the teacher's machine; the board shows them
    // from her own copy, so only real URLs travel.
    image: image && !image.startsWith('data:') ? image : undefined,
    credit: str(c.credit, 200) || undefined,
    emoji: str(c.emoji, 16) || undefined,
    custom: !!c.custom,
  };
}

function cleanSettings(s: Partial<Settings> | undefined): Settings {
  const d = DEFAULT_SETTINGS;
  const v = { ...d, ...(s ?? {}) };
  return {
    teams: ([0, 2, 3, 4] as const).includes(v.teams) ? v.teams : d.teams,
    duels: v.duels === 2 ? 2 : 1,
    duelSeconds: Math.min(300, Math.max(0, Math.round(Number(v.duelSeconds) || 0))),
    voteSeconds: Math.min(600, Math.max(0, Math.round(Number(v.voteSeconds) || 0))),
    spellcheck: !!v.spellcheck,
    blockPaste: !!v.blockPaste,
    teamCard: !!v.teamCard,
    tips: !!v.tips,
    holdNames: !!v.holdNames,
    blocked: Array.isArray(v.blocked) ? v.blocked.slice(0, 100).map((w) => String(w).slice(0, 40)) : [],
  };
}

export class Room extends DurableObject<Env> {
  s: State | null = null;
  rounds: Round[] = [];
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private flushAt = 0;
  private saveTimer: ReturnType<typeof setTimeout> | null = null;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // Keep-alive pings from the browsers are answered without waking the room.
    ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    ctx.blockConcurrencyWhile(async () => {
      this.s = (await ctx.storage.get<State>('state')) ?? null;
      if (this.s) {
        const stored = await ctx.storage.list<Round>({ prefix: 'round:' });
        this.rounds = [...stored.values()].sort((a, b) => a.n - b.n);
      }
    });
  }

  // ---- entry points -------------------------------------------------------------------------

  /** Called by the Worker when a teacher creates a game. Returns the host token, or null if the PIN is taken. */
  async init(pin: string, settings: Partial<Settings> | undefined, queue: Challenge[] | undefined): Promise<string | null> {
    if (this.s && Date.now() - this.s.lastActive < TTL) return null;
    await this.ctx.storage.deleteAll();
    const now = Date.now();
    this.rounds = [];
    this.s = {
      pin,
      token: rid(24),
      createdAt: now,
      lastActive: now,
      phase: 'lobby',
      clock: NO_CLOCK,
      locked: false,
      settings: cleanSettings(settings),
      teams: [],
      players: [],
      queue: (queue ?? []).slice(0, 20).map(cleanChallenge),
      round: 0,
    };
    await this.ctx.storage.put('state', this.s);
    await this.arm();
    return this.s.token;
  }

  async fetch(req: Request): Promise<Response> {
    const url = new URL(req.url);
    if (url.pathname.endsWith('/ws')) {
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected a WebSocket', { status: 426 });
      if (!this.s) return new Response('No such game', { status: 404 });
      const pair = new WebSocketPair();
      this.ctx.acceptWebSocket(pair[1]);
      pair[1].serializeAttachment(null);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }
    if (!this.s) return Response.json({ ok: false }, { status: 404 });
    // The teacher's dashboard: her host token proves the game is hers.
    const isHost = req.headers.get('Authorization') === `Bearer ${this.s.token}`;
    if (url.pathname.endsWith('/report')) {
      if (!isHost) return Response.json({ ok: false }, { status: 403 });
      return Response.json(this.report());
    }
    if (req.method === 'DELETE') {
      if (!isHost) return Response.json({ ok: false }, { status: 403 });
      for (const ws of this.ctx.getWebSockets()) {
        this.send(ws, { t: 'error', code: 'gone', message: 'Your teacher ended this game.' });
        ws.close(4404, 'ended');
      }
      await this.ctx.storage.deleteAll();
      await this.ctx.storage.deleteAlarm();
      this.s = null;
      this.rounds = [];
      return new Response(null, { status: 204 });
    }
    return Response.json({
      ok: true,
      phase: this.s.phase,
      locked: this.s.locked,
      players: this.s.players.length,
      round: this.s.round,
      rounds: this.s.round + this.s.queue.length,
      createdAt: this.s.createdAt,
    });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer) {
    if (typeof raw !== 'string' || raw.length > 20_000) return;
    let msg: ClientMsg;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    if (!this.s) {
      this.send(ws, { t: 'error', code: 'gone', message: 'This game has ended.' });
      ws.close(4404, 'gone');
      return;
    }
    this.s.lastActive = Date.now();
    const att = ws.deserializeAttachment() as Attachment;

    if (msg.t === 'hello') {
      if (msg.role === 'host') {
        if (msg.token !== this.s.token) return this.fail(ws, 'bad-token', 'This board is not the host of that game.');
        ws.serializeAttachment({ role: 'host' });
      } else {
        const p = this.s.players.find((x) => x.id === msg.id && x.token === msg.token);
        if (!p) return this.fail(ws, 'unknown-player', 'Join again with your name.');
        ws.serializeAttachment({ role: 'player', id: p.id });
      }
      this.changed();
      return;
    }
    if (msg.t === 'join') return this.join(ws, msg.name);
    if (!att) return this.fail(ws, 'who', 'Say hello first.');
    if (att.role === 'host') this.host(ws, msg as HostMsg);
    else this.player(att.id, msg);
  }

  async webSocketClose(ws: WebSocket, code: number) {
    try {
      ws.close(code === 1005 ? 1000 : code, 'bye');
    } catch {
      // already closed
    }
    // A student dropping off changes who counts as present; a draft-free broadcast is enough.
    if (this.s) this.changed();
  }

  async webSocketError(ws: WebSocket) {
    if (this.s) this.changed();
  }

  async alarm() {
    if (!this.s) return;
    const now = Date.now();
    if (now - this.s.lastActive > TTL) {
      for (const ws of this.ctx.getWebSockets()) ws.close(4404, 'expired');
      await this.ctx.storage.deleteAll();
      this.s = null;
      this.rounds = [];
      return;
    }
    const due = this.deadline();
    if (due !== null && now >= due) {
      this.timeUp();
      this.changed(0);
    }
    await this.arm();
  }

  // ---- helpers ------------------------------------------------------------------------------

  private send(ws: WebSocket, msg: ServerMsg) {
    try {
      ws.send(JSON.stringify(msg));
    } catch {
      // the socket closed between listing and sending; its close handler tidies up
    }
  }

  private fail(ws: WebSocket, code: string, message: string) {
    this.send(ws, { t: 'error', code, message });
  }

  private get cur(): Round | null {
    return this.rounds[this.rounds.length - 1] ?? null;
  }

  private online(): Set<string> {
    const ids = new Set<string>();
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att?.role === 'player') ids.add(att.id);
    }
    return ids;
  }

  private deadline(): number | null {
    const c = this.s!.clock;
    if (c.endsAt === null || c.paused !== null) return null;
    return c.endsAt + (this.s!.phase === 'writing' ? GRACE : 0);
  }

  private async arm() {
    if (!this.s) return;
    const expiry = this.s.lastActive + TTL + 1000;
    const due = this.deadline();
    await this.ctx.storage.setAlarm(due !== null ? Math.min(due, expiry) : expiry);
  }

  private setClock(seconds: number | null) {
    this.s!.clock = seconds === null ? NO_CLOCK : { endsAt: Date.now() + seconds * 1000, paused: null, total: seconds * 1000 };
    void this.arm();
  }

  /** Moves the deadline earlier, never later: used when everyone is finished. */
  private hurry(ms: number) {
    const c = this.s!.clock;
    const soon = Date.now() + ms;
    if (c.paused !== null) return;
    if (c.endsAt === null || c.endsAt > soon) {
      this.s!.clock = { ...c, endsAt: soon };
      void this.arm();
    }
  }

  /** Persist soon and push fresh views to everyone. Bursts (a class typing) are coalesced. */
  private changed(delay = 120) {
    this.saveSoon(delay > 500 ? 1000 : 200);
    const at = Date.now() + delay;
    if (this.flushTimer && this.flushAt <= at) return;
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushAt = at;
    this.flushTimer = setTimeout(() => {
      this.flushTimer = null;
      this.flush();
    }, delay);
  }

  private saveSoon(delay: number) {
    if (this.saveTimer) return;
    this.saveTimer = setTimeout(() => {
      this.saveTimer = null;
      if (!this.s) return;
      void this.ctx.storage.put('state', this.s);
      const r = this.cur;
      if (r) void this.ctx.storage.put(`round:${String(r.n).padStart(3, '0')}`, r);
    }, delay);
  }

  private flush() {
    if (!this.s) return;
    const now = Date.now();
    const online = this.online();
    let hostView: HostView | null = null;
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (!att) continue;
      if (att.role === 'host') {
        hostView ??= this.hostView(online);
        this.send(ws, { t: 'view', view: hostView, now });
      } else {
        const view = this.playerView(att.id);
        if (view) this.send(ws, { t: 'view', view, now });
        else {
          this.send(ws, { t: 'kicked' });
          ws.close(4403, 'removed');
        }
      }
    }
  }

  private teamsInfo(): TeamInfo[] {
    return this.s!.teams.map((t) => ({ ...t, size: this.s!.players.filter((p) => p.team === t.id).length }));
  }

  private smallestTeam(): number | null {
    const teams = this.teamsInfo();
    if (!teams.length) return null;
    return teams.reduce((a, b) => (b.size < a.size ? b : a)).id;
  }

  private entryOf(pid: string): Entry | undefined {
    return this.cur?.entries.find((e) => e.author === pid);
  }

  private ensureEntry(p: PlayerRec) {
    const r = this.cur;
    if (!r || p.team === null || this.entryOf(p.id)) return;
    r.entries.push({
      id: rid(), author: p.id, team: p.team, text: '', words: 0, done: false, held: null, heldDetail: '',
      wins: 0, reads: 0, vetoed: false, votes: 0, revealed: false,
    });
  }

  // ---- students -----------------------------------------------------------------------------

  private join(ws: WebSocket, rawName: string) {
    const s = this.s!;
    if (s.phase === 'summary') return this.fail(ws, 'over', 'This game has finished.');
    if (s.locked) return this.fail(ws, 'locked', 'This game is locked. Ask your teacher to unlock it.');
    if (s.players.length >= MAX_PLAYERS) return this.fail(ws, 'full', 'This game is full.');
    const name = cleanName(String(rawName ?? ''), MAX_NAME);
    if (!name) return this.fail(ws, 'bad-name', "That name can't be used. Try your first name.");
    if (s.players.some((p) => p.name.toLowerCase() === name.toLowerCase()))
      return this.fail(ws, 'name-taken', 'Someone already has that name. Add your last initial.');
    const p: PlayerRec = { id: rid(16), token: rid(24), name, team: null, joinedAt: Date.now() };
    if (s.phase !== 'lobby') p.team = this.smallestTeam();
    s.players.push(p);
    if (s.phase === 'writing') this.ensureEntry(p);
    ws.serializeAttachment({ role: 'player', id: p.id });
    this.send(ws, { t: 'joined', id: p.id, token: p.token });
    this.changed(0);
  }

  private player(pid: string, msg: ClientMsg) {
    const s = this.s!;
    const r = this.cur;
    if (msg.t === 'draft' && s.phase === 'writing') {
      const e = this.entryOf(pid);
      if (!e || typeof msg.text !== 'string') return;
      e.text = msg.text.slice(0, MAX_TEXT);
      e.words = countWords(e.text);
      const doneChanged = typeof msg.done === 'boolean' && msg.done !== e.done;
      if (typeof msg.done === 'boolean') e.done = msg.done;
      this.changed(doneChanged ? 120 : 1000);
    } else if (msg.t === 'pick' && s.phase === 'duel' && r) {
      const d = r.duels.find((x) => x.id === msg.duel && x.voter === pid);
      if (!d || (msg.pick !== 0 && msg.pick !== 1)) return;
      d.pick = msg.pick;
      const online = this.online();
      if (r.duels.every((x) => x.pick !== null || !online.has(x.voter))) this.hurry(1200);
      this.changed();
    } else if (msg.t === 'cast' && s.phase === 'vote' && r) {
      const e = r.entries.find((x) => x.id === msg.id);
      const team = s.players.find((p) => p.id === pid)?.team ?? null;
      // No votes for your own team's finalist (which also rules out your own text).
      if (!e || !r.finalists.includes(e.id) || team === null || e.team === team) return;
      r.votes[pid] = e.id;
      const voters = this.voters();
      if (voters.length && voters.every((v) => r.votes[v])) this.hurry(1200);
      this.changed();
    }
  }

  /** Online students who can vote in the final: on a team, and with something to vote for. */
  private voters(): string[] {
    const r = this.cur!;
    const online = this.online();
    return this.s!.players
      .filter((p) => p.team !== null && online.has(p.id))
      .filter((p) => r.finalists.some((id) => r.entries.find((e) => e.id === id)?.team !== p.team))
      .map((p) => p.id);
  }

  // Writing never ends early because everyone pressed "I'm done": with one or two students that
  // ended the round seconds after it began, which looked like the time limit was broken. The
  // board shows "everyone's done" instead and the teacher decides (hostView progress).


  // ---- teacher ------------------------------------------------------------------------------

  private host(ws: WebSocket, msg: HostMsg) {
    const s = this.s!;
    switch (msg.t) {
      case 'start':
        if (s.phase !== 'lobby') return;
        if (!s.queue.length) return this.fail(ws, 'no-challenge', 'Pick a challenge first.');
        if (!s.players.length) return this.fail(ws, 'no-players', 'Wait for at least one student to join.');
        this.assignTeams();
        this.newRound();
        break;
      case 'queue':
        if (!Array.isArray(msg.challenges)) return;
        s.queue = msg.challenges.slice(0, 20).map(cleanChallenge);
        break;
      case 'swap':
        if (s.phase === 'intro' && this.cur) this.cur.challenge = cleanChallenge(msg.challenge);
        else if (s.phase === 'lobby') s.queue = [cleanChallenge(msg.challenge), ...s.queue.slice(1)];
        break;
      case 'write':
        if (s.phase !== 'intro') return;
        for (const p of s.players) this.ensureEntry(p);
        s.phase = 'writing';
        this.setClock(this.cur!.challenge.seconds);
        break;
      case 'skip':
        if (s.phase === 'vote' && s.clock.endsAt === null) this.closeVote();
        else if (['writing', 'duel', 'vote'].includes(s.phase)) {
          s.clock = { ...s.clock, endsAt: Date.now(), paused: null };
          void this.arm();
        }
        break;
      case 'time': {
        const add = Math.round(Number(msg.seconds) || 0) * 1000;
        const c = s.clock;
        if (c.paused !== null) s.clock = { ...c, paused: Math.max(5000, c.paused + add), total: (c.total ?? 0) + add };
        else if (c.endsAt !== null) {
          s.clock = { ...c, endsAt: Math.max(Date.now() + 5000, c.endsAt + add), total: (c.total ?? 0) + add };
          void this.arm();
        }
        break;
      }
      case 'pause':
        if (s.clock.endsAt !== null && s.clock.paused === null) {
          s.clock = { ...s.clock, paused: Math.max(0, s.clock.endsAt - Date.now()), endsAt: null };
          void this.arm();
        }
        break;
      case 'resume':
        if (s.clock.paused !== null) {
          s.clock = { ...s.clock, endsAt: Date.now() + s.clock.paused, paused: null };
          void this.arm();
        }
        break;
      case 'veto':
        if (s.phase === 'finals') this.veto(msg.id);
        break;
      case 'vote':
        if (s.phase === 'finals') this.openVote();
        break;
      case 'reveal': {
        const e = this.cur?.entries.find((x) => x.id === msg.id);
        if (e && (s.phase === 'results' || s.phase === 'summary')) e.revealed = !e.revealed;
        break;
      }
      case 'next':
        // From the final scores too: the same class keeps playing, points carry on.
        if (s.phase !== 'results' && s.phase !== 'summary') return;
        if (!s.queue.length) return this.fail(ws, 'no-challenge', 'Pick the next challenge first.');
        this.newRound();
        break;
      case 'end':
        if (s.phase === 'writing') this.finalizeTexts();
        s.phase = 'summary';
        this.setClock(null);
        break;
      case 'kick':
        this.kick(msg.id);
        break;
      case 'lock':
        s.locked = !!msg.locked;
        break;
      case 'settings':
        s.settings = cleanSettings(msg.settings);
        break;
      case 'report':
        this.send(ws, { t: 'report', report: this.report() });
        return;
      default:
        return;
    }
    this.changed(0);
  }

  private assignTeams() {
    const s = this.s!;
    const k = teamCount(s.players.length, s.settings.teams);
    s.teams = Array.from({ length: k }, (_, i) => ({ id: i, ...TEAM_STYLES[i], points: 0 }));
    shuffle(s.players).forEach((p, i) => (p.team = i % k));
  }

  private newRound() {
    const s = this.s!;
    const challenge = s.queue.shift()!;
    s.round += 1;
    for (const p of s.players) if (p.team === null) p.team = this.smallestTeam();
    this.rounds.push({
      n: s.round, challenge, entries: [], duels: [], ranking: {}, finalists: [], votes: {}, points: {}, winners: [], closed: false,
    });
    s.phase = 'intro';
    this.setClock(null);
  }

  private kick(pid: string) {
    const s = this.s!;
    const p = s.players.find((x) => x.id === pid);
    if (!p) return;
    s.players = s.players.filter((x) => x.id !== pid);
    const r = this.cur;
    if (r) {
      if (s.phase === 'lobby' || s.phase === 'intro' || s.phase === 'writing') r.entries = r.entries.filter((e) => e.author !== pid);
      else {
        const e = r.entries.find((x) => x.author === pid);
        if (e) {
          e.held = 'removed';
          e.heldDetail = 'Removed by the teacher';
          if (r.finalists.includes(e.id)) this.veto(e.id);
        }
      }
      r.duels = r.duels.filter((d) => d.voter !== pid);
      delete r.votes[pid];
    }
    for (const ws of this.ctx.getWebSockets()) {
      const att = ws.deserializeAttachment() as Attachment;
      if (att?.role === 'player' && att.id === pid) {
        this.send(ws, { t: 'kicked' });
        ws.close(4403, 'removed');
      }
    }
  }

  // ---- phases -------------------------------------------------------------------------------

  private timeUp() {
    const phase = this.s!.phase;
    if (phase === 'writing') this.finishWriting();
    else if (phase === 'duel') this.finishDuels();
    else if (phase === 'vote') this.closeVote();
  }

  /** Word counts and hold-backs for every text of the round. */
  private finalizeTexts() {
    const s = this.s!;
    const r = this.cur!;
    const names = s.players.map((p) => p.name);
    for (const e of r.entries) {
      e.text = e.text.replace(/\s+$/, '');
      e.words = countWords(e.text);
      e.held = null;
      e.heldDetail = '';
      if (e.words < 3) {
        e.held = 'empty';
        e.heldDetail = e.words ? 'Too short to duel' : 'Nothing written';
        continue;
      }
      const word = findBlocked(e.text, s.settings.blocked);
      if (word) {
        e.held = 'word';
        e.heldDetail = `Uses "${word}"`;
        continue;
      }
      const name = s.settings.holdNames ? findName(e.text, names) : null;
      if (name) {
        e.held = 'name';
        e.heldDetail = `Names ${name}`;
      }
    }
  }

  private finishWriting() {
    const s = this.s!;
    const r = this.cur!;
    this.finalizeTexts();
    const online = this.online();
    const pools = s.teams.map((t) => ({
      team: t.id,
      voters: r.entries.filter((e) => e.team === t.id && online.has(e.author)).map((e) => e.author),
      texts: r.entries.filter((e) => e.team === t.id && !e.held).map((e) => ({ id: e.id, author: e.author })),
    }));
    r.duels = planDuels(pools, s.settings.duels).map((p) => ({ ...p, id: rid(), pick: null }));
    if (!r.duels.length) return this.finishDuels();
    const eligible = r.entries.filter((e) => !e.held);
    const avg = eligible.reduce((n, e) => n + e.words, 0) / Math.max(1, eligible.length);
    s.phase = 'duel';
    this.setClock(s.settings.duelSeconds ? s.settings.duelSeconds * s.settings.duels : autoDuelSeconds(avg, s.settings.duels));
  }

  private finishDuels() {
    const s = this.s!;
    const r = this.cur!;
    for (const e of r.entries) {
      e.wins = 0;
      e.reads = 0;
    }
    const byId = new Map(r.entries.map((e) => [e.id, e]));
    for (const d of r.duels) {
      if (d.pick === null) continue;
      byId.get(d.a)!.reads++;
      byId.get(d.b)!.reads++;
      byId.get(d.pick === 0 ? d.a : d.b)!.wins++;
    }
    const rate = (e: Entry) => (e.reads ? e.wins / e.reads : 0);
    for (const t of s.teams) {
      const pool = shuffle(r.entries.filter((e) => e.team === t.id && !e.held));
      pool.sort((a, b) => b.wins - a.wins || rate(b) - rate(a));
      r.ranking[t.id] = pool.map((e) => e.id);
    }
    this.pickFinalists();
    s.phase = 'finals';
    this.setClock(null);
  }

  private pickFinalists() {
    const r = this.cur!;
    const byId = new Map(r.entries.map((e) => [e.id, e]));
    r.finalists = this.s!.teams
      .map((t) => (r.ranking[t.id] ?? []).find((id) => !byId.get(id)!.vetoed && !byId.get(id)!.held))
      .filter((id): id is string => !!id);
  }

  private veto(id: string) {
    const r = this.cur!;
    const e = r.entries.find((x) => x.id === id);
    if (!e) return;
    e.vetoed = true;
    this.pickFinalists();
  }

  private openVote() {
    const r = this.cur!;
    if (r.finalists.length <= 1) return this.closeVote();
    r.votes = {};
    this.s!.phase = 'vote';
    this.setClock(this.s!.settings.voteSeconds || null);
  }

  private closeVote() {
    const s = this.s!;
    const r = this.cur!;
    const byId = new Map(r.entries.map((e) => [e.id, e]));
    for (const e of r.entries) e.votes = 0;
    for (const id of Object.values(r.votes)) if (byId.has(id) && r.finalists.includes(id)) byId.get(id)!.votes++;
    r.points = {};
    for (const id of r.finalists) {
      const e = byId.get(id)!;
      r.points[e.team] = r.finalists.length === 1 ? 1 : e.votes;
    }
    const best = Math.max(0, ...Object.values(r.points));
    r.winners = best > 0 ? Object.keys(r.points).map(Number).filter((t) => r.points[t] === best) : [];
    for (const t of s.teams) t.points += r.points[t.id] ?? 0;
    r.closed = true;
    s.phase = 'results';
    this.setClock(null);
  }

  // ---- views --------------------------------------------------------------------------------

  private card(r: Round, id: string): EntryCard {
    const e = r.entries.find((x) => x.id === id)!;
    return { id: e.id, team: e.team, text: e.text, words: e.words };
  }

  private hostView(online: Set<string>): HostView {
    const s = this.s!;
    const r = this.cur;
    const phase = s.phase;
    const afterWriting = !!r && !['lobby', 'intro', 'writing'].includes(phase);
    const nameOf = new Map(s.players.map((p) => [p.id, p.name]));

    let progress = { done: 0, total: 0, words: 0 };
    const teamWords: Record<number, number> = {};
    if (r) {
      const words = r.entries.reduce((n, e) => n + e.words, 0);
      for (const e of r.entries) teamWords[e.team] = (teamWords[e.team] ?? 0) + e.words;
      if (phase === 'writing') {
        const here = r.entries.filter((e) => online.has(e.author) || e.done);
        progress = { done: here.filter((e) => e.done).length, total: here.length, words };
      } else if (phase === 'duel') {
        progress = { done: r.duels.filter((d) => d.pick !== null).length, total: r.duels.length, words };
      } else if (phase === 'vote') {
        progress = { done: Object.keys(r.votes).length, total: this.voters().length, words };
      } else progress = { done: 0, total: 0, words };
    }

    const entries: HostEntry[] = r
      ? r.entries.map((e) => ({
          id: e.id,
          team: e.team,
          // Live drafts aren't sent while the class writes: thirty texts every second is a lot
          // of traffic for something the board never shows.
          text: afterWriting ? e.text : '',
          words: e.words,
          author: e.author,
          authorName: nameOf.get(e.author) ?? '(left)',
          held: afterWriting ? e.held : null,
          heldDetail: afterWriting ? e.heldDetail : '',
          wins: e.wins,
          reads: e.reads,
          finalist: r.finalists.includes(e.id),
          vetoed: e.vetoed,
          votes: e.votes,
          revealed: e.revealed,
        }))
      : [];

    const history: RoundSummary[] = this.rounds
      .filter((x) => x.closed)
      .map((x) => ({ n: x.n, title: x.challenge.title, points: x.points, winners: x.winners }));
    const all = this.rounds.flatMap((x) => x.entries);

    return {
      role: 'host',
      pin: s.pin,
      phase,
      clock: s.clock,
      locked: s.locked,
      settings: s.settings,
      teams: this.teamsInfo(),
      players: s.players.map((p) => {
        const e = r?.entries.find((x) => x.author === p.id);
        return {
          id: p.id,
          name: p.name,
          team: p.team,
          online: online.has(p.id),
          words: e?.words ?? 0,
          done: e?.done ?? false,
          late: !!r && !e && phase !== 'intro' && phase !== 'lobby',
        };
      }),
      round: s.round,
      challenge: r && phase !== 'lobby' ? r.challenge : null,
      queue: s.queue,
      progress,
      teamWords,
      entries,
      finalists: r?.finalists ?? [],
      winners: r?.winners ?? [],
      points: r?.points ?? {},
      history,
      stats: {
        words: all.reduce((n, e) => n + e.words, 0),
        texts: all.filter((e) => e.words > 0).length,
        rounds: history.length,
      },
    };
  }

  private playerView(pid: string): PlayerView | null {
    const s = this.s!;
    const p = s.players.find((x) => x.id === pid);
    if (!p) return null;
    const r = this.cur;
    const phase = s.phase;
    const e = this.entryOf(pid);
    const showFinal = !!r && ['finals', 'vote', 'results'].includes(phase);

    let snippets: string[] = [];
    if (r && phase === 'writing' && s.settings.teamCard && p.team !== null) {
      snippets = r.entries
        .filter((x) => x.team === p.team && x.author !== pid && x.words >= 3)
        .sort((a, b) => a.id.localeCompare(b.id))
        .slice(0, 6)
        .map((x) => {
          const ws = x.text.trim().split(/\s+/);
          return ws.slice(0, 8).join(' ') + (ws.length > 8 ? '…' : '');
        });
    }

    const mine = this.rounds
      .map((x) => ({ round: x.n, title: x.challenge.title, text: x.entries.find((y) => y.author === pid)?.text ?? '' }))
      .filter((x) => x.text.trim());
    const all = this.rounds.flatMap((x) => x.entries);

    return {
      role: 'player',
      pin: s.pin,
      phase,
      clock: s.clock,
      me: { id: p.id, name: p.name, team: p.team, late: !!r && !e && ['writing', 'duel', 'finals', 'vote', 'results'].includes(phase) },
      teams: this.teamsInfo(),
      round: s.round,
      challenge: r && phase !== 'lobby' ? r.challenge : null,
      rules: {
        spellcheck: s.settings.spellcheck,
        blockPaste: s.settings.blockPaste,
        teamCard: s.settings.teamCard,
        tips: s.settings.tips,
      },
      draft: phase === 'writing' && e ? { text: e.text, done: e.done } : null,
      snippets,
      duels:
        r && phase === 'duel'
          ? r.duels.filter((d) => d.voter === pid).map((d) => ({ id: d.id, a: this.card(r, d.a), b: this.card(r, d.b), pick: d.pick }))
          : [],
      finalists: showFinal
        ? r!.finalists.map((id) => {
            const f = r!.entries.find((x) => x.id === id)!;
            const card = this.card(r!, id);
            // Finalists are anonymous until the vote closes: phones get no team, only whether the
            // text is from their own team (they can't vote for it).
            return {
              ...card,
              team: phase === 'results' ? card.team : -1,
              mine: f.author === pid,
              ownTeam: f.team === p.team,
              votes: phase === 'results' ? f.votes : undefined,
            };
          })
        : [],
      vote: r && (phase === 'vote' || phase === 'results') ? r.votes[pid] ?? null : null,
      winners: r && phase === 'results' ? r.winners : [],
      points: r && phase === 'results' ? r.points : {},
      result:
        r && e && (phase === 'results' || phase === 'finals' || phase === 'vote')
          ? { words: e.words, reads: e.reads, wins: e.wins, finalist: r.finalists.includes(e.id), held: e.held }
          : null,
      summary:
        phase === 'summary'
          ? { words: all.reduce((n, x) => n + x.words, 0), texts: all.filter((x) => x.words > 0).length, mine }
          : null,
    };
  }

  private report(): Report {
    const s = this.s!;
    const nameOf = new Map(s.players.map((p) => [p.id, p.name]));
    return {
      pin: s.pin,
      createdAt: s.createdAt,
      savedAt: Date.now(),
      teams: this.teamsInfo(),
      players: s.players.map((p) => ({ id: p.id, name: p.name, team: p.team })),
      rounds: this.rounds.map((r) => ({
        n: r.n,
        challenge: r.challenge,
        entries: r.entries.map((e) => ({
          author: e.author,
          name: nameOf.get(e.author) ?? '(removed)',
          team: e.team,
          text: e.text,
          words: e.words,
          held: e.held,
          heldDetail: e.heldDetail,
          wins: e.wins,
          reads: e.reads,
          finalist: r.finalists.includes(e.id),
          votes: e.votes,
        })),
        points: r.points,
        winners: r.winners,
      })),
    };
  }
}
