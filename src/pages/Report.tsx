import { useMemo, useState } from 'react';
import type { Report, ReportEntry } from '../../shared/protocol';
import { navigate } from '../lib/nav';
import { K, load } from '../lib/store';
import { fmtPin, Logo, plural, TeamBadge } from '../ui/bits';

const HELD: Record<string, string> = {
  empty: 'too short',
  name: 'names a classmate',
  word: 'blocked word',
  removed: 'removed',
};

function status(e: ReportEntry): string {
  if (e.held) return `held: ${HELD[e.held] ?? e.held}${e.heldDetail ? ` (${e.heldDetail})` : ''}`;
  if (e.finalist) return `finalist, ${plural(e.votes, 'vote')}`;
  return '';
}

function csv(report: Report): string {
  const q = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
  const rows = [['round', 'challenge', 'student', 'team', 'words', 'duels_won', 'duels_read', 'finalist', 'final_votes', 'held', 'text']];
  for (const r of report.rounds)
    for (const e of r.entries)
      rows.push([
        String(r.n), r.challenge.title, e.name, report.teams.find((t) => t.id === e.team)?.name ?? '', String(e.words), String(e.wins), String(e.reads),
        e.finalist ? 'yes' : '', String(e.votes), e.held ? `${HELD[e.held] ?? e.held}${e.heldDetail ? `: ${e.heldDetail}` : ''}` : '', e.text,
      ]);
  return rows.map((r) => r.map(q).join(',')).join('\r\n');
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
}

export function ReportPage({ pin }: { pin: string }) {
  const report = useMemo(() => load<Report | null>(K.report(pin), null), [pin]);
  const [mode, setMode] = useState<'round' | 'student'>('round');
  const [copied, setCopied] = useState(false);

  if (!report)
    return (
      <main className="join">
        <Logo size={40} />
        <div className="join-card center">
          <h2>No report for game {fmtPin(pin)} on this computer</h2>
          <p className="muted">Reports are saved by the browser that ran the board, after every round.</p>
          <button className="btn btn-accent" onClick={() => navigate('/host')}>
            Back to InkDuel
          </button>
        </div>
      </main>
    );

  const team = (id: number | null) => report.teams.find((t) => t.id === id);
  const date = new Date(report.createdAt).toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const students = [...report.players].sort((a, b) => a.name.localeCompare(b.name));

  const download = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(['﻿' + csv(report)], { type: 'text/csv' }));
    a.download = `inkduel-${new Date(report.createdAt).toISOString().slice(0, 10)}-${pin}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  // Pastes into Google Docs with headings and paragraphs intact.
  const copy = async () => {
    const html: string[] = [`<h1>InkDuel, ${escapeHtml(date)}</h1>`];
    const text: string[] = [`InkDuel, ${date}`];
    for (const r of report.rounds) {
      html.push(`<h2>Round ${r.n}: ${escapeHtml(r.challenge.title)}</h2><p><i>${escapeHtml(r.challenge.prompt)}</i></p>`);
      text.push(`\nRound ${r.n}: ${r.challenge.title}\n${r.challenge.prompt}`);
      for (const e of [...r.entries].sort((a, b) => a.name.localeCompare(b.name))) {
        const st = status(e);
        html.push(`<h3>${escapeHtml(e.name)}${st ? ` <small>(${escapeHtml(st)})</small>` : ''}</h3>`);
        html.push(...(e.text || '(nothing written)').split(/\n+/).map((p) => `<p>${escapeHtml(p)}</p>`));
        text.push(`\n${e.name}${st ? ` (${st})` : ''}\n${e.text || '(nothing written)'}`);
      }
    }
    try {
      await navigator.clipboard.write([
        new ClipboardItem({
          'text/html': new Blob([html.join('')], { type: 'text/html' }),
          'text/plain': new Blob([text.join('\n')], { type: 'text/plain' }),
        }),
      ]);
    } catch {
      await navigator.clipboard.writeText(text.join('\n'));
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  return (
    <div className="report">
      <header className="report-top">
        <a href="/host" onClick={(e) => (e.preventDefault(), navigate('/host'))}>
          <Logo size={28} />
        </a>
        <div className="report-title">
          <h1>Game report</h1>
          <p className="muted">
            {date} · PIN {fmtPin(report.pin)} · {plural(report.players.length, 'student')} · {plural(report.rounds.length, 'round')}
          </p>
        </div>
      </header>

      <div className="report-tools">
        <div className="browser-tabs">
          <button className={mode === 'round' ? 'on' : ''} onClick={() => setMode('round')}>
            By round
          </button>
          <button className={mode === 'student' ? 'on' : ''} onClick={() => setMode('student')}>
            By student
          </button>
        </div>
        <span className="spacer" />
        <button className="btn btn-small" onClick={download}>
          Download CSV
        </button>
        <button className="btn btn-small" onClick={copy}>
          {copied ? 'Copied ✓ Paste into a Google Doc' : 'Copy for Google Docs'}
        </button>
        <button className="btn btn-small" onClick={() => window.print()}>
          Print
        </button>
      </div>

      <div className="report-teams">
        {[...report.teams]
          .sort((a, b) => b.points - a.points)
          .map((t) => (
            <span key={t.id} className="score" style={{ '--team': t.color } as React.CSSProperties}>
              <TeamBadge team={t} /> <b>{plural(t.points, 'point')}</b>
            </span>
          ))}
      </div>

      {mode === 'round' &&
        report.rounds.map((r) => (
          <section key={r.n} className="report-round">
            <h2>
              Round {r.n}: {r.challenge.title}
            </h2>
            <p className="report-prompt">{r.challenge.prompt}</p>
            <p className="muted small">
              Wins: {r.challenge.criterion}
              {r.winners.length ? ` · won by the ${r.winners.map((w) => team(w)?.name).join(' & ')}` : ''}
            </p>
            {[...r.entries]
              .sort((a, b) => Number(b.finalist) - Number(a.finalist) || a.name.localeCompare(b.name))
              .map((e) => (
                <article key={e.author} className={`report-entry${e.held ? ' held' : ''}`}>
                  <header>
                    <b>{e.name}</b>
                    <span className="muted">
                      {team(e.team)?.emoji} {plural(e.words, 'word')}
                      {e.reads ? ` · won ${e.wins} of ${plural(e.reads, 'duel')}` : ''}
                    </span>
                    {status(e) && <span className={`chip ${e.held ? 'chip-warn' : 'chip-accent'}`}>{status(e)}</span>}
                  </header>
                  <p className="report-text">{e.text || <em className="muted">Nothing written.</em>}</p>
                </article>
              ))}
          </section>
        ))}

      {mode === 'student' &&
        students.map((p) => (
          <section key={p.id} className="report-round">
            <h2>
              {p.name} <small className="muted">{team(p.team)?.name}</small>
            </h2>
            {report.rounds.map((r) => {
              const e = r.entries.find((x) => x.author === p.id);
              if (!e) return null;
              return (
                <article key={r.n} className={`report-entry${e.held ? ' held' : ''}`}>
                  <header>
                    <b>
                      Round {r.n}: {r.challenge.title}
                    </b>
                    <span className="muted">
                      {plural(e.words, 'word')}
                      {e.reads ? ` · won ${e.wins} of ${plural(e.reads, 'duel')}` : ''}
                    </span>
                    {status(e) && <span className={`chip ${e.held ? 'chip-warn' : 'chip-accent'}`}>{status(e)}</span>}
                  </header>
                  <p className="report-text">{e.text || <em className="muted">Nothing written.</em>}</p>
                </article>
              );
            })}
          </section>
        ))}
    </div>
  );
}
