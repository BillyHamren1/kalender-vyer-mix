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

  const startDeltaMin = (() => {
    if (!startHm || startHm === origStartHm) return 0;
    const iso = localHmToIso(startHm, block.startAt);
    if (!iso) return 0;
    return Math.round(Math.abs(Date.parse(iso) - Date.parse(block.startAt)) / 60000);
  })();
  const endDeltaMin = (() => {
    if (!endHm || endHm === origEndHm) return 0;
    const iso = localHmToIso(endHm, block.endAt);
    if (!iso) return 0;
    return Math.round(Math.abs(Date.parse(iso) - Date.parse(block.endAt)) / 60000);
  })();
  const maxDelta = Math.max(startDeltaMin, endDeltaMin);
  const requiresComment = maxDelta > 60;
  const commentOk = !requiresComment || comment.trim().length >= 10;
  const hasChange = startHm !== origStartHm || endHm !== origEndHm || projectLabel.trim().length > 0 || comment.trim().length > 0;

  return (
    <Sheet open={open} onOpenChange={(o) => { if (!o) onClose(); }}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle className="text-left">
            {step === 'edit' ? 'Redigera block' : 'Bekräfta ändring'}
          </SheetTitle>
          <p className="text-xs text-muted-foreground text-left">{block.title}</p>
        </SheetHeader>

        {step === 'edit' ? (
          <div className="space-y-3 py-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-xs">Start</Label>
                <Input type="time" value={startHm} onChange={(e) => setStartHm(e.target.value)} className="tabular-nums" />
              </div>
              <div>
                <Label className="text-xs">Slut</Label>
                <Input type="time" value={endHm} onChange={(e) => setEndHm(e.target.value)} className="tabular-nums" />
              </div>
            </div>
            <div>
              <Label className="text-xs">Koppla till projekt (valfritt)</Label>
              <Input type="text" value={projectLabel} onChange={(e) => setProjectLabel(e.target.value)} placeholder="Skriv projektnamn eller identifierare" />
              <p className="text-[10px] text-muted-foreground mt-1">
                Sparas som förslag — adminsidan kan kvitta kopplingen senare.
              </p>
            </div>
            <div>
              <Label className="text-xs">
                Kommentar / förklaring {requiresComment && <span className="text-destructive">* (krävs &gt; 60 min ändring)</span>}
              </Label>
              <Textarea
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                placeholder="Skriv kort varför du ändrar"
              />
              {requiresComment && (
                <p className="text-[10px] text-muted-foreground mt-1">{comment.trim().length}/10 tecken</p>
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-3 py-3">
            <p className="text-xs text-muted-foreground">
              Är du säker? Ändringen skickas till admin för granskning.
            </p>
            <div className="rounded-lg border border-border bg-muted/40 p-3 text-xs space-y-2">
              {startHm !== origStartHm && (
                <div className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">Start</span>
                  <span><span className="line-through opacity-60">{origStartHm}</span> → <span className="font-bold">{startHm}</span></span>
                </div>
              )}
              {endHm !== origEndHm && (
                <div className="flex justify-between tabular-nums">
                  <span className="text-muted-foreground">Slut</span>
                  <span><span className="line-through opacity-60">{origEndHm}</span> → <span className="font-bold">{endHm}</span></span>
                </div>
              )}
              {projectLabel.trim() && (
                <div className="flex justify-between gap-2">
                  <span className="text-muted-foreground">Projekt</span>
                  <span className="font-bold text-right">{projectLabel.trim()}</span>
                </div>
              )}
              {comment.trim() && (
                <div className="pt-1 border-t border-border">
                  <span className="text-muted-foreground">Kommentar: </span>
                  <span>{comment.trim()}</span>
                </div>
              )}
            </div>
          </div>
        )}

        <SheetFooter className="flex-row gap-2">
          {step === 'edit' ? (
            <>
              <Button variant="outline" className="flex-1" onClick={onClose}>Avbryt</Button>
              <Button
                className="flex-1"
                disabled={!hasChange || !commentOk}
                onClick={() => setStep('confirm')}
                data-testid="block-edit-next"
              >
                Fortsätt
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setStep('edit')}>Tillbaka</Button>
              <Button className="flex-1" onClick={handleSave} data-testid="block-edit-confirm">
                Bekräfta
              </Button>
            </>
          )}
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
};

export default BlockEditDialog;
