import { describe, expect, it } from 'vitest';
import fs from 'fs';
import path from 'path';

const read = (file: string) => fs.readFileSync(path.join(process.cwd(), file), 'utf8');

const view = read('src/components/packing/DesktopChecklistView.tsx');
const service = read('src/services/desktopPackingService.ts');

describe('Lagermodulens packningsbarhet', () => {
  it('visar alla rader i samma struktur och markerar effektivt ej packningsbara rader', () => {
    expect(view).toContain('const productItems = items.filter');
    expect(view).toContain('const presentation = getOperationsPackingPresentation(item)');
    expect(view).toContain('const isExcluded = !presentation.isPackable');
    expect(view).toContain('presentation.rowClassName');
    expect(view).toContain('presentation.nameClassName');
    expect(view).toContain('Ej packningsbar');
    expect(view).not.toContain('Exkluderade (');
  });

  it('erbjuder rätt högerklicksåtgärd och bevarar paketrekursionen', () => {
    expect(view).toContain('<ContextMenu');
    expect(view).toContain('Markera som packningsbar');
    expect(view).toContain('Markera som ej packningsbar');
    expect(view).toContain('childrenByParent');
  });

  it('skriver endast genom edit-packing-list med revision och operation-id', () => {
    expect(service).toContain("functions.invoke('edit-packing-list'");
    expect(service).toContain("mode: 'set_packable' | 'set_non_packable' | 'reset_packability'");
    expect(service).toContain('operation_id: operationId');
    expect(service).toContain('expected_revision: expectedRevision');
    expect(service).not.toMatch(/from\('packing_list_items'\)[\s\S]{0,200}\.update\(/);
  });

  it('kräver ett matchande verifierbart WMS-kvitto innan UI laddas om', () => {
    expect(service).toContain('receipt.operation_id !== operationId');
    expect(service).toContain('receipt.item_id !== itemId');
    expect(service).toContain('receipt.booking_unchanged !== true');
    expect(service).toContain('receipt.is_packable !== expectedPackable');
    expect(service).toContain('Number.isInteger(receipt.packability_revision)');
    expect(view.indexOf('await setWarehousePackingListItemPackability')).toBeLessThan(
      view.indexOf('await loadData(true)', view.indexOf('await setWarehousePackingListItemPackability')),
    );
  });

  it('failar synligt vid konflikt och använder aktuell radrevision', () => {
    expect(service).toContain("code === 'revision_conflict'");
    expect(service).toContain('Ladda om packlistan och försök igen');
    expect(view).toContain('pendingEdit.item.packability_revision');
    expect(view).toContain("toast.error(err?.message || 'Kunde inte uppdatera packlistan.')");
  });

  it('räknar och skriver bara ut effektivt packningsbara rader', () => {
    expect(view).toContain('const activeItems = items.filter((i) => getOperationsPackingPresentation(i).isPackable)');
    expect(view).toContain('excluded: item.is_packable === false || item.excluded === true');
    expect(view).toContain('const rows = activeItems.map');
  });
});
