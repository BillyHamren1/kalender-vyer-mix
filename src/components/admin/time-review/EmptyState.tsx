import React from 'react';
import { CheckCircle2, Inbox, SearchX, LucideIcon } from 'lucide-react';

export type EmptyKind = 'no-days' | 'all-approved' | 'no-anomalies' | 'no-matches';

const VARIANTS: Record<EmptyKind, { icon: LucideIcon; title: string; body: string; tone: string }> = {
  'no-days':       { icon: Inbox,        title: 'Inga dagar att granska', body: 'Det finns inga arbetsdagar i det valda intervallet.', tone: 'text-muted-foreground' },
  'all-approved':  { icon: CheckCircle2, title: 'Alla tider är godkända', body: 'Bra jobbat — inga dagar väntar på handpåläggning.', tone: 'text-emerald-600' },
  'no-anomalies':  { icon: CheckCircle2, title: 'Inga avvikelser hittade', body: 'Alla dagar i urvalet ser rena ut.', tone: 'text-emerald-600' },
  'no-matches':    { icon: SearchX,      title: 'Inga träffar för filtret', body: 'Justera datum, status eller sök på en annan person/projekt.', tone: 'text-muted-foreground' },
};

export const EmptyState: React.FC<{ kind: EmptyKind }> = ({ kind }) => {
  const v = VARIANTS[kind];
  const Icon = v.icon;
  return (
    <div className="flex flex-col items-center justify-center py-16 text-center">
      <div className={`w-14 h-14 rounded-2xl bg-muted/50 flex items-center justify-center mb-4 ${v.tone}`}>
        <Icon className="w-7 h-7" />
      </div>
      <h3 className="text-base font-bold text-foreground">{v.title}</h3>
      <p className="text-sm text-muted-foreground mt-1 max-w-sm">{v.body}</p>
    </div>
  );
};

export default EmptyState;
