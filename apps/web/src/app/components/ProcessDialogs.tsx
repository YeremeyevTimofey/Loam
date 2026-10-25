import {
  AUTOMATIONS,
  FREQUENCIES,
  AUTOMATION_LABEL,
  FREQUENCY_LABEL,
  planAddExample,
  planUpdateProcessMeta,
  walk,
  type ProcessInfo,
} from '@loam/core';
import { useEffect, useState } from 'react';
import { useApp } from '../context';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Textarea } from './ui/input';
import { Label } from './ui/label';
import { cn } from '../lib/cn';

const MAX_UPLOAD = 200_000;

/** Add an example (§12B): paste text or load a text file, mark it good or bad. Saved exactly as given. */
export function AddExampleDialog({ proc, open, onOpenChange }: { proc: ProcessInfo; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { store, today, propose } = useApp();
  const [text, setText] = useState('');
  const [kind, setKind] = useState<'good' | 'bad'>('good');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setText('');
      setKind('good');
      setError(null);
    }
  }, [open]);

  const load = async (file: File | undefined) => {
    if (!file) return;
    setError(null);
    if (file.size > MAX_UPLOAD) return setError('That file is larger than 200 KB. Paste the part that matters instead.');
    const content = await file.text();
    if (content.includes('\u0000')) return setError('That looks like a Word, PDF or image file. Loam reads text files only: copy the text and paste it here.');
    setText(content);
  };

  const save = async () => {
    try {
      const { plan } = await planAddExample(store, { slug: proc.slug, content: text, kind, today });
      onOpenChange(false);
      await propose(plan, { title: `Add an example to “${proc.fm.title}”`, description: 'The example is saved exactly as you gave it and is never edited afterwards.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The example could not be added.');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add an example</DialogTitle>
          <DialogDescription>Show your agent what a finished result looks like. It will match its structure and tone.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <fieldset className="flex flex-wrap gap-2">
            <legend className="mb-1 block text-[15px] font-medium">This example is</legend>
            {(['good', 'bad'] as const).map((k) => (
              <label
                key={k}
                className={cn('inline-flex h-11 cursor-pointer items-center gap-2 rounded-md border px-4', kind === k ? 'border-accent-ink bg-accent-soft text-accent-ink' : 'border-line')}
              >
                <input type="radio" name="kind" value={k} checked={kind === k} onChange={() => setKind(k)} className="accent-[var(--accent-ink)]" />
                {k === 'good' ? 'A good one to copy' : 'One to avoid'}
              </label>
            ))}
          </fieldset>
          <div className="space-y-1">
            <Label htmlFor="ex-text">Paste the text</Label>
            <Textarea id="ex-text" value={text} onChange={(e) => setText(e.target.value)} className="min-h-56" placeholder="Paste a finished report, email or document here" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="ex-file">…or load a text file</Label>
            <Input id="ex-file" type="file" accept=".md,.txt,.csv,.json,.html,.eml,text/*" onChange={(e) => void load(e.target.files?.[0])} className="py-2" />
            <p className="t-secondary">Text files only (.md, .txt, .csv). For Word or PDF files, copy the text and paste it above.</p>
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-[15px] text-danger">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={text.trim() === ''}>
            Review and save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Frequency, minutes, automation and runs per year: the numbers behind the hours estimate. */
export function EditDetailsDialog({ proc, open, onOpenChange }: { proc: ProcessInfo; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { store, today, propose } = useApp();
  const [form, setForm] = useState({ title: '', frequency: 'weekly' as ProcessInfo['fm']['frequency'], minutes: '', automation: 'ready' as ProcessInfo['fm']['automation'], perYear: '' });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setForm({ title: proc.fm.title, frequency: proc.fm.frequency, minutes: String(proc.fm.minutes_per_run), automation: proc.fm.automation, perYear: proc.fm.runs_per_year === undefined ? '' : String(proc.fm.runs_per_year) });
  }, [open, proc]);

  const save = async () => {
    const minutes = Number(form.minutes);
    if (!form.title.trim()) return setError('Give the process a name.');
    if (!Number.isFinite(minutes) || minutes <= 0) return setError('Minutes per run must be a number above zero.');
    const perYear = form.perYear.trim() === '' ? undefined : Number(form.perYear);
    if (perYear !== undefined && (!Number.isFinite(perYear) || perYear < 0)) return setError('Runs per year must be a number.');
    const plan = await planUpdateProcessMeta(store, {
      slug: proc.slug,
      patch: { title: form.title.trim(), frequency: form.frequency, minutes_per_run: minutes, automation: form.automation, runs_per_year: perYear },
      today,
    });
    onOpenChange(false);
    await propose(plan, { title: `Edit “${proc.fm.title}”` });
  };

  const select = 'h-11 w-full rounded-md border border-line bg-surface px-3 text-base text-ink focus-visible:border-accent-ink';
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit the numbers</DialogTitle>
          <DialogDescription>Hours a year = minutes per run × runs per year ÷ 60.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="space-y-1">
            <Label htmlFor="d-title">Name</Label>
            <Input id="d-title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} />
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="d-freq">How often</Label>
              <select id="d-freq" className={select} value={form.frequency} onChange={(e) => setForm({ ...form, frequency: e.target.value as typeof form.frequency })}>
                {FREQUENCIES.map((f) => (
                  <option key={f} value={f}>
                    {FREQUENCY_LABEL[f]}
                  </option>
                ))}
              </select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="d-min">Minutes per run</Label>
              <Input id="d-min" inputMode="numeric" value={form.minutes} onChange={(e) => setForm({ ...form, minutes: e.target.value })} />
            </div>
            <div className="space-y-1">
              <Label htmlFor="d-auto">Can it be automated?</Label>
              <select id="d-auto" className={select} value={form.automation} onChange={(e) => setForm({ ...form, automation: e.target.value as typeof form.automation })}>
                {AUTOMATIONS.map((a) => (
                  <option key={a} value={a}>
                    {AUTOMATION_LABEL[a]}
                  </option>
                ))}
              </select>
            </div>
            {form.frequency === 'ad-hoc' ? (
              <div className="space-y-1">
                <Label htmlFor="d-year">Times a year (your estimate)</Label>
                <Input id="d-year" inputMode="numeric" value={form.perYear} onChange={(e) => setForm({ ...form, perYear: e.target.value })} />
              </div>
            ) : null}
          </div>
          {error ? (
            <p role="alert" className="rounded-md bg-danger-soft p-3 text-[15px] text-danger">
              {error}
            </p>
          ) : null}
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={() => void save()}>Review changes</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** "View files": what is in this process's folder, read-only. */
export function ViewFilesDialog({ slug, open, onOpenChange }: { slug: string; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { store } = useApp();
  const [files, setFiles] = useState<string[] | null>(null);
  const [selected, setSelected] = useState<{ path: string; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setSelected(null);
    void walk(store, `processes/${slug}`).then((list) => setFiles(list.map((f) => f.path)));
  }, [open, slug, store]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Files for this process</DialogTitle>
          <DialogDescription>These are plain files in your folder. Look, but change them in the app so every edit is kept in history.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {files === null ? (
            <p className="t-secondary">Reading…</p>
          ) : (
            <div className="grid gap-4 md:grid-cols-[minmax(0,16rem)_1fr]">
              <ul className="space-y-1">
                {files.map((path) => (
                  <li key={path}>
                    <button
                      type="button"
                      onClick={async () => setSelected({ path, text: await store.readFile(path) })}
                      aria-current={selected?.path === path}
                      className={cn('min-h-11 w-full break-all rounded-md px-3 py-2 text-left text-[15px] hover:bg-bg', selected?.path === path && 'bg-accent-soft text-accent-ink')}
                    >
                      {path.replace(`processes/${slug}/`, '')}
                    </button>
                  </li>
                ))}
              </ul>
              <div className="min-w-0">
                {selected ? (
                  <pre className="max-h-[60dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg p-3">{selected.text}</pre>
                ) : (
                  <p className="t-secondary">Pick a file to read it.</p>
                )}
              </div>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
