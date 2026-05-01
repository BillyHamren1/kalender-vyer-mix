import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

type SavePayload = {
  address: string;
  latitude: number | null;
  longitude: number | null;
  radius_meters: number;
  geofence_mode: "circle";
  geofence_polygon: null;
};

interface LargeProjectAddressDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAddress: string | null;
  initialLatitude: number | null;
  initialLongitude: number | null;
  initialRadiusMeters?: number | null;
  onSave: (data: SavePayload) => Promise<void> | void;
}

const DEFAULT_RADIUS_METERS = 100;

async function geocodeProjectAddress(address: string) {
  const { data, error } = await supabase.functions.invoke("mapbox-token");
  if (error || !data?.token) {
    throw new Error("Kunde inte hämta adressuppslag för projektet");
  }

  const response = await fetch(
    `https://api.mapbox.com/geocoding/v5/mapbox.places/${encodeURIComponent(address)}.json` +
      `?access_token=${data.token}&country=se&language=sv&limit=1&autocomplete=false&types=address,place,locality,neighborhood,postcode`
  );

  if (!response.ok) {
    throw new Error("Adressuppslag misslyckades");
  }

  const json = await response.json();
  const match = Array.isArray(json.features) ? json.features[0] : null;
  if (!match?.center || match.center.length < 2) {
    throw new Error("Kunde inte hitta projektets adress");
  }

  return {
    longitude: Number(match.center[0]),
    latitude: Number(match.center[1]),
  };
}

export default function LargeProjectAddressDialog({
  open,
  onOpenChange,
  initialAddress,
  initialLatitude,
  initialLongitude,
  initialRadiusMeters,
  onSave,
}: LargeProjectAddressDialogProps) {
  const [address, setAddress] = useState(initialAddress ?? "");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAddress(initialAddress ?? "");
  }, [open, initialAddress]);

  const normalizedInitialAddress = useMemo(() => (initialAddress ?? "").trim(), [initialAddress]);
  const normalizedAddress = address.trim();

  const handleSave = async () => {
    setSaving(true);
    try {
      let latitude = initialLatitude ?? null;
      let longitude = initialLongitude ?? null;

      if (!normalizedAddress) {
        latitude = null;
        longitude = null;
      } else if (
        normalizedAddress !== normalizedInitialAddress ||
        latitude == null ||
        longitude == null
      ) {
        const resolved = await geocodeProjectAddress(normalizedAddress);
        latitude = resolved.latitude;
        longitude = resolved.longitude;
      }

      await onSave({
        address: normalizedAddress,
        latitude,
        longitude,
        radius_meters: initialRadiusMeters ?? DEFAULT_RADIUS_METERS,
        geofence_mode: "circle",
        geofence_polygon: null,
      });

      onOpenChange(false);
    } catch (error: any) {
      toast.error(error?.message || "Kunde inte spara projektets adress");
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Projektets adress</DialogTitle>
        </DialogHeader>

        <div className="space-y-2 py-2">
          <Label htmlFor="large-project-address">Adress</Label>
          <Input
            id="large-project-address"
            value={address}
            onChange={(event) => setAddress(event.target.value)}
            placeholder="Ange projektets adress"
            disabled={saving}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Avbryt
          </Button>
          <Button onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Spara
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}