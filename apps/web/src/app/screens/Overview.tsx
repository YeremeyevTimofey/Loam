import { AUTOMATION_LABEL, FREQUENCY_LABEL, planUpdateInterviewScript, type ProcessInfo } from '@loam/core';
import { Pencil, PlugZap, RotateCcw, ShieldCheck, Stethoscope } from 'lucide-react';
import { useState } from 'react';
import { ConnectAgent } from '../components/ConnectAgent';
import { CopyField } from '../components/CopyField';
import { ProfileEditDialog } from '../components/ProfileEditDialog';
import { Badge } from '../components/ui/badge';
import { Button } from '../components/ui/button';
import { Card } from '../components/ui/card';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { useApp } from '../context';
import { INTERVIEW_COMMAND } from '../lib/links';
import { routeUrl } from '../nav';

const AUTOMATION_TONE = { ready: 'success', 'needs-access': 'warning', 'manual-only': 'muted' } as const;
const shortDate = (iso: string) => new Date(`${iso}T00:00:00`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' });
export const hoursText = (h: number | null) => (h === null ? 'hours a year not estimated' : `${h} h a year`);

export function ProcessCard({ p }: { p: ProcessInfo }) {
  const { go } = useApp();
  const route = { screen: 'process', process: p.slug } as const;
  return (
    <a
      href={routeUrl(route)}
      onClick={(e) => {
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        go(route);
      }}
      className="appear block rounded-lg border border-line bg-surface p-4 text-ink no-underline transition-colors duration-150 hover:border-soil hover:no-underline md:p-6"
    >
      <div className="mb-1 flex items-start justify-between gap-3">
        <h3 className="t-h3">{p.fm.title}</h3>
        {p.stable ? <Badge tone="success">Stable</Badge> : null}
      </div>
      <p className="t-secondary mb-4">
        {FREQUENCY_LABEL[p.fm.frequency]} · {p.fm.minutes_per_run} min a run · {hoursText(p.hours)}
      </p>
      <div className="flex flex-wrap gap-2">
        <Badge tone={AUTOMATION_TONE[p.fm.automation]}>{AUTOMATION_LABEL[p.fm.automation]}</Badge>
        <Badge tone="muted">
          {p.fm.runs} run{p.fm.runs === 1 ? '' : 's'}
        </Badge>
        <Badge tone="muted">
          {p.fm.corrections} correction{p.fm.corrections === 1 ? '' : 's'}
        </Badge>
        {p.examples.length === 0 && p.fm.automation !== 'manual-only' ? <Badge tone="warning">No example yet</Badge> : null}
      </div>
      {p.lastCorrection ? <p className="t-secondary mt-3">Last correction {shortDate(p.lastCorrection)}</p> : null}
    </a>
  );
}

/** Screen 2 (§12B): who you are, what your processes are worth, and how to connect the agent. */
export function OverviewScreen() {
  const { snap, go, store, propose } = useApp();
  const [editing, setEditing] = useState(false);
  const [redo, setRedo] = useState(false);
  const [scriptNote, setScriptNote] = useState<string | null>(null);
  const [connectOpen, setConnectOpen] = useState(false);

  // §8.1: the interview script lives in the folder; this replaces it with the version that ships with the app.
  const updateScript = async () => {
    const plan = await planUpdateInterviewScript(store);
    if (plan.changes.length === 0) {
      setScriptNote('Your interview script is already the latest version.');
      return;
    }
    setScriptNote(null);
    setRedo(false);
    await propose(plan, { title: 'Update the interview script', description: 'This replaces the questions your agent asks with the latest version. The old script is kept in your history.' });
  };
  if (!snap) return null;
  const { profile, processes } = snap;
  const interviewDone = snap.state?.interview.status === 'complete' && processes.length > 0;
  const ready = processes.filter((p) => p.fm.automation === 'ready');
  const readyHours = Math.round(ready.reduce((sum, p) => sum + (p.hours ?? 0), 0));

  return (
    <div>
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="t-h1">{profile && !profile.empty && profile.fm.name ? `${profile.fm.name.split(' ')[0]}’s knowledge base` : 'Your knowledge base'}</h1>
          {store.mode === 'demo' ? (
            <p className="t-secondary mt-2 max-w-[720px]">
              A fictional example: Sarah is an account manager at a 20-person agency. Open a process to see how examples and corrections work, Skills for the safety check, or Check health for what a tidier base saves.
            </p>
          ) : null}
          {ready.length > 0 ? (
            <p className="t-secondary mt-2">
              {ready.length} {ready.length === 1 ? 'process is' : 'processes are'} ready to automate, about {readyHours} hours a year of your time.
            </p>
          ) : null}
        </div>
        <div className="flex flex-wrap gap-2">
          {store.mode === 'fs' ? (
            <Button variant="secondary" onClick={() => setConnectOpen(true)}>
              <PlugZap size={20} aria-hidden /> Connect an agent
            </Button>
          ) : null}
          <Button variant="secondary" onClick={() => go({ screen: 'skills' })}>
            <ShieldCheck size={20} aria-hidden /> Skills
          </Button>
          <Button variant="secondary" onClick={() => go({ screen: 'health' })}>
            <Stethoscope size={20} aria-hidden /> Check health
          </Button>
        </div>
      </div>

      {snap.invalidProcesses.length > 0 ? (
        <p role="alert" className="mb-6 rounded-md bg-warning-soft p-3 text-[15px] text-warning-ink">
          {snap.invalidProcesses.length} process file{snap.invalidProcesses.length === 1 ? ' cannot' : 's cannot'} be read and {snap.invalidProcesses.length === 1 ? 'is' : 'are'} left out: {snap.invalidProcesses[0]?.error}
        </p>
      ) : null}

      <Card className="mb-8">
        {profile && !profile.empty ? (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0">
              <h2 className="t-h3">{profile.fm.name || 'Your profile'}</h2>
              <p className="mt-1">
                {[profile.fm.role, profile.fm.company].filter(Boolean).join(' at ') || 'Role not set'}
                {profile.fm.industry ? <span className="t-secondary"> · {profile.fm.industry}</span> : null}
              </p>
              {profile.fm.tools.length > 0 ? (
                <p className="mt-3 flex flex-wrap items-center gap-2">
                  <span className="t-secondary">Tools:</span>
                  {profile.fm.tools.map((tool) => (
                    <Badge key={tool}>{tool}</Badge>
                  ))}
                </p>
              ) : null}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => setEditing(true)}>
                <Pencil size={20} aria-hidden /> Edit
              </Button>
              <Button variant="secondary" onClick={() => setRedo(true)}>
                <RotateCcw size={20} aria-hidden /> Redo interview
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="t-h3">Your profile is empty</h2>
              <p className="t-secondary mt-1">Connect your agent and run the interview: it fills in your role, tools and processes for you.</p>
            </div>
            <Button variant="secondary" onClick={() => setEditing(true)}>
              <Pencil size={20} aria-hidden /> Fill in by hand
            </Button>
          </div>
        )}
      </Card>

      {!interviewDone && snap.state !== null && processes.length === 0 ? <ConnectAgent /> : null}

      <section aria-labelledby="processes-h">
        <h2 id="processes-h" className="t-h2 mb-4">
          Your processes
        </h2>
        {processes.length === 0 ? (
          <Card>
            <p>No processes yet. Run the interview with your agent, then press Refresh and they appear here with hours per year.</p>
          </Card>
        ) : (
          <div className="grid gap-4 min-[900px]:grid-cols-2">
            {processes.map((p) => (
              <ProcessCard key={p.slug} p={p} />
            ))}
          </div>
        )}
        {processes.length > 0 && !interviewDone ? <p className="t-secondary mt-4">The interview isn’t marked complete yet. You can finish it with your agent any time.</p> : null}
      </section>

      {processes.length > 0 && !interviewDone ? <div className="mt-8"><ConnectAgent /></div> : null}

      <ProfileEditDialog profile={profile} open={editing} onOpenChange={setEditing} />
      <Dialog open={connectOpen} onOpenChange={setConnectOpen}>
        <DialogContent wide>
          <DialogHeader>
            <DialogTitle>Connect an agent</DialogTitle>
            <DialogDescription>You can connect more than one. Each reads the same folder.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <ConnectAgent className="border-0 p-0 md:p-0" />
          </DialogBody>
        </DialogContent>
      </Dialog>
      <Dialog open={redo} onOpenChange={(o) => { setRedo(o); if (!o) setScriptNote(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Redo the interview</DialogTitle>
            <DialogDescription>Your agent asks the questions again and updates your profile and processes.</DialogDescription>
          </DialogHeader>
          <DialogBody>
            <p className="mb-3">Examples, corrections and run counts of processes you already have are kept. Tell your agent:</p>
            <CopyField text={INTERVIEW_COMMAND} />
            <p className="t-secondary mt-3">When it’s done, press Refresh here.</p>
          </DialogBody>
          <DialogFooter className="justify-between">
            <p className="t-secondary self-center" aria-live="polite">{scriptNote ?? 'The questions come from a script saved in your folder.'}</p>
            <Button variant="secondary" onClick={() => void updateScript()}>
              Update interview script
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
