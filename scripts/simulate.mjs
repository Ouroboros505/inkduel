// Plays whole games against a running room server with a fake class, and checks the rules hold:
// nobody judges their own text, texts are read twice, one finalist per team, votes add up.
//
//   npm run dev:api            (in another terminal)
//   npm run sim                (or: node scripts/simulate.mjs http://localhost:8787 12)

const BASE = process.argv[2] ?? 'http://localhost:8787';
const N = Number(process.argv[3] ?? 11);
const DUELS = Number(process.argv[4] ?? 1);
const WS = BASE.replace(/^http/, 'ws');

let failures = 0;
const check = (ok, what) => {
  if (!ok) failures++;
  console.log(`${ok ? '  ok ' : '  FAIL'} ${what}`);
};

class Client {
  constructor(pin, label) {
    this.label = label;
    this.view = null;
    this.errors = [];
    this.waiters = [];
    this.ws = new WebSocket(`${WS}/api/rooms/${pin}/ws`);
    this.ws.onmessage = (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.t === 'view') this.view = msg.view;
      if (msg.t === 'joined') this.creds = { id: msg.id, token: msg.token };
      if (msg.t === 'error') this.errors.push(msg.code);
      if (msg.t === 'report') this.report = msg.report;
      if (msg.t === 'kicked') this.kicked = true;
      this.waiters = this.waiters.filter((w) => !w());
    };
    this.opened = new Promise((res, rej) => {
      this.ws.onopen = res;
      this.ws.onerror = rej;
    });
  }
  send(msg) {
    this.ws.send(JSON.stringify(msg));
  }
  until(pred, what, ms = 15000) {
    return new Promise((res, rej) => {
      const test = () => {
        try {
          if (pred(this)) {
            res(this.view);
            return true;
          }
        } catch {}
        return false;
      };
      if (test()) return;
      const t = setTimeout(() => rej(new Error(`${this.label}: timed out waiting for ${what}`)), ms);
      this.waiters.push(() => (test() ? (clearTimeout(t), true) : false));
    });
  }
  close() {
    this.ws.close();
  }
}

const challenge = (id, title) => ({
  id, title, prompt: 'Write the first lines of a story that starts in a lift that stops between floors.',
  criterion: 'Suspense', question: 'Which text builds more suspense?', seconds: 60, levels: ['9-10'],
  kind: 'story', tips: ['The lights flickered and…'],
});

const NAMES = ['Ana', 'Ben', 'Carla', 'Dmitri', 'Eli', 'Fatima', 'Gus', 'Hana', 'Ivan', 'Jules', 'Kofi', 'Lena', 'Mateo', 'Nora', 'Omar', 'Priya', 'Quinn', 'Rafa', 'Sana', 'Tomas', 'Uma', 'Vik', 'Wen', 'Ximena', 'Yusuf', 'Zoe', 'Aiko', 'Bruno', 'Chloe', 'Dante', 'Esme', 'Felix'];
const story = (i) =>
  `The lift shuddered and stopped between the ninth and tenth floors. Student ${i} counted the seconds while the lights hummed, ` +
  `and somewhere above a cable groaned like an old ship. Nobody spoke. Then the emergency phone began to ring, ${'very '.repeat(i % 4)}slowly.`;

async function main() {
  const res = await fetch(`${BASE}/api/rooms`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ settings: { duels: DUELS }, queue: [challenge('c1', 'Stuck'), challenge('c2', 'Second')] }),
  });
  const { pin, token } = await res.json();
  check(/^\d{6}$/.test(pin) && token, `room created (${pin})`);
  check((await (await fetch(`${BASE}/api/rooms/${pin}`)).json()).ok, 'PIN lookup finds the room');
  check((await fetch(`${BASE}/api/rooms/000000`)).status === 404, 'unknown PIN is a 404');

  const host = new Client(pin, 'host');
  await host.opened;
  host.send({ t: 'hello', role: 'host', token });
  await host.until((c) => c.view?.phase === 'lobby', 'lobby');

  const students = [];
  for (let i = 0; i < N; i++) {
    const c = new Client(pin, NAMES[i]);
    await c.opened;
    c.send({ t: 'join', name: NAMES[i] });
    students.push(c);
  }
  await Promise.all(students.map((c) => c.until((x) => x.creds && x.view?.phase === 'lobby', 'join')));
  await host.until((c) => c.view.players.length === N, 'lobby count');
  check(true, `${N} students in the lobby`);

  const dup = new Client(pin, 'dup');
  await dup.opened;
  dup.send({ t: 'join', name: 'ana' });
  await dup.until((c) => c.errors.length, 'duplicate name error');
  check(dup.errors[0] === 'name-taken', 'duplicate name refused');
  dup.send({ t: 'join', name: 'Sh1thead' });
  await dup.until((c) => c.errors.length > 1, 'bad name error');
  check(dup.errors[1] === 'bad-name', 'rude name refused');
  dup.close();

  // ---- round 1 ----
  host.send({ t: 'start' });
  await host.until((c) => c.view.phase === 'intro', 'intro');
  const teams = host.view.teams;
  check(teams.length === (N >= 16 ? 4 : N >= 9 ? 3 : N >= 4 ? 2 : 1), `${teams.length} teams for ${N} students`);
  check(Math.max(...teams.map((t) => t.size)) - Math.min(...teams.map((t) => t.size)) <= 1, 'teams balanced');

  host.send({ t: 'write' });
  await Promise.all(students.map((c) => c.until((x) => x.view.phase === 'writing', 'writing')));
  check(students.every((c) => c.view.draft && c.view.draft.text === ''), 'every student has an empty draft');

  const nameOf = new Map(host.view.players.map((p) => [p.id, p.name]));
  const special = N >= 6;
  students.forEach((c, i) => {
    let text = story(i);
    if (special && i === 0) text = '';
    if (special && i === 1) text = `Then ${NAMES[2]} pressed every button at once and laughed.`;
    if (special && i === 2) text = 'This lift is a piece of shit honestly and I hate it.';
    c.send({ t: 'draft', text: text.slice(0, 20) });
    c.send({ t: 'draft', text, done: i % 2 === 0 });
  });
  await host.until((c) => c.view.progress.done === Math.ceil(N / 2), 'done count');
  check(true, `board sees ${host.view.progress.done} of ${host.view.progress.total} done, ${host.view.progress.words} words`);
  if (N >= 6) {
    await students[4].until((x) => x.view.snippets.length > 0 || !x.view.rules.teamCard, 'team card');
    check(students[4].view.snippets.every((s) => !s.includes('Student 4 ')), 'team card shows teammates, not self');
  }

  host.send({ t: 'skip' });
  await host.until((c) => c.view.phase === 'duel' || c.view.phase === 'finals', 'duel', 8000);
  const noDuels = host.view.phase === 'finals';
  if (noDuels) check(N < 4, 'no duels only happens in a tiny class');
  const held = host.view.entries.filter((e) => e.held);
  if (special) check(held.some((e) => e.held === 'empty' && nameOf.get(e.author) === 'Ana'), 'blank text held back');
  if (special) check(held.some((e) => e.held === 'name' && nameOf.get(e.author) === 'Ben'), 'text naming a classmate held back');
  if (special) check(held.some((e) => e.held === 'word' && nameOf.get(e.author) === 'Carla'), 'text with profanity held back');

  if (!noDuels) await Promise.all(students.map((c) => c.until((x) => x.view.phase === 'duel', 'student duel')));
  const authorOf = new Map(host.view.entries.map((e) => [e.id, e.author]));
  const reads = new Map();
  let ownText = 0;
  for (const c of students) {
    for (const d of c.view.duels) {
      if (authorOf.get(d.a.id) === c.creds.id || authorOf.get(d.b.id) === c.creds.id) ownText++;
      reads.set(d.a.id, (reads.get(d.a.id) ?? 0) + 1);
      reads.set(d.b.id, (reads.get(d.b.id) ?? 0) + 1);
    }
  }
  check(ownText === 0, 'nobody judges their own text');
  const eligible = host.view.entries.filter((e) => !e.held);
  const perTeam = (t) => eligible.filter((e) => e.team === t).length;
  check(eligible.filter((e) => perTeam(e.team) >= 3).every((e) => (reads.get(e.id) ?? 0) >= 2), 'every eligible text is read at least twice');
  const idle = students.filter((c) => c.view.duels.length === 0).length;
  check(N < 4 || idle === 0, `every student has a duel (${idle} idle, ${DUELS} per student)`);
  check(students.every((c) => c.view.duels.length <= DUELS), 'nobody gets more duels than the setting');

  // Everyone picks the longer text; the room should move on by itself once all picks are in.
  for (const c of students) for (const d of c.view.duels) c.send({ t: 'pick', duel: d.id, pick: d.a.words >= d.b.words ? 0 : 1 });
  await host.until((c) => c.view.phase === 'finals', 'finals after all picks', 12000);
  check(true, 'duel phase ends on its own when every pick is in');
  const fin = host.view.finalists;
  const finTeams = fin.map((id) => host.view.entries.find((e) => e.id === id).team);
  check(new Set(finTeams).size === fin.length && fin.length === teams.length, 'one finalist per team');
  check(fin.every((id) => !host.view.entries.find((e) => e.id === id).held), 'no held text reaches the final');

  const vetoed = fin[0];
  host.send({ t: 'veto', id: vetoed });
  await host.until((c) => !c.view.finalists.includes(vetoed), 'veto');
  check(host.view.finalists.length === fin.length || perTeam(finTeams[0]) === 1, 'vetoed finalist replaced by a teammate');

  // A latecomer during the final waits for the next round.
  const late = new Client(pin, 'Late');
  await late.opened;
  late.send({ t: 'join', name: 'Latecomer' });
  await late.until((c) => c.view?.me, 'late join');
  check(late.view.me.late && late.view.me.team !== null, 'latecomer gets a team and waits');

  host.send({ t: 'vote' });
  await host.until((c) => c.view.phase === 'vote' || c.view.phase === 'results', 'vote');
  const solo = host.view.phase === 'results';
  if (solo) check(host.view.finalists.length <= 1, 'one finalist goes straight to results');
  else await Promise.all(students.map((c) => c.until((x) => x.view.phase === 'vote', 'vote')));
  for (const c of [...students, late]) {
    const options = c.view.finalists.filter((f) => !f.mine);
    if (options.length) c.send({ t: 'cast', id: options[0].id });
  }
  await host.until((c) => c.view.phase === 'results', 'results after all votes', 8000);
  const totalVotes = host.view.entries.reduce((n, e) => n + e.votes, 0);
  if (!solo) {
    check(totalVotes === students.length + 1, `all ${totalVotes} votes counted`);
    check(Object.values(host.view.points).reduce((a, b) => a + b, 0) === totalVotes, 'points equal votes');
  }
  check(host.view.winners.length >= 1, `winner: ${host.view.winners.map((t) => teams[t].name).join(', ')}`);
  const me = students[Math.min(5, N - 1)].view.result;
  check(!me || me.reads >= 1 || me.finalist || me.held, `student result: read by ${me?.reads}, won ${me?.wins}`);

  // ---- round 2: reload mid-writing, a kick, the teacher skipping every timer ----
  host.send({ t: 'next' });
  await host.until((c) => c.view.phase === 'intro' && c.view.round === 2, 'round 2 intro');
  host.send({ t: 'write' });
  await late.until((c) => c.view.phase === 'writing', 'late writes');
  check(late.view.draft !== null && !late.view.me.late, 'latecomer writes in round 2');

  const R = Math.min(3, N - 1);
  students[R].send({ t: 'draft', text: 'Half a story that survives a reload of the page' });
  await host.until((c) => c.view.players.find((p) => p.name === NAMES[R]).words > 5, 'draft saved', 5000);
  const creds = students[R].creds;
  students[R].close();
  const back = new Client(pin, `${NAMES[R]} again`);
  await back.opened;
  back.send({ t: 'hello', role: 'player', ...creds });
  await back.until((c) => c.view?.draft, 'restore');
  check(back.view.draft.text.startsWith('Half a story'), 'draft restored after reload');
  students[R] = back;

  if (N > 10) host.send({ t: 'kick', id: host.view.players.find((p) => p.name === 'Kofi')?.id ?? '' });
  if (N > 10) {
    await students[10].until((c) => c.kicked, 'kick');
    check(true, 'kicked student told and disconnected');
  }

  for (const [i, c] of students.entries()) if (!c.kicked) c.send({ t: 'draft', text: story(i + 1) });
  host.send({ t: 'pause' });
  await host.until((c) => c.view.clock.paused !== null, 'pause');
  host.send({ t: 'time', seconds: 30 });
  host.send({ t: 'resume' });
  await host.until((c) => c.view.clock.endsAt !== null && c.view.clock.total === 90000, 'resume with +30s');
  check(true, 'pause, add time, resume');
  host.send({ t: 'skip' });
  await host.until((c) => c.view.phase === 'duel' || c.view.phase === 'finals', 'duel 2', 8000);
  if (host.view.phase === 'duel') host.send({ t: 'skip' });
  await host.until((c) => c.view.phase === 'finals', 'finals 2', 8000);
  check(host.view.finalists.length >= 1, 'finals reached with no picks at all');
  host.send({ t: 'vote' });
  await host.until((c) => c.view.phase === 'vote' || c.view.phase === 'results', 'vote 2');
  if (host.view.phase === 'vote') host.send({ t: 'skip' });
  await host.until((c) => c.view.phase === 'results', 'results 2', 8000);
  check(host.view.history.length === 2, 'two rounds in the history');

  host.send({ t: 'end' });
  await host.until((c) => c.view.phase === 'summary', 'summary');
  const S = students[Math.min(5, N - 1)];
  await S.until((c) => c.view.summary, 'student summary');
  check(S.view.summary.mine.length === 2, 'student can take home both of their texts');
  host.send({ t: 'report' });
  await host.until((c) => c.report, 'report');
  check(host.report.rounds.length === 2 && host.report.rounds[0].entries.length === N, 'report has every text of both rounds');

  for (const c of [host, late, ...students]) c.close();
  console.log(failures ? `\n${failures} check(s) failed` : '\nall checks passed');
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
