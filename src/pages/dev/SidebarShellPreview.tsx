import React from 'react';
import { Sidebar3D } from '@/components/Sidebar3D';
import { WarehouseSidebar3D } from '@/components/WarehouseSidebar3D';
import { PinnedTabsProvider } from '@/contexts/PinnedTabsContext';
import { SIDEBAR_SURFACE } from '@/lib/layout/sidebarContract';

/**
 * DEV-ONLY visual shell preview (no auth, no domain logic).
 * Route: /dev/sidebar-preview?module=planning|warehouse
 * Used to visually verify the canonical sidebar contract at 1440px.
 */
export default function SidebarShellPreview() {
  const params = new URLSearchParams(window.location.search);
  const module = params.get('module') === 'warehouse' ? 'warehouse' : 'planning';

  return (
    <PinnedTabsProvider>
      <div className="h-screen flex overflow-hidden" data-testid="sidebar-shell-preview">
        {module === 'warehouse' ? <WarehouseSidebar3D /> : <Sidebar3D />}
        <main className="flex-1 p-6" style={{ background: SIDEBAR_SURFACE.canvas }}>
          <div className="rounded-xl bg-white p-6 shadow-sm">
            <h1 className="text-lg font-semibold">Sidebar shell preview ({module})</h1>
            <p className="text-sm text-muted-foreground">
              Dev-only visuell kontroll av sidebar-kontraktet.
            </p>
          </div>
        </main>
      </div>
    </PinnedTabsProvider>
  );
}
