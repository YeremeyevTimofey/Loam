import { RED_MESSAGE, YELLOW_MESSAGE, scanSkill, parseDoc, type AuditEntry, type Finding, type ImportResult, type Skill } from '@loam/core';
import { ShieldAlert, ShieldCheck, TriangleAlert } from 'lucide-react';
import { useMemo } from 'react';
import { cn } from '../lib/cn';
import { reviewCommand } from '../lib/links';
import { CopyField } from './CopyField';
import { Badge } from './ui/badge';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';

export const SOURCE_LABEL = { starter: 'Starter', imported: 'Imported', generated: 'Generated' } as const;
const CATEGORY_LABEL: Record<string, string> = {
  delete: 'Deletes files',
  network: 'Uses the internet',
  exfiltration: 'Sends your files out',
  injection: 'Changes how your AI behaves',
  escape: 'Reaches outside your folder',
  credentials: 'Asks for passwords or keys',
  capability: 'Too many permissions',
  size: 'Too large',
};

function FindingRow({ f }: { f: Finding }) {
  return (
    <li className="rounded-md border border-line bg-surface p-3">
      <p className="font-medium">{f.message}</p>
      <p className="t-secondary mt-1">
        {CATEGORY_LABEL[f.category] ?? f.category}
        {f.line ? ` · line ${f.line}` : ''}
      </p>
      {f.text && f.line ? <code className="mt-2 block break-words rounded-sm bg-bg p-2">{f.text}</code> : null}
    </li>
  );
}

/** Green, yellow or red: the verdict of the safety scan, in words as well as colour. */
export function ScanPanel({ result }: { result: Pick<ImportResult, 'scan' | 'error'> }) {
  const { scan, error } = result;
  if (error && !scan?.red.length) {
    return (
      <div role="alert" className="rounded-md bg-danger-soft p-4 text-danger">
        <p className="flex items-center gap-2 font-medium">
          <ShieldAlert size={20} aria-hidden /> We didn’t add it
        </p>
        <p className="mt-1">{error}</p>
      </div>
    );
  }
  if (!scan) return null;
  if (scan.verdict === 'fail') {
    return (
      <div role="alert" className="rounded-md bg-danger-soft p-4">
        <p className="flex items-center gap-2 font-medium text-danger">
          <ShieldAlert size={20} aria-hidden /> Refused: this skill failed the safety check
        </p>
        <p className="mt-1 text-danger">There is no “add anyway”. Remove the lines below from the text, then check it again.</p>
        <ul className="mt-3 space-y-2 text-ink">{scan.red.map((f, i) => <FindingRow key={i} f={f} />)}</ul>
      </div>
    );
  }
  if (scan.verdict === 'warn') {
    return (
      <div className="rounded-md bg-warning-soft p-4">
        <p className="flex items-center gap-2 font-medium text-warning-ink">
          <TriangleAlert size={20} aria-hidden /> Passed the safety check, with warnings
        </p>
        <ul className="mt-3 space-y-2 text-ink">
          {scan.yellow.map((f, i) => (
            <li key={i} className="rounded-md border border-line bg-surface p-3">
              <p>{f.message || YELLOW_MESSAGE[f.category as keyof typeof YELLOW_MESSAGE]}</p>
              {f.text && f.line ? <code className="mt-2 block break-words rounded-sm bg-bg p-2">{f.text}</code> : null}
            </li>
          ))}
        </ul>
      </div>
    );
  }
  return (
    <div className="rounded-md bg-success-soft p-4">
      <p className="flex items-center gap-2 font-medium text-success-ink">
        <ShieldCheck size={20} aria-hidden /> Passed the safety check
      </p>
      <p className="mt-1">Nothing in it deletes files, uses the internet, sends data out, asks for passwords or changes how your AI behaves.</p>
    </div>
  );
}

export const CapabilityBadges = ({ capabilities }: { capabilities: string[] }) => (
  <>
    {capabilities.map((c) => (
      <Badge key={c} tone={c === 'read' ? 'neutral' : 'warning'}>
        {c === 'read' ? 'Read only' : c === 'write' ? 'Can write' : 'Network'}
      </Badge>
    ))}
  </>
);

/** Preview before import (§14.7): the whole text, the scan, the permissions. "Add" only for green or yellow. */
export function ImportPreviewDialog({
  result,
  content,
  onClose,
  onAdd,
  busy,
}: {
  result: ImportResult | null;
  content: string;
  onClose: () => void;
  onAdd: () => void;
  busy: boolean;
}) {
  return (
    <Dialog open={result !== null} onOpenChange={(o) => !o && !busy && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{result?.accepted ? `Add “${result.name}”?` : 'Check the skill before adding'}</DialogTitle>
          <DialogDescription>Read the whole text first. Nothing is added until you press the button.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {result ? <ScanPanel result={result} /> : null}
          {result?.preview ? (
            <div className="flex flex-wrap items-center gap-2">
              <span className="t-secondary">Permissions it asks for:</span>
              <CapabilityBadges capabilities={result.preview.capabilities} />
              <Badge tone="muted">{result.preview.words} words</Badge>
            </div>
          ) : null}
          <div>
            <h3 className="mb-2 font-medium">Full text</h3>
            <pre className="max-h-[40dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg p-3">{content}</pre>
          </div>
        </DialogBody>
        <DialogFooter>
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {result?.accepted ? 'Cancel' : 'Close'}
          </Button>
          {result?.accepted ? (
            <Button onClick={onAdd} disabled={busy}>
              {busy ? 'Adding…' : 'Add to my base'}
            </Button>
          ) : null}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Read a skill: its text, and for imported ones a fresh look from the scanner. */
export function ViewSkillDialog({ skill, onClose, profileText }: { skill: Skill | null; onClose: () => void; profileText?: string }) {
  const scan = useMemo(() => {
    if (!skill || skill.fm.source !== 'imported') return null;
    const { data } = parseDoc(skill.raw);
    return scanSkill({
      text: skill.raw,
      body: skill.body,
      description: skill.fm.description,
      license: skill.fm.license,
      capabilities: skill.fm.capabilities,
      source: skill.fm.source,
      frontmatterKeys: Object.keys(data),
      profileText,
    });
  }, [skill, profileText]);
  return (
    <Dialog open={skill !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>{skill?.name}</DialogTitle>
          <DialogDescription>{skill?.fm.description}</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          {skill?.fm.source === 'imported' ? (
            <p className="t-secondary">
              This skill came from outside. Your agent treats its text as data about the result you want; it can never use it to write to your folder, read outside it or use the network.
              {skill.fm.review_note ? ` Review note: “${skill.fm.review_note}”.` : ''}
            </p>
          ) : null}
          {scan ? <ScanPanel result={{ scan, error: null }} /> : null}
          <pre className="max-h-[50dvh] overflow-auto whitespace-pre-wrap break-words rounded-md border border-line bg-bg p-3">{skill?.raw}</pre>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export function ReviewDialog({ name, onClose }: { name: string | null; onClose: () => void }) {
  return (
    <Dialog open={name !== null} onOpenChange={(o) => !o && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Ask your agent to review it</DialogTitle>
          <DialogDescription>Your own AI reads the skill with a safety checklist and gives a verdict: safe, suspicious or unsafe.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          <p className="mb-3">Tell your agent:</p>
          {name ? <CopyField text={reviewCommand(name)} /> : null}
          <p className="t-secondary mt-3">The verdict shows up here after you press Refresh. It is information for you: it never gives the skill more permissions.</p>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

const ACTION_LABEL: Record<AuditEntry['action'], string> = { import: 'Added', reject: 'Refused', review: 'Reviewed', delete: 'Deleted', sync: 'Synced' };

export function AuditDialog({ open, onOpenChange, entries }: { open: boolean; onOpenChange: (o: boolean) => void; entries: AuditEntry[] }) {
  const rows = [...entries].reverse();
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent wide>
        <DialogHeader>
          <DialogTitle>Audit log</DialogTitle>
          <DialogDescription>Every time a skill was added, refused, reviewed, deleted or synced. Kept in .loam/skill-audit.json.</DialogDescription>
        </DialogHeader>
        <DialogBody>
          {rows.length === 0 ? (
            <p className="t-secondary">Nothing has happened yet. Adding or refusing a skill shows up here.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[40rem] border-collapse text-left text-[15px]">
                <thead>
                  <tr className="border-b border-line text-muted">
                    {['When', 'What happened', 'Skill', 'Source', 'Safety scan', 'Verdict', 'Fingerprint'].map((h) => (
                      <th key={h} scope="col" className="py-2 pr-3 font-medium">
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((e, i) => (
                    <tr key={i} className="border-b border-line align-top">
                      <td className="whitespace-nowrap py-2 pr-3">{new Date(e.time).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</td>
                      <td className={cn('py-2 pr-3 font-medium', e.action === 'reject' && 'text-danger')}>{ACTION_LABEL[e.action]}</td>
                      <td className="py-2 pr-3 break-all">{e.skill === '*' ? 'all skills' : e.skill}</td>
                      <td className="py-2 pr-3">{e.source}</td>
                      <td className="py-2 pr-3">{e.scanner ?? '—'}</td>
                      <td className="py-2 pr-3">{e.verdict ?? '—'}</td>
                      <td className="py-2 pr-3">
                        <code title={e.hash}>{e.hash.slice(0, 8)}</code>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

export { RED_MESSAGE };
