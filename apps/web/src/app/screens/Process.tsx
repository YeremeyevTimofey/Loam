import {
  AUTOMATION_LABEL,
  FREQUENCY_LABEL,
  planDeleteCorrection,
  planDeleteExample,
  planGenerateProcessSkill,
  planUpdateSection,
  SECTION_HEADINGS,
  SECTION_KEYS,
  type ProcessInfo,
  type SectionKey,
  getSection,
} from '@loam/core';
import { ArrowLeft, Eye, FilePlus, FolderTree, Pencil, RefreshCw, SlidersHorizontal, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { CopyField } from '../components/CopyField';
import { AddExampleDialog, EditDetailsDialog, ViewFilesDialog } from '../components/ProcessDialogs';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Textarea } from '../components/ui/input';
import { useApp } from '../context';
import { runCommand } from '../lib/links';
import { hoursText } from './Overview';

const AUTOMATION_TONE = { ready: 'success', 'needs-access': 'warning', 'manual-only': 'muted' } as const;
const longDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

const HINT: Record<SectionKey, string> = {
  what: 'Two or three sentences: what the work is and who it is for.',
  steps: 'One step per line, in order.',
  good: 'How you can tell it came out right.',
  constraints: 'What must never happen.',
  takes: 'What automating it needs: access, a human check, the risk of a mistake.',
};

function SectionEditor({ proc, sectionKey }: { proc: ProcessInfo; sectionKey: SectionKey }) {
  const { store, today, propose } = useApp();
  const text = getSection(proc.doc, sectionKey);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(text);

  const save = async () => {
    const plan = await planUpdateSection(store, { slug: proc.slug, key: sectionKey, text: draft, today });
    setEditing(false);
    await propose(plan, { title: `Edit “${SECTION_HEADINGS[sectionKey]}”` });
  };

  return (
    <Card>
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="t-h3">{SECTION_HEADINGS[sectionKey]}</h3>
        {!editing ? (
          <Button
            variant="ghost"
            onClick={() => {
              setDraft(text);
              setEditing(true);
            }}
            aria-label={`Edit ${SECTION_HEADINGS[sectionKey]}`}
          >
            <Pencil size={20} aria-hidden /> Edit
          </Button>
        ) : null}
      </div>
      {editing ? (
        <div className="space-y-3">
          <Textarea value={draft} onChange={(e) => setDraft(e.target.value)} aria-label={SECTION_HEADINGS[sectionKey]} className="min-h-40" />
          <p className="t-secondary">{HINT[sectionKey]}</p>
          <div className="flex gap-2">
            <Button onClick={() => void save()}>Review changes</Button>
            <Button variant="secondary" onClick={() => setEditing(false)}>
              Cancel
            </Button>
          </div>
        </div>
      ) : text ? (
        <p className="whitespace-pre-wrap">{text}</p>
      ) : (
        <p className="t-secondary">Nothing here yet. {HINT[sectionKey]}</p>
      )}
    </Card>
  );
}

/** Screen 3 (§12B): one process: description by section, examples, corrections, and the line to say to your agent. */
export function ProcessScreen({ slug }: { slug: string }) {
  const { snap, store, today, go, propose } = useApp();
  const [adding, setAdding] = useState(false);
  const [details, setDetails] = useState(false);
  const [files, setFiles] = useState(false);
  const [viewing, setViewing] = useState<{ name: string; text: string } | null>(null);
  const proc = snap?.processes.find((p) => p.slug === slug);

  if (!proc) {
    return (
      <div className="measure">
        <Button variant="ghost" onClick={() => go({ screen: 'overview' })} className="mb-4 -ml-2">
          <ArrowLeft size={20} aria-hidden /> All processes
        </Button>
        <h1 className="t-h1 mb-3">That process isn’t here</h1>
        <p>There is no process called “{slug}” in this folder. It may have been renamed or removed, or the folder hasn’t been refreshed.</p>
      </div>
    );
  }

  const extra = proc.doc.sections.filter((s) => !SECTION_KEYS.some((k) => SECTION_HEADINGS[k].toLowerCase() === s.heading.toLowerCase()));

  const rebuild = async () => {
    const plan = await planGenerateProcessSkill(store, slug, today);
    if (plan.changes.length === 0) return;
    await propose(plan, { title: 'Rebuild the skill for this process', description: 'The skill is built from this description, your examples and every correction, newest first.' });
  };

  return (
    <div>
      <Button variant="ghost" onClick={() => go({ screen: 'overview' })} className="mb-4 -ml-2">
        <ArrowLeft size={20} aria-hidden /> All processes
      </Button>

      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="t-h1">{proc.fm.title}</h1>
          <div className="mt-3 flex flex-wrap gap-2">
            <Badge tone={AUTOMATION_TONE[proc.fm.automation]}>{AUTOMATION_LABEL[proc.fm.automation]}</Badge>
            {proc.stable ? <Badge tone="success">Stable</Badge> : null}
            <Badge tone="muted">{FREQUENCY_LABEL[proc.fm.frequency]}</Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => setDetails(true)}>
            <SlidersHorizontal size={20} aria-hidden /> Edit numbers
          </Button>
          <Button variant="secondary" onClick={() => setFiles(true)}>
            <FolderTree size={20} aria-hidden /> View files
          </Button>
        </div>
      </div>

      <Card className="mb-6">
        <p className="mb-2 font-medium">To run it, tell your agent:</p>
        <CopyField text={runCommand(proc.fm.title)} />
        <dl className="mt-5 grid grid-cols-2 gap-x-4 gap-y-3 md:grid-cols-4">
          {[
            ['Time per run', `${proc.fm.minutes_per_run} min`],
            ['Hours a year', proc.hours === null ? 'not estimated' : String(proc.hours)],
            ['Runs so far', String(proc.fm.runs)],
            ['Corrections', `${proc.fm.corrections}${proc.lastCorrection ? ` · last ${longDate(proc.lastCorrection)}` : ''}`],
          ].map(([label, value]) => (
            <div key={label}>
              <dt className="t-secondary">{label}</dt>
              <dd className="font-medium">{value}</dd>
            </div>
          ))}
        </dl>
        {proc.fm.frequency === 'ad-hoc' && proc.fm.runs_per_year === undefined ? (
          <p className="t-secondary mt-3">This one happens irregularly. Add how many times a year it happens (Edit numbers) to see hours a year. {hoursText(proc.hours)}.</p>
        ) : null}
      </Card>

      <div className="mb-10 space-y-4">
        {SECTION_KEYS.map((key) => (
          <SectionEditor key={`${proc.slug}-${key}-${proc.fm.updated}`} proc={proc} sectionKey={key} />
        ))}
        {extra.length > 0 ? (
          <Card>
            <details>
              <summary className="min-h-11 cursor-pointer py-2 font-medium">Other text saved in this file ({extra.length} section{extra.length === 1 ? '' : 's'})</summary>
              <div className="mt-2 space-y-4">
                {extra.map((s) => (
                  <div key={s.heading}>
                    <h4 className="font-medium">{s.heading}</h4>
                    <p className="t-secondary whitespace-pre-wrap">{s.body}</p>
                  </div>
                ))}
              </div>
            </details>
          </Card>
        ) : null}
      </div>

      <section className="mb-10" aria-labelledby="examples-h">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h2 id="examples-h" className="t-h2">
            Examples
          </h2>
          <Button onClick={() => setAdding(true)}>
            <FilePlus size={20} aria-hidden /> Add example
          </Button>
        </div>
        {proc.examples.length === 0 ? (
          <Card>
            <p>No examples yet. Add one real finished result, and your agent will match its structure and tone.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {proc.examples.map((ex) => (
              <li key={ex.path}>
                <Card className="flex flex-wrap items-center justify-between gap-3 p-4">
                  <div className="flex min-w-0 items-center gap-3">
                    <Badge tone={ex.kind === 'good' ? 'success' : 'danger'}>{ex.kind === 'good' ? 'Good' : 'Avoid'}</Badge>
                    <span className="break-all font-medium">{ex.name}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="secondary" onClick={async () => setViewing({ name: ex.name, text: await store.readFile(ex.path) })}>
                      <Eye size={20} aria-hidden /> View
                    </Button>
                    <Button
                      variant="danger"
                      aria-label={`Delete ${ex.name}`}
                      onClick={async () => propose(await planDeleteExample(store, slug, ex.name, today), { title: `Delete ${ex.name}`, applyLabel: 'Delete', description: 'The example moves to your history, so you can bring it back.' })}
                    >
                      <Trash2 size={20} aria-hidden /> Delete
                    </Button>
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="mb-10" aria-labelledby="corr-h">
        <h2 id="corr-h" className="t-h2 mb-1">
          Corrections
        </h2>
        <p className="t-secondary mb-4">When a result needs a change, tell your agent “Remember this correction”. It lands here and overrides everything else from then on.</p>
        {proc.corrections.length === 0 ? (
          <Card>
            <p>No corrections yet. After a run, tell your agent what to change and it will remember.</p>
          </Card>
        ) : (
          <ul className="space-y-3">
            {proc.corrections.map((c, i) => (
              <li key={`${c.date}-${i}`}>
                <Card className="p-4">
                  <div className="mb-1 flex flex-wrap items-center justify-between gap-2">
                    <span className="t-secondary">
                      {longDate(c.date)}
                      {c.run !== null ? ` · after run ${c.run}` : ''}
                    </span>
                    <Button
                      variant="ghost"
                      aria-label={`Delete the correction from ${longDate(c.date)}`}
                      onClick={async () => propose(await planDeleteCorrection(store, slug, i, today), { title: 'Delete a correction', applyLabel: 'Delete', description: 'Do this when a correction no longer applies. It moves to your history.' })}
                    >
                      <Trash2 size={20} aria-hidden /> Remove
                    </Button>
                  </div>
                  <p className="whitespace-pre-wrap">{c.note}</p>
                  {c.was || c.should ? (
                    <dl className="t-secondary mt-2 space-y-1">
                      {c.was ? (
                        <div>
                          <dt className="inline font-medium">Was: </dt>
                          <dd className="inline">{c.was}</dd>
                        </div>
                      ) : null}
                      {c.should ? (
                        <div>
                          <dt className="inline font-medium">Should be: </dt>
                          <dd className="inline">{c.should}</dd>
                        </div>
                      ) : null}
                    </dl>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </section>

      <section aria-labelledby="skill-h">
        <h2 id="skill-h" className="t-h2 mb-4">
          Skill for this process
        </h2>
        <Card className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-medium">
              {!proc.hasSkill ? 'No skill built yet' : proc.skillStale ? 'The skill is out of date' : 'The skill is up to date'}
            </p>
            <p className="t-secondary">
              {proc.skillStale
                ? 'Examples or corrections changed since it was built. Your agent still reads the corrections directly, so nothing is lost; rebuilding folds them into the skill.'
                : 'Your agent follows this skill whenever you ask it to do this process.'}
            </p>
          </div>
          <Button variant={proc.skillStale || !proc.hasSkill ? 'primary' : 'secondary'} onClick={() => void rebuild()}>
            <RefreshCw size={20} aria-hidden /> {proc.hasSkill ? 'Rebuild skill' : 'Build skill'}
          </Button>
        </Card>
      </section>

      <AddExampleDialog proc={proc} open={adding} onOpenChange={setAdding} />
      <EditDetailsDialog proc={proc} open={details} onOpenChange={setDetails} />
      <ViewFilesDialog slug={slug} open={files} onOpenChange={setFiles} />
      <Dialog open={viewing !== null} onOpenChange={(o) => !o && setViewing(null)}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>{viewing?.name}</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <pre className="whitespace-pre-wrap break-words">{viewing?.text}</pre>
          </DialogBody>
        </DialogContent>
      </Dialog>
    </div>
  );
}
