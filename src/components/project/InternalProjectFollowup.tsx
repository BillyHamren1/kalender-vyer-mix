import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Project } from '@/types/project';
import { optionalNonNegative } from '@/lib/projects/projectKind';
import { classifySubmissionStatus } from '@/services/projectStaffTimeCostLinesService';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

// Reads existing Operations evidence only. Never recomputes rates or writes a second ledger.
export async function readInternalProjectTime(projectId: string) {
  const rows: Array<{id:string;minutes:number;cost:number|null;rate_source:string|null;submission_status:string}> = [];
  for (let from = 0; ; from += 500) {
    const { data, error } = await supabase.from('project_staff_time_cost_lines')
      .select('id, minutes, cost, rate_source, submission_status').eq('project_id', projectId)
      .order('id').range(from, from + 499);
    if (error) throw error;
    rows.push(...(data || []));
    if (!data || data.length < 500) break;
  }
  const approval = (status: string) => status === 'corrected' ? 'unapproved' : classifySubmissionStatus(status);
  const current = [...new Map(rows.map(r => [r.id, r])).values()].filter(r => approval(r.submission_status) !== 'excluded');
  const validNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
  const invalidMinutes = current.some(r => !validNumber(r.minutes));
  const missing = current.filter(r => !validNumber(r.cost) || !validNumber(r.minutes) || !r.rate_source || !['completion_staff', 'staff_members'].includes(r.rate_source));
  return {
    hasEvidence: current.length > 0,
    hours: invalidMinutes || current.length === 0 ? null : current.reduce((n, r) => n + Number(r.minutes), 0) / 60,
    approved: current.filter(r => approval(r.submission_status) === 'approved').reduce((n,r) => n + Number(r.cost ?? 0),0),
    preliminary: current.filter(r => approval(r.submission_status) === 'unapproved').reduce((n,r) => n + Number(r.cost ?? 0),0),
    missing: missing.length,
  };
}

export function InternalProjectFollowup({ project }: { project: Project }) {
  const queryClient = useQueryClient();
  const [hours, setHours] = useState(String(project.budget_hours ?? ''));
  const [budget, setBudget] = useState(project.budget_cost_minor == null ? '' : String(project.budget_cost_minor / 100));
  const [remaining, setRemaining] = useState(String(project.remaining_hours ?? ''));
  const [remainingCost, setRemainingCost] = useState(project.remaining_cost_minor == null ? '' : String(project.remaining_cost_minor / 100));
  const [note, setNote] = useState(project.followup_note ?? '');
  const draft = { hours, budget, remaining, remainingCost, note };
  const [savedDraft, setSavedDraft] = useState(draft);
  const hasUnsavedChanges = Object.keys(draft).some(key => draft[key as keyof typeof draft] !== savedDraft[key as keyof typeof draft]);
  const time = useQuery({ queryKey: ['internal-project-time', project.id], queryFn: () => readInternalProjectTime(project.id) });
  const save = useMutation({ mutationFn: async () => {
    const {error} = await supabase.from('projects').update({
      budget_hours: optionalNonNegative(hours), budget_cost_minor: optionalNonNegative(budget, 100),
      remaining_hours: optionalNonNegative(remaining), remaining_cost_minor: optionalNonNegative(remainingCost, 100),
      followup_note: note.trim() || null, updated_at: new Date().toISOString(),
    } as never).eq('id', project.id).select('id').single();
    if (error) throw error;
    return draft;
  }, onSuccess: (saved) => { setSavedDraft(saved); queryClient.invalidateQueries({queryKey:['project-detail',project.id]}); toast.success('Uppföljning sparad'); }, onError: (e:Error) => toast.error(e.message) });
  const close = useMutation({ mutationFn: async () => {
    if (hasUnsavedChanges) throw new Error('Spara ändringarna innan projektet avslutas.');
    const {error} = await supabase.from('projects').update({status:'completed'}).eq('id',project.id).select('id').single();
    if (error) throw error;
  }, onSuccess: () => { queryClient.invalidateQueries({queryKey:['project-detail',project.id]}); toast.success('Projektet är operativt avslutat. Ingen fakturering skapades.'); }, onError: (e:Error) => toast.error(e.message) });
  const currency = project.budget_currency ?? 'SEK';
  const money = (v:number) => new Intl.NumberFormat('sv-SE',{style:'currency',currency:'SEK'}).format(v);
  return <section className="space-y-5 rounded-lg border p-5">
    <div><h2 className="text-lg font-semibold">Intern projektuppföljning</h2><p>{project.internal_goal}</p><p className="text-sm text-muted-foreground">Ansvarig: {project.project_leader || 'Saknas'} · {project.rigdaydate || 'Start saknas'} – {project.rigdowndate || 'Slut saknas'}</p></div>
    {time.isPending ? <p>Läser rapporterad tid…</p> : time.isError ? <p role="alert">Tidsunderlaget kunde inte hämtas. Kostnad och timmar är okända.</p> : <div className="grid gap-3 sm:grid-cols-3">
      <div>Rapporterat<strong className="block">{time.data.hours == null ? 'Okänt tidsunderlag' : `${time.data.hours.toLocaleString('sv-SE')} h`}</strong></div>
      <div>Personalkostnad för godkänd tid<strong className="block">{!time.data.hasEvidence ? 'Underlag saknas' : time.data.missing ? 'Ofullständigt underlag' : money(time.data.approved)}</strong></div>
      <div>Preliminär personalkostnad<strong className="block">{!time.data.hasEvidence ? 'Underlag saknas' : time.data.missing ? 'Ofullständigt underlag' : money(time.data.preliminary)}</strong></div>
    </div>}
    <p className="text-sm text-muted-foreground">Här visas registrerad personaltid och dess kostnad i SEK. Underlagets fullständighet är inte verifierad; en tom projektion bevisar inte att tid eller kostnad är noll. Historiska kostnadssatser är ännu inte avstämda. Inköp, leverantörsfakturor och Finance-avstämning måste också kontrolleras före ekonomiskt avslut. En fullständig slutkostnad är ännu inte verifierad.</p>
    <fieldset disabled={save.isPending || close.isPending || project.status === 'completed'} className="space-y-3">
    <div className="grid gap-3 sm:grid-cols-2">
      <Label>Budget timmar<Input type="number" min="0" step="0.25" value={hours} onChange={e=>setHours(e.target.value)} /></Label>
      <Label>Budget {currency}<Input type="number" min="0" step="0.01" value={budget} onChange={e=>setBudget(e.target.value)} /></Label>
      <Label>Återstående timmar<Input type="number" min="0" step="0.25" value={remaining} onChange={e=>setRemaining(e.target.value)} /></Label>
      <Label>Återstående kostnad {currency}<Input type="number" min="0" step="0.01" value={remainingCost} onChange={e=>setRemainingCost(e.target.value)} /></Label>
    </div>
    <Label>Veckouppföljning och nästa milstolpe<Textarea value={note} onChange={e=>setNote(e.target.value)} /></Label>
    </fieldset>
    {hasUnsavedChanges && <p role="status" className="text-sm text-muted-foreground">Spara ändringarna innan projektet avslutas.</p>}
    <div className="flex gap-3"><Button disabled={save.isPending || close.isPending || project.status === 'completed'} onClick={()=>save.mutate()}>Spara uppföljning</Button>
    {project.project_kind === 'internal_project' && project.status !== 'completed' && <Button variant="outline" disabled={close.isPending || save.isPending || hasUnsavedChanges} onClick={()=>close.mutate()}>Avsluta operativt</Button>}</div>
    <p className="text-sm text-muted-foreground">Operativt avslut kräver klara uppgifter samt sparad prognos med noll återstående timmar och kostnad. Ekonomisk avstämning hanteras separat.</p>
  </section>;
}
