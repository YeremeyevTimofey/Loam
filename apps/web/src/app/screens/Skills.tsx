import {
  applyPlan,
  planAddStarterSkill,
  planDeleteSkill,
  planImportSkill,
  planSyncAgentSkills,
  type ImportResult,
  type Skill,
} from '@loam/core';
import { BookOpen, ClipboardCopy, ClipboardPaste, Eye, FileUp, RefreshCw, ScrollText, ShieldQuestion, Trash2 } from 'lucide-react';
import { useRef, useState } from 'react';
import { ChatCopyDialog, type ChatTarget } from '../components/ChatCopyDialog';
import { AuditDialog, CapabilityBadges, ImportPreviewDialog, ReviewDialog, SOURCE_LABEL, ViewSkillDialog } from '../components/SkillDialogs';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/input';
import { NewTabLink } from '../components/NewTabLink';
import { commitPlan, useApp } from '../context';
import { repoFile } from '../lib/links';
import { STARTER_SKILLS } from '../../starter-skills';

const MAX_FILE = 100_000;

function reviewBadge(s: Skill) {
  if (s.fm.source !== 'imported') return null;
  if (!s.fm.reviewed) return <Badge tone="warning">Not reviewed</Badge>;
  const v = s.fm.review_verdict;
  return <Badge tone={v === 'safe' ? 'success' : v === 'suspicious' ? 'warning' : v === 'unsafe' ? 'danger' : 'neutral'}>Reviewed{v ? `: ${v}` : ''}</Badge>;
}

function SkillCard({ skill, onView, onReview, onCopy }: { skill: Skill; onView: () => void; onReview: () => void; onCopy: () => void }) {
  const { store, today, propose } = useApp();
  const library = skill.kind === 'library';
  return (
    <Card className="appear">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="t-h3 break-words">{skill.name}</h3>
          <p className="mt-1">{skill.fm.description || <span className="t-secondary">No description</span>}</p>
        </div>
      </div>
      <div className="mb-4 flex flex-wrap gap-2">
        <Badge tone={skill.fm.source === 'imported' ? 'warning' : 'neutral'}>{SOURCE_LABEL[skill.fm.source]}</Badge>
        <CapabilityBadges capabilities={skill.fm.capabilities} />
        {reviewBadge(skill)}
        {skill.fm.scanner === 'warn' ? <Badge tone="warning">Scan warning</Badge> : null}
        {!library ? <Badge tone="muted">Built from a process</Badge> : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" onClick={onView}>
          <Eye size={20} aria-hidden /> View
        </Button>
        <Button variant="secondary" onClick={onCopy} aria-label={`Copy ${skill.name} for any chat`}>
          <ClipboardCopy size={20} aria-hidden /> Copy for any chat
        </Button>
        {skill.fm.source === 'imported' && !skill.fm.reviewed ? (
          <Button variant="secondary" onClick={onReview}>
            <ShieldQuestion size={20} aria-hidden /> Ask my agent to review
          </Button>
        ) : null}
        {library ? (
          <Button
            variant="danger"
            aria-label={`Delete ${skill.name}`}
            onClick={async () => propose(await planDeleteSkill(store, skill.name), { title: `Delete “${skill.name}”`, applyLabel: 'Delete', description: 'The skill moves to your history, and the copy for your agent is removed.' })}
          >
            <Trash2 size={20} aria-hidden /> Delete
          </Button>
        ) : null}
      </div>
    </Card>
  );
}

/** Screen 4 (§14.7): the library, the starter pack, safe import, sync to agents, audit log. */
export function SkillsScreen() {
  const { snap, store, today, propose, refresh } = useApp();
  const [viewing, setViewing] = useState<Skill | null>(null);
  const [chat, setChat] = useState<ChatTarget | null>(null);
  const [reviewing, setReviewing] = useState<string | null>(null);
  const [auditOpen, setAuditOpen] = useState(false);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [importing, setImporting] = useState<{ result: ImportResult; content: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);
  if (!snap) return null;

  const library = snap.skills.filter((s) => s.kind === 'library');
  const generated = snap.skills.filter((s) => s.kind === 'process');
  const have = new Set(library.map((s) => s.name));
  const profileText = snap.profile?.raw;

  const analyse = async (content: string, origin: 'file' | 'paste') => {
    setError(null);
    const result = await planImportSkill(store, { content, origin, today });
    // A refusal is recorded in the audit log right away (acceptance 27); nothing else is written.
    if (!result.accepted) {
      await applyPlan(store, result.plan);
      await refresh();
    }
    setImporting({ result, content });
  };

  const readFile = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_FILE) return setError('That file is larger than 100 KB, which is too big for a skill.');
    await analyse(await file.text(), 'file');
  };

  const add = async () => {
    if (!importing?.result.accepted) return;
    setBusy(true);
    try {
      await commitPlan(store, importing.result.plan);
      setImporting(null);
      setMessage(`Added “${importing.result.name}”. Ask your agent to review it when you can.`);
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'The skill could not be added.');
      setImporting(null);
    } finally {
      setBusy(false);
    }
  };

  const sync = async () => {
    setBusy(true);
    setError(null);
    try {
      const plan = await planSyncAgentSkills(store);
      await applyPlan(store, plan);
      setMessage(plan.notes[0] ?? 'Synced.');
      await refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Syncing failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div className="measure !mx-0">
          <h1 className="t-h1">Skills</h1>
          <p className="t-secondary mt-2">Skills tell your agent how to do a kind of task. Add the ones you want; anything from outside is checked first. “Sync to agents” copies them where Claude Code, Cursor, Codex, Gemini CLI, Copilot and other agents look for skills. <NewTabLink inline href={repoFile('docs/ARCHITECTURE.md#skills-and-the-security-model')}>How the safety check works</NewTabLink>.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" onClick={() => void sync()} disabled={busy}>
            <RefreshCw size={20} aria-hidden /> Sync to agents
          </Button>
          <Button variant="secondary" onClick={() => setAuditOpen(true)}>
            <ScrollText size={20} aria-hidden /> View audit log
          </Button>
        </div>
      </div>

      <div aria-live="polite">
        {message ? <p className="mb-4 rounded-md bg-success-soft p-3 text-[15px] text-success-ink">{message}</p> : null}
        {error ? (
          <p role="alert" className="mb-4 rounded-md bg-danger-soft p-3 text-[15px] text-danger">
            {error}
          </p>
        ) : null}
      </div>
      {snap.invalidSkills.length > 0 ? (
        <p role="alert" className="mb-4 rounded-md bg-warning-soft p-3 text-[15px] text-warning-ink">
          {snap.invalidSkills.length} skill file{snap.invalidSkills.length === 1 ? ' is' : 's are'} damaged and ignored: {snap.invalidSkills[0]?.error}
        </p>
      ) : null}

      <section aria-labelledby="mine-h" className="mb-12">
        <h2 id="mine-h" className="t-h2 mb-4">
          Your skills
        </h2>
        {library.length === 0 ? (
          <Card>
            <p>No skills yet. Add some from the starter pack below, or import one you found.</p>
          </Card>
        ) : (
          <div className="grid gap-4 min-[900px]:grid-cols-2">
            {library.map((s) => (
              <SkillCard key={s.path} skill={s} onView={() => setViewing(s)} onReview={() => setReviewing(s.name)} onCopy={() => setChat({ kind: 'skill', name: s.name })} />
            ))}
          </div>
        )}
        {generated.length > 0 ? (
          <details className="mt-6">
            <summary className="min-h-11 cursor-pointer py-2 font-medium">Skills built from your processes ({generated.length})</summary>
            <p className="t-secondary mb-3">Loam builds these itself from each process, its examples and its corrections. Rebuild them from the process page.</p>
            <div className="grid gap-4 min-[900px]:grid-cols-2">
              {generated.map((s) => (
                <SkillCard key={s.path} skill={s} onView={() => setViewing(s)} onReview={() => undefined} onCopy={() => setChat({ kind: 'process', slug: s.name })} />
              ))}
            </div>
          </details>
        ) : null}
      </section>

      <section aria-labelledby="add-h">
        <h2 id="add-h" className="t-h2 mb-4">
          Add skills
        </h2>
        <Card className="mb-4">
          <h3 className="t-h3 mb-1 flex items-center gap-2">
            <BookOpen size={20} aria-hidden /> Starter pack
          </h3>
          <p className="t-secondary mb-4">Skills written and reviewed by us. Each one is added to your folder with one click.</p>
          <ul className="divide-y divide-line">
            {STARTER_SKILLS.map((s) => {
              const desc = /^description:\s*(.+)$/m.exec(s.text)?.[1] ?? '';
              const added = have.has(s.name);
              return (
                <li key={s.name} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium">{s.name}</div>
                    <div className="t-secondary">{desc}</div>
                  </div>
                  <Button
                    variant={added ? 'secondary' : 'primary'}
                    disabled={added || busy}
                    aria-label={added ? `${s.name} is already added` : `Add ${s.name}`}
                    onClick={async () => propose(await planAddStarterSkill(store, s, today), { title: `Add “${s.name}”`, description: 'This starter skill is copied into your skills folder.', applyLabel: 'Add skill' })}
                  >
                    {added ? 'Added' : 'Add'}
                  </Button>
                </li>
              );
            })}
          </ul>
        </Card>
        <Card>
          <h3 className="t-h3 mb-1">Import one you found</h3>
          <p className="t-secondary mb-4">Every imported skill is read by a safety check before it is added. You see the whole text and the result first. Skills that delete files, use the internet, send data out or try to change how your AI behaves are refused.</p>
          <div className="flex flex-wrap gap-2">
            <input ref={fileInput} type="file" accept=".md,text/markdown,text/plain" className="sr-only" tabIndex={-1} aria-hidden onChange={(e) => { void readFile(e.target.files?.[0]); e.target.value = ''; }} />
            <Button variant="secondary" onClick={() => fileInput.current?.click()}>
              <FileUp size={20} aria-hidden /> Import from file
            </Button>
            <Button variant="secondary" onClick={() => setPasteOpen(true)}>
              <ClipboardPaste size={20} aria-hidden /> Paste text
            </Button>
          </div>
        </Card>
      </section>

      <Dialog open={pasteOpen} onOpenChange={setPasteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Paste a skill</DialogTitle>
            <DialogDescription>Paste the whole file, starting with the header between two --- lines.</DialogDescription>
          </DialogHeader>
          <DialogBody className="space-y-1">
            <Label htmlFor="paste">Skill text</Label>
            <Textarea id="paste" value={pasted} onChange={(e) => setPasted(e.target.value)} className="min-h-64" placeholder={'---\nname: my-skill\ndescription: What it does in one line\nlicense: MIT\n---\n\nThe instructions…'} />
          </DialogBody>
          <DialogFooter>
            <Button variant="secondary" onClick={() => setPasteOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={pasted.trim() === ''}
              onClick={async () => {
                setPasteOpen(false);
                await analyse(pasted, 'paste');
              }}
            >
              Check it
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ImportPreviewDialog result={importing?.result ?? null} content={importing?.content ?? ''} onClose={() => setImporting(null)} onAdd={() => void add()} busy={busy} />
      <ViewSkillDialog skill={viewing} onClose={() => setViewing(null)} profileText={profileText} />
      <ReviewDialog name={reviewing} onClose={() => setReviewing(null)} />
      <ChatCopyDialog target={chat} onClose={() => setChat(null)} />
      <AuditDialog open={auditOpen} onOpenChange={setAuditOpen} entries={snap.audit} />
    </div>
  );
}
