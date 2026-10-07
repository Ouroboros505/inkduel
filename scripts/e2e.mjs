// Drives a full InkDuel game in headless Chromium: a teacher board and seven students, each in
// their own browser context (so their saved credentials don't collide). Screenshots every phase.
//
//   npm run e2e                                   (against npm run dev on :5173)
//   node scripts/e2e.mjs https://inkduel.stipe.app /tmp/shots
//
// Uses the system Chromium (CHROMIUM=/path to override); puppeteer-core downloads no browser.
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const BASE = process.argv[2] ?? 'http://localhost:5173';
const OUT = process.argv[3] ?? path.join(os.tmpdir(), 'inkduel-shots');
fs.mkdirSync(OUT, { recursive: true });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

const browser = await puppeteer.launch({
  executablePath: process.env.CHROMIUM ?? '/usr/bin/chromium-browser',
  headless: true,
  args: ['--no-sandbox', '--disable-gpu', '--autoplay-policy=no-user-gesture-required'],
});

const errors = [];
async function newPage(ctx, w, h, label) {
  const page = await ctx.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  page.on('pageerror', (e) => errors.push(`${label}: ${e.message}`));
  page.on('console', (m) => m.type() === 'error' && errors.push(`${label} console: ${m.text()}`));
  return page;
}
async function clickText(page, text, sel = 'button') {
  const ok = await page.evaluate(
    (text, sel) => {
      const el = [...document.querySelectorAll(sel)].find((b) => b.textContent.replace(/\s+/g, ' ').includes(text) && !b.disabled);
      if (!el) return false;
      el.click();
      return true;
    },
    text,
    sel,
  );
  if (!ok) throw new Error(`no clickable "${text}"`);
}
async function waitText(page, text, ms = 15000) {
  await page.waitForFunction((t) => document.body.innerText.includes(t), { timeout: ms }, text);
}
const waitSel = (page, sel, ms = 15000) => page.waitForSelector(sel, { timeout: ms });
const shot = (page, name) => page.screenshot({ path: `${OUT}/${name}.png` });

// ---- teacher sets up ----
const tctx = await browser.createBrowserContext();
const board = await newPage(tctx, 1600, 900, 'board');
await board.goto(`${BASE}/host`, { waitUntil: 'networkidle0' });
await shot(board, '01-home');
await clickText(board, 'The Last Message', '.tile');
await wait(300);
await shot(board, '02-preview');
await clickText(board, 'Add to game');
await clickText(board, 'Above the Fog', '.tile');
await clickText(board, 'Add to game');
await wait(300);
await shot(board, '03-home-playlist');
await clickText(board, 'Start a game');
await board.waitForFunction(() => /\/host\/\d{6}/.test(location.pathname), { timeout: 15000 });
const pin = board.url().match(/\/host\/(\d{6})/)[1];
log('room', pin);
await waitText(board, 'Waiting for writers');
await shot(board, '04-board-lobby-empty');

// ---- students join ----
const STUDENTS = [
  ['Maya R', 390, 844],
  ['Leo P', 1366, 768],
  ['Sofia', 390, 844],
  ['Jamal', 1366, 768],
  ['Grace K', 390, 844],
  ['Tom', 1366, 768],
  ['Ava', 390, 844],
];
const kids = [];
for (const [name, w, h] of STUDENTS) {
  const ctx = await browser.createBrowserContext();
  const page = await newPage(ctx, w, h, name);
  await page.goto(`${BASE}/?pin=${pin}`, { waitUntil: 'networkidle0' });
  await page.waitForSelector('.name-input', { timeout: 10000 });
  await page.type('.name-input', name);
  await clickText(page, 'Join the game');
  await waitText(page, `You're in`);
  kids.push({ name, page });
}
await shot(kids[0].page, '05-student-lobby-phone');
await waitText(board, '7 writers in');
await shot(board, '06-board-lobby-full');

// ---- round 1 ----
await clickText(board, 'Start with');
await waitText(board, 'The Last Message');
await wait(400);
await shot(board, '07-board-intro');
await waitText(kids[0].page, "You're on the");
await shot(kids[0].page, '08-student-intro-phone');

await clickText(board, 'Start writing');
await Promise.all(kids.map((k) => k.page.waitForSelector('.write-area', { timeout: 10000 })));
const TEXTS = [
  `The message said only: "Don't open the door." I read it four times. Somewhere downstairs, the old floorboards creaked, slow and careful, like someone who knew exactly where to step. My phone buzzed again. "Too late," it said.`,
  `2:13 a.m. Grandpa's number. Grandpa, who had been gone for three winters. My thumb hovered. The screen glowed cold and blue in the dark. "Check the attic," it read. "I left something for you." Why now? Why me?`,
  `I almost didn't look. But the buzz was so loud in the silent house that the dog lifted his head. The text was a photo of my own bedroom, taken from the closet. The closet door was open. It had been closed when I went to bed.`,
  `It was from my old number. The one I had when I was twelve. "Hey, it's you. Listen. Tomorrow at the bus stop, don't get on." Then the phone died. I sat there in the dark, counting my breaths, wondering who I used to be.`,
  `Bzzz. Bzzz. "Are you awake?" Of course I was awake. Nobody sleeps the night before the trial. I typed back: "Who is this?" Three dots appeared, vanished, appeared again. Then: "The witness you never found."`,
  `The phone said: hi. that's it. just hi. I said hi back. Then it sent a picture of a cat.`,
  `My mom's old phone number texted me: "Did you water the plants?" My mom has had a new number for six years. The plants have been dead for six years. I went to the kitchen. The soil was wet.`,
];
for (const [i, k] of kids.entries()) await k.page.type('.write-area', TEXTS[i], { delay: 0 });
await clickText(kids[1].page, 'Need a spark');
await wait(300);
await shot(kids[1].page, '09-student-writing-chromebook');
await shot(kids[0].page, '10-student-writing-phone');
await wait(1600);
await shot(board, '11-board-writing');
// The countdown's progress ring must sit inside its timer (a stray `.bar` rule once moved it).
const ring = await board.evaluate(() => {
  const box = document.querySelector('.countdown')?.getBoundingClientRect();
  const bar = document.querySelector('.countdown .bar')?.getBoundingClientRect();
  if (!box || !bar) return 'no countdown';
  const cx = bar.left + bar.width / 2;
  const cy = bar.top + bar.height / 2;
  return Math.abs(cx - (box.left + box.width / 2)) < box.width * 0.1 && Math.abs(cy - (box.top + box.height / 2)) < box.height * 0.1 ? 'ok' : 'off-centre';
});
if (ring !== 'ok') errors.push(`countdown ring: ${ring}`);
for (const k of kids.slice(0, 3)) await clickText(k.page, "I'm done");

await clickText(board, 'End writing now');
await waitSel(board, '.stage-duel');
await wait(500);
await shot(board, '12-board-duel');
await Promise.all(kids.map((k) => waitText(k.page, 'wins', 10000).catch(() => {})));
await shot(kids[1].page, '13-student-duel-chromebook');
await shot(kids[0].page, '14-student-duel-phone');
for (const k of kids) {
  const has = await k.page.$('.duel-card');
  if (has) await clickText(k.page, 'A wins').catch(() => {});
}
await waitSel(board, '.stage-finals');
await wait(500);
await shot(board, '15-board-finals');
await clickText(board, 'Read aloud');
await wait(400);
await shot(board, '16-board-reader');
await board.evaluate(() => {
  const chips = [...document.querySelectorAll('.tech')];
  (chips.find((c) => c.textContent.includes('Comparisons')) ?? chips[1] ?? chips[0])?.click();
});
await wait(300);
await shot(board, '17-board-reader-technique');
await board.keyboard.press('Escape');

await clickText(board, 'Open the class vote');
await Promise.all(kids.map((k) => waitSel(k.page, '.final-card button', 10000).catch(() => {})));
await shot(kids[0].page, '18-student-vote-phone');
await shot(board, '19-board-vote');
for (const k of kids) await k.page.evaluate(() => [...document.querySelectorAll('.final-card button')][0]?.click());
await waitText(board, 'Scoreboard', 15000);
await wait(1500);
await shot(board, '20-board-results');
await clickText(board, 'who wrote it');
await wait(400);
await shot(board, '21-board-results-revealed');
await shot(kids[0].page, '22-student-results-phone');

// ---- finish ----
await clickText(board, 'Finish the game');
await waitText(board, 'words written', 10000);
await wait(1200);
await shot(board, '23-board-summary');
await waitText(kids[1].page, 'Game over', 10000);
await shot(kids[1].page, '24-student-summary');
await wait(1000);
const report = await newPage(tctx, 1200, 900, 'report');
await report.goto(`${BASE}/report/${pin}`, { waitUntil: 'networkidle0' });
await shot(report, '25-report');

log('errors:', errors.length ? errors : 'none');
log('screenshots in', OUT);
await browser.close();
process.exit(errors.length ? 1 : 0);
