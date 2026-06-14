import { useEffect, useMemo, useState } from "react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Button } from "@/components/ui/button";
import {
  ChevronLeft,
  ChevronRight,
  Loader2,
  Package,
  History as HistoryIcon,
  User as UserIcon,
  Clock,
} from "lucide-react";
import { getPackingHistory } from "@/services/scannerService";
import { toast } from "sonner";

interface SessionRow {
  id: string;
  staff_id: string;
  staff_name: string;
  status: string;
  started_at: string;
  ended_at: string | null;
  signed_at: string | null;
  signature_name: string | null;
  summary_json: any;
}

interface EventRow {
  id: string;
  session_id: string | null;
  packing_list_item_id: string | null;
  event_type: string;
  quantity_delta: number | null;
  product_name: string | null;
  before_quantity: number | null;
  after_quantity: number | null;
  parcel_id: string | null;
  scan_value: string | null;
  source: string | null;
  metadata: any;
  staff_id: string | null;
  staff_name: string | null;
  created_at: string;
}

interface Props {
  packingId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const EVENT_LABEL: Record<string, string> = {
  scan_pack: "Skannad",
  scan_unpack: "Avskannad",
  manual_pack: "Manuell pack",
  manual_unpack: "Manuell avpack",
  decrement_pack: "Minska antal",
  parcel_create: "Skapade kolli",
  parcel_assign: "Tilldelade kolli",
  parcel_remove: "Tog bort från kolli",
  unknown_product_added: "Lade till okänd produkt",
};

const EVENT_COLOR: Record<string, string> = {
  scan_pack: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  manual_pack: "bg-emerald-500/10 text-emerald-600 border-emerald-500/30",
  scan_unpack: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  manual_unpack: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  decrement_pack: "bg-orange-500/10 text-orange-600 border-orange-500/30",
  parcel_create: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  parcel_assign: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  parcel_remove: "bg-rose-500/10 text-rose-600 border-rose-500/30",
  unknown_product_added: "bg-amber-500/10 text-amber-600 border-amber-500/30",
};

const fmtTime = (iso: string | null | undefined) => {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleString("sv-SE", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "–";
  }
};

const fmtTimeShort = (iso: string | null | undefined) => {
  if (!iso) return "–";
  try {
    return new Date(iso).toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return "–";
  }
};

const isPackingEvent = (t: string) =>
  t === "scan_pack" || t === "manual_pack";
const isUnpackingEvent = (t: string) =>
  t === "scan_unpack" || t === "manual_unpack" || t === "decrement_pack";
const isParcelEvent = (t: string) =>
  t === "parcel_create" || t === "parcel_assign" || t === "parcel_remove";

function summarizeSession(sessionId: string, events: EventRow[]) {
  let packed = 0;
  let unpacked = 0;
  let parcel = 0;
  for (const e of events) {
    if (e.session_id !== sessionId) continue;
    const delta = Math.abs(Number(e.quantity_delta) || 0) || 1;
    if (isPackingEvent(e.event_type)) packed += delta;
    else if (isUnpackingEvent(e.event_type)) unpacked += delta;
    else if (isParcelEvent(e.event_type)) parcel += 1;
  }
  return { packed, unpacked, parcel };
}

export const PackingHistoryDialog = ({ packingId, open, onOpenChange }: Props) => {
  const [loading, setLoading] = useState(false);
  const [sessions, setSessions] = useState<SessionRow[]>([]);
  const [events, setEvents] = useState<EventRow[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !packingId) return;
    let cancelled = false;
    setLoading(true);
    setSelectedSessionId(null);
    getPackingHistory(packingId, 1000)
      .then((res) => {
        if (cancelled) return;
        setSessions((res.sessions as SessionRow[]) || []);
        setEvents((res.events as EventRow[]) || []);
      })
      .catch((err: any) => {
        console.error("[PackingHistoryDialog]", err);
        toast.error(err?.message || "Kunde inte hämta historik");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, packingId]);

  const selectedSession = useMemo(
    () => sessions.find((s) => s.id === selectedSessionId) || null,
    [sessions, selectedSessionId],
  );

  const selectedSessionEvents = useMemo(() => {
    if (!selectedSessionId) return [];
    return events
      .filter((e) => e.session_id === selectedSessionId)
      .slice()
      .sort(
        (a, b) =>
          new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
      );
  }, [events, selectedSessionId]);

  const selectedByProduct = useMemo(() => {
    const map = new Map<
      string,
      { name: string; packed: number; unpacked: number; events: EventRow[] }
    >();
    for (const e of selectedSessionEvents) {
      const key = e.packing_list_item_id || e.product_name || "okänd";
      const cur =
        map.get(key) || {
          name: e.product_name || "Okänd produkt",
          packed: 0,
          unpacked: 0,
          events: [] as EventRow[],
        };
      const delta = Math.abs(Number(e.quantity_delta) || 0) || 1;
      if (isPackingEvent(e.event_type)) cur.packed += delta;
      else if (isUnpackingEvent(e.event_type)) cur.unpacked += delta;
      cur.events.push(e);
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) =>
      a.name.localeCompare(b.name, "sv"),
    );
  }, [selectedSessionEvents]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="w-full sm:max-w-lg p-0 flex flex-col gap-0"
      >
        <SheetHeader className="px-4 pt-4 pb-3 border-b">
          <SheetTitle className="flex items-center gap-2 text-base">
            <HistoryIcon className="h-4 w-4" />
            Packningshistorik
          </SheetTitle>
          <SheetDescription className="text-xs">
            Allt som hänt i denna packning – sessioner och händelser.
          </SheetDescription>
        </SheetHeader>

        {loading ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <Loader2 className="h-4 w-4 mr-2 animate-spin" /> Hämtar…
          </div>
        ) : selectedSession ? (
          <SessionDetail
            session={selectedSession}
            byProduct={selectedByProduct}
            allEvents={selectedSessionEvents}
            onBack={() => setSelectedSessionId(null)}
          />
        ) : (
          <Tabs defaultValue="sessions" className="flex-1 flex flex-col min-h-0">
            <TabsList className="mx-4 mt-3 grid grid-cols-2">
              <TabsTrigger value="sessions" className="text-xs">
                Sessioner ({sessions.length})
              </TabsTrigger>
              <TabsTrigger value="events" className="text-xs">
                Händelser ({events.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent
              value="sessions"
              className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden"
            >
              <ScrollArea className="h-full px-3 pb-4">
                {sessions.length === 0 ? (
                  <EmptyState text="Inga sessioner ännu." />
                ) : (
                  <ul className="space-y-2">
                    {sessions.map((s) => {
                      const sum = summarizeSession(s.id, events);
                      return (
                        <li key={s.id}>
                          <button
                            onClick={() => setSelectedSessionId(s.id)}
                            className="w-full text-left rounded-xl border border-border/60 bg-card hover:bg-accent/40 transition-colors p-3"
                          >
                            <div className="flex items-start justify-between gap-2">
                              <div className="min-w-0 flex-1">
                                <div className="flex items-center gap-1.5 min-w-0">
                                  <UserIcon className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                                  <span className="font-medium text-sm truncate">
                                    {s.staff_name || "Okänd"}
                                  </span>
                                  <SessionStatusBadge status={s.status} />
                                </div>
                                <div className="mt-1 flex items-center gap-1 text-[11px] text-muted-foreground">
                                  <Clock className="h-3 w-3" />
                                  {fmtTime(s.started_at)} →{" "}
                                  {s.ended_at ? fmtTimeShort(s.ended_at) : "pågår"}
                                  {s.signed_at && (
                                    <span className="ml-1">
                                      • signerad {fmtTimeShort(s.signed_at)}
                                    </span>
                                  )}
                                </div>
                                <div className="mt-2 flex flex-wrap gap-1.5">
                                  <StatChip label="Packat" value={sum.packed} tone="pack" />
                                  <StatChip
                                    label="Avpackat"
                                    value={sum.unpacked}
                                    tone="unpack"
                                  />
                                  <StatChip
                                    label="Kolli"
                                    value={sum.parcel}
                                    tone="parcel"
                                  />
                                </div>
                              </div>
                              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0 mt-1" />
                            </div>
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </ScrollArea>
            </TabsContent>

            <TabsContent
              value="events"
              className="flex-1 min-h-0 mt-3 data-[state=inactive]:hidden"
            >
              <ScrollArea className="h-full px-3 pb-4">
                {events.length === 0 ? (
                  <EmptyState text="Inga händelser ännu." />
                ) : (
                  <ol className="relative border-l border-border/60 ml-3 space-y-3">
                    {events.map((e) => (
                      <EventItem key={e.id} event={e} />
                    ))}
                  </ol>
                )}
              </ScrollArea>
            </TabsContent>
          </Tabs>
        )}
      </SheetContent>
    </Sheet>
  );
};

const SessionStatusBadge = ({ status }: { status: string }) => {
  if (status === "signed") {
    return (
      <Badge
        variant="outline"
        className="ml-1 h-4 px-1.5 text-[9px] bg-emerald-500/10 text-emerald-600 border-emerald-500/30"
      >
        Signerad
      </Badge>
    );
  }
  if (status === "active") {
    return (
      <Badge
        variant="outline"
        className="ml-1 h-4 px-1.5 text-[9px] bg-primary/10 text-primary border-primary/30"
      >
        Pågår
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="ml-1 h-4 px-1.5 text-[9px]">
      {status}
    </Badge>
  );
};

const StatChip = ({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pack" | "unpack" | "parcel";
}) => {
  const cls =
    tone === "pack"
      ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
      : tone === "unpack"
      ? "bg-orange-500/10 text-orange-600 border-orange-500/20"
      : "bg-blue-500/10 text-blue-600 border-blue-500/20";
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${cls}`}
    >
      <span className="opacity-70">{label}</span>
      <span className="tabular-nums">{value}</span>
    </span>
  );
};

const EmptyState = ({ text }: { text: string }) => (
  <div className="flex flex-col items-center justify-center py-12 text-muted-foreground text-sm">
    <Package className="h-8 w-8 mb-2 opacity-40" />
    {text}
  </div>
);

const EventItem = ({ event: e }: { event: EventRow }) => {
  const label = EVENT_LABEL[e.event_type] || e.event_type;
  const colorCls = EVENT_COLOR[e.event_type] || "bg-muted text-muted-foreground border-border";
  const qty = Number(e.quantity_delta) || 0;
  return (
    <li className="ml-3">
      <span className="absolute -left-1.5 mt-1.5 h-3 w-3 rounded-full bg-card border border-border" />
      <div className="rounded-lg border border-border/50 bg-card/60 p-2.5">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 min-w-0">
            <Badge variant="outline" className={`h-5 px-1.5 text-[10px] ${colorCls}`}>
              {label}
            </Badge>
            {qty !== 0 && (
              <span className="text-[11px] font-medium tabular-nums">
                {qty > 0 ? `+${qty}` : qty}
              </span>
            )}
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums shrink-0">
            {fmtTimeShort(e.created_at)}
          </span>
        </div>
        {e.product_name && (
          <div className="mt-1 text-sm font-medium truncate">{e.product_name}</div>
        )}
        <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
          <span className="inline-flex items-center gap-1">
            <UserIcon className="h-3 w-3" />
            {e.staff_name || "Okänd"}
          </span>
          {e.source && <span>• {e.source}</span>}
          {e.parcel_id && <span>• kolli</span>}
          {e.scan_value && (
            <span className="truncate font-mono">• {e.scan_value}</span>
          )}
        </div>
      </div>
    </li>
  );
};

const SessionDetail = ({
  session,
  byProduct,
  allEvents,
  onBack,
}: {
  session: SessionRow;
  byProduct: { name: string; packed: number; unpacked: number; events: EventRow[] }[];
  allEvents: EventRow[];
  onBack: () => void;
}) => {
  const totals = byProduct.reduce(
    (acc, p) => {
      acc.packed += p.packed;
      acc.unpacked += p.unpacked;
      return acc;
    },
    { packed: 0, unpacked: 0 },
  );
  const parcelEvents = allEvents.filter((e) => isParcelEvent(e.event_type)).length;

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="px-3 pt-3 pb-2 border-b">
        <Button
          variant="ghost"
          size="sm"
          onClick={onBack}
          className="h-7 px-2 text-xs -ml-1"
        >
          <ChevronLeft className="h-3.5 w-3.5 mr-1" />
          Tillbaka
        </Button>
        <div className="mt-1 flex items-center gap-2">
          <UserIcon className="h-4 w-4 text-muted-foreground" />
          <span className="font-medium text-sm">{session.staff_name}</span>
          <SessionStatusBadge status={session.status} />
        </div>
        <div className="mt-1 text-[11px] text-muted-foreground">
          {fmtTime(session.started_at)} →{" "}
          {session.ended_at ? fmtTime(session.ended_at) : "pågår"}
          {session.signed_at && <> • signerad {fmtTime(session.signed_at)}</>}
        </div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <StatChip label="Packat" value={totals.packed} tone="pack" />
          <StatChip label="Avpackat" value={totals.unpacked} tone="unpack" />
          <StatChip label="Kolli" value={parcelEvents} tone="parcel" />
        </div>
      </div>
      <ScrollArea className="flex-1 min-h-0 px-3 py-3">
        {byProduct.length === 0 ? (
          <EmptyState text="Inga händelser i denna session." />
        ) : (
          <ul className="space-y-2">
            {byProduct.map((p, i) => (
              <li
                key={i}
                className="rounded-lg border border-border/50 bg-card/60 p-2.5"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-sm font-medium truncate flex-1">
                    {p.name}
                  </span>
                  <div className="flex items-center gap-1 shrink-0">
                    {p.packed > 0 && (
                      <StatChip label="+" value={p.packed} tone="pack" />
                    )}
                    {p.unpacked > 0 && (
                      <StatChip label="−" value={p.unpacked} tone="unpack" />
                    )}
                  </div>
                </div>
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {p.events.map((e) => (
                    <span
                      key={e.id}
                      className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] ${
                        EVENT_COLOR[e.event_type] || "bg-muted"
                      }`}
                      title={`${EVENT_LABEL[e.event_type] || e.event_type} • ${fmtTimeShort(e.created_at)}`}
                    >
                      {EVENT_LABEL[e.event_type] || e.event_type}
                      {e.quantity_delta != null && (
                        <span className="tabular-nums">
                          {Number(e.quantity_delta) > 0
                            ? `+${e.quantity_delta}`
                            : e.quantity_delta}
                        </span>
                      )}
                    </span>
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </ScrollArea>
    </div>
  );
};

export default PackingHistoryDialog;
