import { planUpdateProfile, type ProfileInfo } from '@loam/core';
import { useState } from 'react';
import { useApp } from '../context';
import { Button } from './ui/button';
import { Dialog, DialogBody, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from './ui/dialog';
import { Input, Textarea } from './ui/input';
import { Label } from './ui/label';

const sectionOf = (body: string, heading: string): string => {
  const m = new RegExp(`^##\\s+${heading}\\s*\\n([\\s\\S]*?)(?=^##\\s|(?![\\s\\S]))`, 'm').exec(body);
  const text = m?.[1]?.trim() ?? '';
  return text.startsWith('_Not filled in yet') ? '' : text;
};

export function ProfileEditDialog({ profile, open, onOpenChange }: { profile: ProfileInfo | null; open: boolean; onOpenChange: (o: boolean) => void }) {
  const { store, today, propose } = useApp();
  const fm = profile?.fm;
  const [form, setForm] = useState({ name: '', role: '', company: '', industry: '', tools: '', context: '', style: '', quality: '' });

  const reset = () =>
    setForm({
      name: fm?.name ?? '',
      role: fm?.role ?? '',
      company: fm?.company ?? '',
      industry: fm?.industry ?? '',
      tools: fm?.tools.join(', ') ?? '',
      context: sectionOf(profile?.body ?? '', 'Working context'),
      style: sectionOf(profile?.body ?? '', 'Style and tone'),
      quality: sectionOf(profile?.body ?? '', 'What good work looks like'),
    });
  const set = (key: keyof typeof form) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const save = async () => {
    const plan = await planUpdateProfile(
      store,
      { ...form, tools: form.tools.split(',').map((t) => t.trim()).filter(Boolean) },
      today,
    );
    onOpenChange(false);
    await propose(plan, { title: 'Update your profile' });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        if (o) reset();
        onOpenChange(o);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit your profile</DialogTitle>
          <DialogDescription>You will see exactly what changes before anything is saved.</DialogDescription>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1">
              <Label htmlFor="p-name">Name</Label>
              <Input id="p-name" value={form.name} onChange={set('name')} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-role">Role</Label>
              <Input id="p-role" value={form.role} onChange={set('role')} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-company">Company</Label>
              <Input id="p-company" value={form.company} onChange={set('company')} autoComplete="off" />
            </div>
            <div className="space-y-1">
              <Label htmlFor="p-industry">Industry</Label>
              <Input id="p-industry" value={form.industry} onChange={set('industry')} autoComplete="off" />
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-tools">Tools you use every day</Label>
            <Input id="p-tools" value={form.tools} onChange={set('tools')} placeholder="HubSpot, Google Sheets, Slack" autoComplete="off" />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-context">How you work</Label>
            <Textarea id="p-context" value={form.context} onChange={set('context')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-style">Style and tone</Label>
            <Textarea id="p-style" value={form.style} onChange={set('style')} />
          </div>
          <div className="space-y-1">
            <Label htmlFor="p-quality">What good work looks like</Label>
            <Textarea id="p-quality" value={form.quality} onChange={set('quality')} />
          </div>
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
