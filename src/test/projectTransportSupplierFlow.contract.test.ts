import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const root = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(root, file), 'utf8');

describe('Project transport supplier flow', () => {
  it('har en enda tydlig ingång till intern eller extern transport', () => {
    const widget = read('src/components/project/ProjectTransportWidget.tsx');
    expect(widget).toContain('Lägg till transport');
    expect(widget).not.toContain('TransportPlanningDialog');
    expect(widget).not.toContain('Fordon / partner');
  });

  it('gör intern transport till ett direkt val utan fordonskrav', () => {
    const dialog = read('src/components/project/ProjectTransportBookingDialog.tsx');
    expect(dialog).toContain("transport_type: 'internal'");
    expect(dialog).toContain('vehicle_id: null');
    expect(dialog).toContain('Inget mer behöver fyllas i');
  });

  it('hämtar och skapar externa leverantörer i WMS-registret', () => {
    const dialog = read('src/components/project/ProjectTransportBookingDialog.tsx');
    expect(dialog).toContain('listSuppliers()');
    expect(dialog).toContain('createSupplier(');
    expect(dialog).toContain("service_type: 'Transport'");
    expect(dialog).not.toContain('externalPartners');
    const proxy = read('supabase/functions/supplier-registry-proxy/index.ts');
    expect(proxy).toContain('supplierActions.has(action)');
    expect(proxy).toContain('action === "create_supplier_contact"');
  });

  it('kopplar externa transporter till supplier-cache, inte externa vehicles', () => {
    const dialog = read('src/components/project/ProjectTransportBookingDialog.tsx');
    expect(dialog).toContain('supplier_id: localSupplierId');
    expect(dialog).toContain('requested_vehicle_type: form.vehicleSize');
    expect(dialog).toContain('cargo_description: form.cargoDescription');
    expect(dialog).toContain("vehicle_id: null");
  });

  it('mejlfunktionerna använder supplier och behåller vehicle som historisk fallback', () => {
    for (const file of [
      'supabase/functions/send-transport-request/index.ts',
      'supabase/functions/send-transport-cancellation/index.ts',
      'supabase/functions/handle-transport-response/index.ts',
    ]) {
      const source = read(file);
      expect(source).toContain('supplier:suppliers!supplier_id');
      expect(source).toContain('vehicle:vehicles!vehicle_id');
    }
    const bookingSync = read('supabase/functions/sync-operational-plan-to-booking/index.ts');
    expect(bookingSync).toContain('supplier:suppliers!supplier_id');
    expect(bookingSync).toContain('partner_response: t.partner_response');
    const response = read('supabase/functions/handle-transport-response/index.ts');
    expect(response).toContain('sync-operational-plan-to-booking');
  });
});
