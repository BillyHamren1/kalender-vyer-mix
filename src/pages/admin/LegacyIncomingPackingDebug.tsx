/**
 * LegacyIncomingPackingDebug — admin/debug-only access to the deprecated
 * IncomingPackingList flow.
 *
 * BACKGROUND
 * ----------
 * Historically there were TWO parallel paths from a Planning project to a
 * packing list:
 *   1. NEW (official): WarehouseProjectInbox → ConvertInboxDialog →
 *      warehouse_projects → packing_projects → packing_list_items.
 *   2. LEGACY: IncomingPackingList scanned bookings without a packing
 *      and created packing_projects directly — bypassing the
 *      warehouse_project layer.
 *
 * The legacy view caused confusion (same booking visible in two inboxes
 * with different buttons) and is no longer the official path. It is kept
 * here ONLY so admins can recover bookings that, for some reason, never
 * landed in `warehouse_project_inbox` (e.g. historical data predating the
 * new pipeline). Normal users must never see this page.
 *
 * Hidden behind /admin/legacy-incoming-packing. Not linked from the
 * regular warehouse navigation.
 */
import { IncomingPackingList } from '@/components/packing/IncomingPackingList';
import { AlertTriangle } from 'lucide-react';
import { PageHeader } from '@/components/ui/PageHeader';

const LegacyIncomingPackingDebug = () => {
  return (
    <div className="h-full overflow-y-auto" style={{ background: 'var(--gradient-page)' }}>
      <div className="container mx-auto px-4 sm:px-6 lg:px-8 py-8 max-w-[1200px]">
        <PageHeader
          icon={AlertTriangle}
          title="Legacy: Inkommande packning (debug)"
          subtitle="Avvecklad väg — använd Lager → Inbox för nya projekt"
          variant="warehouse"
        />

        <div className="mb-6 rounded-xl border border-amber-300/60 bg-amber-50/40 p-4 text-sm text-amber-900">
          <p className="font-semibold mb-1">⚠️ Legacy-flöde — använd inte i normal drift</p>
          <p>
            Detta är den gamla vägen som skapar packlistor direkt från bokningar utan att
            gå via <code className="font-mono">warehouse_project_inbox</code>. Det officiella
            flödet är{' '}
            <strong>Planning → Inbox (Nya projekt från Planning) → Skapa lagerprojekt</strong>.
            Sidan finns kvar bara för att kunna fånga gamla bokningar som aldrig hamnade i
            Inbox-tabellen.
          </p>
        </div>

        <IncomingPackingList />
      </div>
    </div>
  );
};

export default LegacyIncomingPackingDebug;
