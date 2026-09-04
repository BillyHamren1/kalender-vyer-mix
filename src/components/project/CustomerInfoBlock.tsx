import { Card } from "@/components/ui/card";
import { Building2, MapPin, User, Phone, Mail, Hash, Calendar, Clock, AlertTriangle, Pencil } from "lucide-react";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface CustomerInfoBlockProps {
  client: string;
  bookingNumber?: string | null;
  deliveryAddress?: string | null;
  deliveryCity?: string | null;
  deliveryPostalCode?: string | null;
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  eventdate?: string | null;
  rigdaydate?: string | null;
  rigdowndate?: string | null;
  carryMoreThan10m?: boolean | null;
  groundNailsAllowed?: boolean | null;
  exactTimeNeeded?: boolean | null;
  exactTimeInfo?: string | null;
  rentalOnly?: boolean | null;
  projectLeader?: string | null;
  /** When provided, the delivery address becomes editable directly in this card. */
  onEditAddress?: () => void;
  latitude?: number | null;
  longitude?: number | null;
}

const fmt = (s?: string | null) => {
  if (!s) return null;
  try { return format(new Date(s), "d MMM yyyy", { locale: sv }); } catch { return s; }
};

const Row = ({ icon: Icon, label, children }: { icon: React.ElementType; label: string; children: React.ReactNode }) => (
  <div className="flex items-start gap-2.5 py-1.5">
    <Icon className="h-4 w-4 text-primary mt-0.5 shrink-0" />
    <div className="min-w-0 flex-1">
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">{label}</div>
      <div className="text-sm text-foreground break-words">{children}</div>
    </div>
  </div>
);

const CustomerInfoBlock = ({
  client,
  bookingNumber,
  deliveryAddress,
  deliveryCity,
  deliveryPostalCode,
  contactName,
  contactPhone,
  contactEmail,
  eventdate,
  rigdaydate,
  rigdowndate,
  carryMoreThan10m,
  groundNailsAllowed,
  exactTimeNeeded,
  exactTimeInfo,
  rentalOnly,
  projectLeader,
  onEditAddress,
}: CustomerInfoBlockProps) => {
  const fullAddress = [deliveryAddress, [deliveryPostalCode, deliveryCity].filter(Boolean).join(" ")]
    .filter(Boolean).join(", ");

  const carryLabel = carryMoreThan10m === true ? "Mer än 10 m" : carryMoreThan10m === false ? "Mindre än 10 m" : null;
  const nailsLabel = groundNailsAllowed === true ? "Tillåtet" : groundNailsAllowed === false ? "Ej tillåtet" : null;


  return (
    <Card className="mb-4 border-border/40 rounded-2xl">
      <div className="p-5">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-primary" />
            <h2 className="text-base font-semibold text-foreground tracking-tight">Kundinformation</h2>
            {rentalOnly && (
              <span className="inline-flex items-center px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 text-[11px] font-semibold uppercase tracking-wide border border-emerald-300">
                Endast uthyrning
              </span>
            )}
          </div>
          {bookingNumber && (
            <span className="inline-flex items-center gap-1 text-xs font-mono text-muted-foreground">
              <Hash className="h-3 w-3" />{bookingNumber}
            </span>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1">
          <Row icon={Building2} label="Kund">
            <span className="font-semibold">{client || "–"}</span>
          </Row>

          {projectLeader && (
            <Row icon={User} label="Projektledare">{projectLeader}</Row>
          )}

          {(fullAddress || onEditAddress) && (
            <Row icon={MapPin} label="Leveransadress">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                {fullAddress ? (
                  <a
                    href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(fullAddress)}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-primary"
                  >
                    {fullAddress}
                  </a>
                ) : (
                  <span className="italic text-muted-foreground">Ingen adress angiven</span>
                )}
                {onEditAddress && (
                  <button
                    type="button"
                    onClick={onEditAddress}
                    className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-primary"
                  >
                    <Pencil className="h-3 w-3" /> Redigera
                  </button>
                )}
              </div>
            </Row>
          )}

          {(contactName || contactPhone || contactEmail) && (
            <Row icon={User} label="Leveranskontakt">
              <div className="space-y-1">
                {contactName && <div className="font-medium">{contactName}</div>}
                <div className="flex flex-wrap gap-2">
                  {contactPhone && (
                    <a
                      href={`tel:${contactPhone.replace(/\s+/g, "")}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20"
                    >
                      <Phone className="w-3 h-3" />{contactPhone}
                    </a>
                  )}
                  {contactEmail && (
                    <a
                      href={`mailto:${contactEmail}`}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-muted text-foreground text-xs font-medium hover:bg-muted/80"
                    >
                      <Mail className="w-3 h-3" />
                      <span className="truncate max-w-[180px]">{contactEmail}</span>
                    </a>
                  )}
                </div>
              </div>
            </Row>
          )}

          {fmt(rigdaydate) && (
            <Row icon={Calendar} label="Riggdatum">{fmt(rigdaydate)}</Row>
          )}
          {fmt(eventdate) && (
            <Row icon={Calendar} label="Eventdatum">{fmt(eventdate)}</Row>
          )}
          {fmt(rigdowndate) && (
            <Row icon={Calendar} label="Rigg ned">{fmt(rigdowndate)}</Row>
          )}

          {exactTimeNeeded && exactTimeInfo && (
            <Row icon={Clock} label="Exakt tid">{exactTimeInfo}</Row>
          )}

          {carryLabel && (
            <Row icon={AlertTriangle} label="Bärväg">{carryLabel}</Row>
          )}

          {nailsLabel && (
            <Row icon={AlertTriangle} label="Markspik">{nailsLabel}</Row>
          )}

        </div>
      </div>
    </Card>
  );
};

export default CustomerInfoBlock;
