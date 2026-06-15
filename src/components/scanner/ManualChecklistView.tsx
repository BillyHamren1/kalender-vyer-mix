/**
 * DEPRECATED — Manuell packning har ersatts av VerificationView med session-flöde.
 *
 * Den här komponenten är medvetet kvar som tom stub för att gamla länkar/
 * imports inte ska krascha bygget. Den får INTE användas för packning eftersom
 * den saknade activeSessionId, packing_work_session och history-loggning.
 *
 * Allt manuellt bockande sker numera i VerificationView, som:
 *   - kräver inloggad packare via getStoredStaff
 *   - startar packing_work_session vid mount
 *   - skickar activeSessionId till alla muterande scanner-api actions
 *   - blockerar lämning utan SignPackingSessionDialog
 *
 * Se mem://features/warehouse/desktop-packing-checklist + scanner-api
 * PACKING_MUTATING_ACTIONS för kontraktet.
 */
import React from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowLeft, AlertTriangle } from 'lucide-react';

interface ManualChecklistViewProps {
  packingId?: string;
  onBack: () => void;
  /** @deprecated — inte längre använt, har aldrig garanterat session/history */
  verifierName?: string;
}

export const ManualChecklistView: React.FC<ManualChecklistViewProps> = ({ onBack }) => {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button variant="ghost" size="icon" onClick={onBack} className="h-8 w-8">
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <h1 className="text-sm font-semibold">Manuell packning är borttagen</h1>
      </div>

      <Card className="border-amber-500/50 bg-amber-50">
        <CardContent className="py-4 space-y-2">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm text-amber-900">
              <p className="font-semibold">Den här vyn används inte längre.</p>
              <p className="mt-1">
                Allt packande sker i skannervyn där en packningssession startas
                automatiskt och varje förändring sparas i historiken.
              </p>
              <p className="mt-2">Gå tillbaka och välj packlistan från startsidan.</p>
            </div>
          </div>
          <Button onClick={onBack} className="mt-2">
            Tillbaka
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default ManualChecklistView;
