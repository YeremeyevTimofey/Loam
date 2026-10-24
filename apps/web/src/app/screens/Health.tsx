import { FILE } from '@loam/core';
import type { LintFinding, LintReport } from '@loam/core/lint';
import { ArrowRight, CircleCheck, CircleAlert, RefreshCw, Wrench } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';
import { NewTabLink } from '../components/NewTabLink';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { useApp } from '../context';
import { cn } from '../lib/cn';
import { repoFile } from '../lib/links';

const n = (x: number) => x.toLocaleString('en-US');
const SEVERITY = { high: ['danger', 'Important'], medium: ['warning', 'Worth fixing'], low: ['muted', 'Minor'] } as const;

/** Screen 5 (§12B): the ten checks of Context Lint, what to do about them, and the before / after. */
export function HealthScreen() {
  const { store, today, snap, propose, go } = useApp();
  const [report, setReport] = useState<LintReport | null>(null);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const run = useCallback(async () => {
    setRunning(true);
    setError(null);
    try {
      // The tokenizer is large, so it is only fetched when this screen is opened.
      const { runLint } = await import('@loam/core/lint');
      const next = await runLint(store, { today });
      setReport(next);
      await store.writeFile(FILE.lintReport, `${JSON.stringify(next, null, 2)}\n`);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The check could not run.');
    } finally {
      setRunning(false);
    }
  }, [store, today]);

  useEffect(() => {
    void run();
    // Re-run whenever the folder is re-read (after Apply, Refresh, restore).
  }, [run, snap]);

  const fix = async (finding: LintFinding) => {
    if (!finding.fix) return;
    const lint = await import('@loam/core/lint');
    const core = await import('@loam/core');
    const plan =
      finding.fix.kind === 'sync'
        ? await core.planSyncAgentSkills(store)
        : finding.fix.kind === 'protocol'
          ? await core.planUpdateProtocol(store)
          : finding.fix.kind === 'dedupe'
          ? await lint.planFixDuplicates(store, today)
          : await lint.planTouchProcess(store, finding.fix.slug ?? '', today);
    await propose(plan, { title: finding.fix.label, description: 'This is the fix Loam can do for you. Read it, then press Apply.' });
  };

  if (!report) {
    return (
      <div>
        <h1 className="t-h1 mb-3">Health</h1>
        {error ? (
          <p role="alert" className="rounded-md bg-danger-soft p-3 text-danger">
            {error}
          </p>
        ) : (
          <p className="t-secondary" aria-live="polite">
            Checking your files…
          </p>
        )}
      </div>
    );
  }

  const s = report.savings;
  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="measure !mx-0">
          <h1 className="t-h1">Health</h1>
          <p className="t-secondary mt-2">
            {report.findings.length === 0
              ? 'Everything looks good. Your agent reads little and finds what it needs.'
              : `${report.findings.length} thing${report.findings.length === 1 ? '' : 's'} to look at. The most important come first.`}{' '}
            <NewTabLink inline href={repoFile('docs/ARCHITECTURE.md#context-lint')}>
              How these checks work
            </NewTabLink>
            .
          </p>
        </div>
        <Button variant="secondary" onClick={() => void run()} disabled={running}>
          <RefreshCw size={20} aria-hidden className={running ? 'animate-spin' : ''} /> Check again
        </Button>
      </div>

      <section aria-labelledby="checks-h" className="mb-10">
        <h2 id="checks-h" className="t-h2 mb-4">
          The ten checks
        </h2>
        <Card className="p-0 md:p-0">
          <ul className="divide-y divide-line">
            {report.checks.map((c) => (
              <li key={c.rule} className="flex items-start gap-3 p-4 md:px-6">
                {c.status === 'ok' ? <CircleCheck size={20} aria-hidden className="mt-0.5 shrink-0 text-success" /> : <CircleAlert size={20} aria-hidden className="mt-0.5 shrink-0 text-warning" />}
                <div className="min-w-0">
                  <p className="font-medium">
                    {c.name} <span className={cn('ml-1 text-[13px] font-medium', c.status === 'ok' ? 'text-success-ink' : 'text-warning-ink')}>{c.status === 'ok' ? 'OK' : 'Look at this'}</span>
                  </p>
                  <p className="t-secondary">{c.summary}</p>
                </div>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      {report.findings.length > 0 ? (
        <section aria-labelledby="todo-h" className="mb-10">
          <h2 id="todo-h" className="t-h2 mb-4">
            What to do
          </h2>
          <ul className="space-y-3">
            {report.findings.map((f, i) => {
              const [tone, label] = SEVERITY[f.severity];
              return (
                <li key={`${f.rule}-${i}`}>
                  <Card className="appear p-4">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <Badge tone={tone}>{label}</Badge>
                      <h3 className="font-semibold">{f.title}</h3>
                    </div>
                    <p className="mb-3">{f.detail}</p>
                    {f.files.length > 0 ? (
                      <p className="t-secondary mb-3 break-words">
                        {f.files.slice(0, 4).map((file) => (
                          <code key={file} className="mr-2 inline-block">
                            {file}
                          </code>
                        ))}
                        {f.files.length > 4 ? `and ${f.files.length - 4} more` : null}
                      </p>
                    ) : null}
                    <div className="flex flex-wrap gap-2">
                      {f.fix ? (
                        <Button onClick={() => void fix(f)}>
                          <Wrench size={20} aria-hidden /> Fix: {f.fix.label}
                        </Button>
                      ) : null}
                      {f.goto ? (
                        <Button variant="secondary" onClick={() => go(f.goto!.screen === 'process' ? { screen: 'process', process: f.goto!.slug } : { screen: 'skills' })}>
                          {f.goto.label} <ArrowRight size={20} aria-hidden />
                        </Button>
                      ) : null}
                    </div>
                  </Card>
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      <section aria-labelledby="ba-h">
        <h2 id="ba-h" className="t-h2 mb-4">
          Before / after
        </h2>
        <Card>
          <p className="t-secondary mb-5">Your agent pays for every token it reads. This is what a typical task reads now, and after the suggestions above are applied.</p>
          <div className="grid gap-6 md:grid-cols-2">
            <div>
              <p className="t-secondary">A typical task</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight" data-testid="typical-after">
                {n(s.typicalBefore)} <span aria-hidden>→</span> <span className="sr-only">to</span> {n(s.typicalAfter)} <span className="text-base font-normal text-muted">tokens</span>
              </p>
              <p className="mt-1 font-medium text-success-ink">{s.typicalPercent}% less</p>
              <p className="t-secondary mt-2">Instructions, your profile, one skill and one example.</p>
            </div>
            <div>
              <p className="t-secondary">Everything your agent could read</p>
              <p className="mt-1 text-3xl font-semibold tracking-tight">
                {n(s.beforeTokens)} <span aria-hidden>→</span> <span className="sr-only">to</span> {n(s.afterTokens)} <span className="text-base font-normal text-muted">tokens</span>
              </p>
              <p className="mt-1 font-medium text-success-ink">{s.percent}% less</p>
              <p className="t-secondary mt-2">All instructions, profile, processes, skills and notes together.</p>
            </div>
          </div>
          {s.items.length > 0 ? (
            <ul className="mt-6 space-y-1 border-t border-line pt-4">
              {s.items.map((item) => (
                <li key={item.label} className="flex justify-between gap-4">
                  <span>{item.label}</span>
                  <span className="shrink-0 font-medium">−{n(item.tokens)} tokens</span>
                </li>
              ))}
            </ul>
          ) : null}
          {report.typical.monthlyUsd !== null ? (
            <p className="t-secondary mt-5">
              At your usage ({report.typical.runsPerMonth} runs a month) that is about ${report.typical.monthlyUsd < 0.01 ? '<0.01' : report.typical.monthlyUsd.toFixed(2)} a month for the typical task. Token counts are estimates.
            </p>
          ) : null}
        </Card>
      </section>
    </div>
  );
}
