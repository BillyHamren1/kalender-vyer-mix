import React from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Link } from 'react-router-dom';
import { useTimeV2Flag } from '@/features/time-v2/hooks/useTimeV2Flag';
import { LEGACY_TIME_ROUTE, TIME_V2_ROUTE } from '@/features/time-v2/lib/moduleFlag';

/**
 * Explicit test-tenant fixture for the Time V2 module flag.
 * Client-local only: no production table, no real account, no session is touched.
 */
const TimeV2FlagFixturePage: React.FC = () => {
  const flag = useTimeV2Flag();

  return (
    <div className="p-8 max-w-2xl space-y-4" data-testid="time-v2-fixture">
      <div>
        <h1 className="text-2xl font-bold text-foreground">Time V2 — testflagga</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Lokal, reversibel flagga för syntetisk testning. Skriver ingenting i produktionsdatabasen.
        </p>
      </div>

      <Card className="p-5 space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Organisation:</span>
          <code className="text-xs bg-muted px-2 py-1 rounded">{flag.organizationId ?? '—'}</code>
          <Badge variant={flag.enabled ? 'default' : 'secondary'} data-testid="time-v2-flag-state">
            {flag.enabled ? 'PÅ' : 'AV'}
          </Badge>
          <span className="text-xs text-muted-foreground">({flag.source})</span>
        </div>
        <p className="text-sm text-muted-foreground">{flag.reason}</p>

        <div className="flex flex-wrap gap-2 pt-1">
          <Button
            size="sm"
            disabled={!flag.organizationId}
            onClick={() => flag.setLocalOverride(true)}
            data-testid="time-v2-flag-on"
          >
            Slå PÅ för denna organisation
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={!flag.organizationId}
            onClick={() => flag.setLocalOverride(false)}
            data-testid="time-v2-flag-off"
          >
            Slå AV
          </Button>
          <Button
            size="sm"
            variant="ghost"
            disabled={!flag.organizationId}
            onClick={() => flag.setLocalOverride(null)}
          >
            Återställ till standard (AV)
          </Button>
        </div>
      </Card>

      <div className="flex gap-4 text-sm">
        <Link className="underline" to={TIME_V2_ROUTE}>Öppna Tid V2</Link>
        <Link className="underline" to={LEGACY_TIME_ROUTE}>Öppna legacy Tid &amp; Lön</Link>
      </div>
    </div>
  );
};

export default TimeV2FlagFixturePage;
