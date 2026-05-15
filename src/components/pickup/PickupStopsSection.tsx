import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { MapPin, Phone, Mail, Trash2, Plus, Truck, ExternalLink } from "lucide-react";
import { usePickupStops, type PickupParent, type PickupStop } from "@/hooks/usePickupStops";
import ExternalSupplierPicker from "./ExternalSupplierPicker";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface Props {
  parent: PickupParent;
  title?: string;
  compact?: boolean;
}

const STATUS_LABEL: Record<PickupStop["status"], string> = {
  planned: "Planerad",
  picked_up: "Hämtad",
  cancelled: "Avbokad",
};

const STATUS_VARIANT: Record<PickupStop["status"], "default" | "secondary" | "outline"> = {
  planned: "secondary",
  picked_up: "default",
  cancelled: "outline",
};

export default function PickupStopsSection({ parent, title = "Materialhämtning", compact }: Props) {
  const { stops, isLoading, add, isAdding, update, remove } = usePickupStops(parent);
  const [newSupplierId, setNewSupplierId] = useState<string | null>(null);
  const [newNote, setNewNote] = useState("");
  const [newWhen, setNewWhen] = useState("");

  const handleAdd = () => {
    if (!newSupplierId) return;
    add(
      {
        external_supplier_id: newSupplierId,
        note: newNote.trim() || undefined,
        scheduled_at: newWhen ? new Date(newWhen).toISOString() : null,
      },
      {
        onSuccess: () => {
          setNewSupplierId(null);
          setNewNote("");
          setNewWhen("");
        },
      },
    );
  };

  return (
    <div className={compact ? "space-y-3" : "space-y-4"}>
      <div className="flex items-center gap-2">
        <div className="flex items-center justify-center h-7 w-7 rounded-lg bg-primary/10">
          <Truck className="h-4 w-4 text-primary" />
        </div>
        <h2 className={compact ? "text-sm font-semibold" : "text-base font-semibold tracking-tight"}>{title}</h2>
        {stops.length > 0 && (
          <span className="inline-flex items-center justify-center h-5 min-w-5 px-1.5 text-xs font-medium rounded-full bg-primary text-primary-foreground">
            {stops.length}
          </span>
        )}
      </div>

      {isLoading ? (
        <div className="text-sm text-muted-foreground py-4">Laddar…</div>
      ) : (
        <div className="space-y-2">
          {stops.map((stop) => {
            const sup = stop.external_supplier;
            return (
              <Card key={stop.id} className="p-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium truncate">{sup?.name ?? "Okänd leverantör"}</span>
                      <Badge variant={STATUS_VARIANT[stop.status]} className="text-[10px]">
                        {STATUS_LABEL[stop.status]}
                      </Badge>
                      {stop.scheduled_at && (
                        <span className="text-xs text-muted-foreground">
                          {format(new Date(stop.scheduled_at), "d MMM HH:mm", { locale: sv })}
                        </span>
                      )}
                    </div>
                    {sup?.address_line1 && (
                      <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                        <MapPin className="h-3 w-3" />
                        {sup.address_line1}
                        {sup.city ? `, ${sup.city}` : ""}
                        <a
                          href={`https://maps.google.com/?q=${encodeURIComponent(
                            [sup.address_line1, sup.postal_code, sup.city].filter(Boolean).join(", "),
                          )}`}
                          target="_blank"
                          rel="noreferrer"
                          className="text-primary inline-flex items-center gap-0.5 hover:underline ml-1"
                        >
                          <ExternalLink className="h-3 w-3" /> Karta
                        </a>
                      </div>
                    )}
                    <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                      {sup?.phone && (
                        <a href={`tel:${sup.phone}`} className="inline-flex items-center gap-1 hover:underline">
                          <Phone className="h-3 w-3" /> {sup.phone}
                        </a>
                      )}
                      {sup?.email && (
                        <a href={`mailto:${sup.email}`} className="inline-flex items-center gap-1 hover:underline">
                          <Mail className="h-3 w-3" /> {sup.email}
                        </a>
                      )}
                    </div>
                    {stop.note && (
                      <div className="text-sm text-foreground mt-2 whitespace-pre-wrap">{stop.note}</div>
                    )}
                  </div>
                  <div className="flex flex-col gap-1">
                    {stop.status !== "picked_up" && (
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs"
                        onClick={() => update({ id: stop.id, updates: { status: "picked_up" } })}
                      >
                        Markera hämtad
                      </Button>
                    )}
                    {stop.status === "picked_up" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-7 text-xs"
                        onClick={() => update({ id: stop.id, updates: { status: "planned" } })}
                      >
                        Återställ
                      </Button>
                    )}
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-7 w-7 text-destructive"
                      onClick={() => remove(stop.id)}
                      title="Ta bort"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}

          {stops.length === 0 && (
            <div className="rounded-lg border border-dashed border-border p-6 text-center">
              <Truck className="h-8 w-8 text-muted-foreground/30 mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">
                Inga hämtningsstopp ännu. Lägg till en leverantör nedan.
              </p>
            </div>
          )}
        </div>
      )}

      <Card className="p-3 space-y-2 bg-muted/30">
        <div className="text-xs font-medium text-muted-foreground">Lägg till hämtningsstopp</div>
        <ExternalSupplierPicker value={newSupplierId} onChange={(id) => setNewSupplierId(id)} />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Input
            type="datetime-local"
            value={newWhen}
            onChange={(e) => setNewWhen(e.target.value)}
            placeholder="Tid (valfritt)"
          />
          <Textarea
            value={newNote}
            onChange={(e) => setNewNote(e.target.value)}
            placeholder="Vad ska hämtas? (valfritt)"
            rows={1}
            className="resize-none"
          />
        </div>
        <div className="flex justify-end">
          <Button size="sm" onClick={handleAdd} disabled={!newSupplierId || isAdding} className="gap-1.5">
            <Plus className="h-3.5 w-3.5" />
            Lägg till
          </Button>
        </div>
      </Card>
    </div>
  );
}
