import { useEffect, useMemo, useState } from "react";
import { Map as MapIcon, Loader2 } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { supabase } from "@/integrations/supabase/client";
import ProjectsOverviewMap, { ProjectMapMarker } from "./ProjectsOverviewMap";

interface ProjectsOverviewMapButtonProps {
  /** Optional date — if set, filters to projects active on or after this date. */
  weekStart?: Date;
}

/**
 * Floating button + dialog that opens an overview map showing every project
 * with a saved address. Used in the planning calendar.
 */
export default function ProjectsOverviewMapButton({ weekStart }: ProjectsOverviewMapButtonProps) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [markers, setMarkers] = useState<ProjectMapMarker[]>([]);
  const navigate = useNavigate();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        const [largeRes, normalRes] = await Promise.all([
          supabase
            .from("large_projects")
            .select("id, name, address, address_latitude, address_longitude")
            .not("address_latitude", "is", null)
            .not("address_longitude", "is", null)
            .limit(500),
          supabase
            .from("projects")
            .select("id, name, deliveryaddress, delivery_latitude, delivery_longitude")
            .not("delivery_latitude", "is", null)
            .not("delivery_longitude", "is", null)
            .limit(500),
        ]);

        if (cancelled) return;

        const large: ProjectMapMarker[] = (largeRes.data ?? []).map((p: any) => ({
          id: `large-${p.id}`,
          label: p.name || "Stort projekt",
          subtitle: p.address || undefined,
          latitude: p.address_latitude,
          longitude: p.address_longitude,
          color: "#7c3aed",
          onClick: () => {
            setOpen(false);
            navigate(`/large-project/${p.id}`);
          },
        }));

        const normal: ProjectMapMarker[] = (normalRes.data ?? []).map((p: any) => ({
          id: `proj-${p.id}`,
          label: p.name || "Projekt",
          subtitle: p.deliveryaddress || undefined,
          latitude: p.delivery_latitude,
          longitude: p.delivery_longitude,
          color: "#a78bfa",
          onClick: () => {
            setOpen(false);
            navigate(`/project/${p.id}`);
          },
        }));

        setMarkers([...large, ...normal]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [open, navigate]);

  const count = markers.length;

  return (
    <>
      <Button
        size="sm"
        variant="outline"
        className="h-8 gap-1"
        onClick={() => setOpen(true)}
      >
        <MapIcon className="h-3.5 w-3.5" />
        Karta
      </Button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-5xl">
          <DialogHeader>
            <DialogTitle>
              Projektkarta {!loading && `(${count} projekt med adress)`}
            </DialogTitle>
          </DialogHeader>

          <div className="relative h-[70vh] rounded-md overflow-hidden border border-border/50 bg-muted/20">
            {loading ? (
              <div className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : (
              <ProjectsOverviewMap markers={markers} className="absolute inset-0" />
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
