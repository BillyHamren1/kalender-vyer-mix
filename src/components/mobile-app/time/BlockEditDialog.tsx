/**
 * BlockEditDialog — Lager 5.5
 *
 * Enkel sheet/dialog där användaren kan justera ett display-block:
 *   - ändra starttid (HH:MM)
 *   - ändra sluttid (HH:MM)
 *   - koppla blocket till projekt (fri-text projektnamn/identifierare)
 *   - lägga kommentar/förklaring
 *
 * Komponenten skapar en lista med UserEdit-payloads (Lager 5.3-format) och
 * lämnar tillbaka via onSave. Den skriver INGENTING själv.
 */
import React, { useEffect, useState } from 'react';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetFooter } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import type { DisplayTimelineV2Block, UserEditPayload } from '@/hooks/useDisplayTimelineV2';

interface Props {
  block: DisplayTimelineV2Block | null;
  date: string;
  onClose: () => void;
  onSave: (edits: UserEditPayload[]) => void;
}

function isoToLocalHm(iso: string): string {
  try {
    const d = new Date(iso);
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${hh}:${mm}`;
  } catch { return ''; }
}

function localHmToIso(hm: string, sourceIso: string): string | null {
  const m = /^(\d{1,2}):(\d{2})$/.exec(hm.trim());
  if (!m) return null;
  const h = Math.max(0, Math.min(23, parseInt(m[1], 10)));
  const min = Math.max(0, Math.min(59, parseInt(m[2], 10)));
  const d = new Date(sourceIso);
  d.setHours(h, min, 0, 0);
  return d.toISOString();
}

function genId(): string {
  return `e_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

export const BlockEditDialog: React.FC<Props> = ({ block, date, onClose, onSave }) => {
  const open = !!block;
  const [startHm, setStartHm] = useState('');
  const [endHm, setEndHm] = useState('');
  const [projectLabel, setProjectLabel] = useState('');
  const [comment, setComment] = useState('');
  const [step, setStep] = useState<'edit' | 'confirm'>('edit');

  useEffect(() => {
    if (!block) return;
    setStartHm(isoToLocalHm(block.startAt));
    setEndHm(isoToLocalHm(block.endAt));
    setProjectLabel('');
    setComment('');
    setStep('edit');
  }, [block]);

  if (!block) return null;

  const origStartHm = isoToLocalHm(block.startAt);
  const origEndHm = isoToLocalHm(block.endAt);
  const canLinkProject =
    block.allocationType === 'unlinked_work_address' ||
    block.displayType === 'unlinked_work_address' ||
    block.displayType === 'unknown_segment' ||
    block.displayType === 'supplier_visit';

  const handleSave = () => {
    const edits: UserEditPayload[] = [];
    const now = new Date().toISOString();

    if (startHm && startHm !== origStartHm) {
      const newIso = localHmToIso(startHm, block.startAt);
      if (newIso) {
        edits.push({
          editId: genId(),
          sourceDisplayBlockId: block.id,
          editType: 'change_block_start',
          previousValue: block.startAt,
          newValue: newIso,
          userReason: comment || null,
          createdAt: now,
        });
      }
    }
    if (endHm && endHm !== origEndHm) {
      const newIso = localHmToIso(endHm, block.endAt);
      if (newIso) {
        edits.push({
          editId: genId(),
          sourceDisplayBlockId: block.id,
          editType: 'change_block_end',
          previousValue: block.endAt,
          newValue: newIso,
          userReason: comment || null,
          createdAt: now,
        });
      }
    }
    if (projectLabel.trim()) {
      edits.push({
        editId: genId(),
        sourceDisplayBlockId: block.id,
        editType: canLinkProject && (block.displayType === 'unlinked_work_address') ? 'link_address_to_project' : 'link_block_to_project',
        previousValue: { targetType: block.targetType ?? null, targetId: block.targetId ?? null, label: block.label ?? null },
        newValue: { label: projectLabel.trim() },
        userReason: comment || null,
        createdAt: now,
      });
    }
    if (comment.trim() && edits.length === 0) {
      edits.push({
        editId: genId(),
        sourceDisplayBlockId: block.id,
        editType: 'add_block_comment',
        previousValue: null,
        newValue: { comment: comment.trim() },
        userReason: comment.trim(),
        createdAt: now,
      });
    }

    onSave(edits);
    onClose();
  };

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left">Redigera block</SheetTitle>
          <p className="text-xs text-muted-foreground text-left">{block.title}</p>
        </SheetHeader>
        <div className="space-y-3 py-3">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-xs">Start</Label>
              <Input
                type="time"
                value={startHm}
                onChange={(e) => setStartHm(e.target.value)}
                className="tabular-nums"
              />
            </div>
            <div>
              <Label className="text-xs">Slut</Label>
              <Input
                type="time"
                value={endHm}
                onChange={(e) => setEndHm(e.target.value)}
                className="tabular-nums"
              />
            </div>
          </div>
          <div>
            <Label className="text-xs">Koppla till projekt (valfritt)</Label>
            <Input
              type="text"
              value={projectLabel}
              onChange={(e) => setProjectLabel(e.target.value)}
              placeholder="Skriv projektnamn eller identifierare"
            />
            <p className="text-[10px] text-muted-foreground mt-1">
              Sparas som förslag — adminsidan kan kvitta kopplingen senare.
            </p>
          </div>
          <div>
            <Label className="text-xs">Kommentar / förklaring</Label>
            <Textarea
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              rows={3}
              placeholder="Skriv kort varför du ändrar (krävs vid större avvikelser)"
            />
          </div>
        </div>
        <SheetFooter className="flex-row gap-2">
          <Button variant="outline" className="flex-1" onClick={onClose}>Avbryt</Button>
          <Button className="flex-1" onClick={handleSave}>Spara ändring</Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default BlockEditDialog;
