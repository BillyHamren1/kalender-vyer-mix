import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, FileText, StickyNote, ChevronDown, ChevronRight } from 'lucide-react';
import { cn } from '@/lib/utils';

interface JobInfoTabProps {
  booking: any;
}

const InfoRow = ({ label, value, icon: Icon }: { label: string; value: string | null; icon?: any }) => {
  if (!value) return null;
  return (
    <div className="flex items-start gap-3 py-2">
      {Icon && <Icon className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />}
      <div>
        <p className="text-xs text-muted-foreground">{label}</p>
        <p className="text-sm font-medium text-foreground">{value}</p>
      </div>
    </div>
  );
};

const TimeBlock = ({ label, date, start, end }: { label: string; date: string | null; start: string | null; end: string | null }) => {
  if (!date) return null;
  return (
    <div className="rounded-lg border bg-muted/30 p-3">
      <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-1">{label}</p>
      <p className="text-sm font-medium">
        {format(parseISO(date), 'd MMM yyyy', { locale: sv })}
      </p>
      {(start || end) && (
        <p className="text-xs text-muted-foreground mt-0.5">
          {start?.slice(0, 5) || '—'} – {end?.slice(0, 5) || '—'}
        </p>
      )}
    </div>
  );
};

// Detect if a product is a child (accessory or package component)
const isChildProduct = (p: any): boolean => {
  if (p.parent_product_id || p.parent_package_id || p.is_package_component) return true;
  const name = (p.description || p.name || '').trim();
  return name.startsWith('↳') || name.startsWith('└') || name.startsWith('L,');
};

// Clean prefix characters from product names
const cleanName = (name: string): string => {
  return name.replace(/^(↳|└|L,)\s*/, '').trim();
};

// Group products: parent with children underneath
const groupProducts = (products: any[]) => {
  const groups: { parent: any; children: any[] }[] = [];
  let currentGroup: { parent: any; children: any[] } | null = null;

  for (const p of products) {
    if (isChildProduct(p)) {
      if (currentGroup) {
        currentGroup.children.push(p);
      } else {
        // Orphan child — create solo group
        groups.push({ parent: p, children: [] });
      }
    } else {
      currentGroup = { parent: p, children: [] };
      groups.push(currentGroup);
    }
  }

  return groups;
};

const ProductGroup = ({ parent, children }: { parent: any; children: any[] }) => {
  const [expanded, setExpanded] = useState(false);
  const hasChildren = children.length > 0;
  const parentName = cleanName(parent.description || parent.name || '');

  return (
    <div className="border-b last:border-0 border-border/50">
      <button
        onClick={() => hasChildren && setExpanded(!expanded)}
        className={cn(
          "flex items-center justify-between w-full text-left py-2 text-sm",
          hasChildren && "cursor-pointer"
        )}
        disabled={!hasChildren}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasChildren && (
            expanded 
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="text-foreground truncate">{parentName}</span>
          {hasChildren && (
            <span className="text-[10px] text-muted-foreground shrink-0 bg-muted px-1.5 py-0.5 rounded-full">
              {children.length}
            </span>
          )}
        </div>
        {parent.quantity && (
          <span className="text-muted-foreground text-xs shrink-0 ml-2">{parent.quantity} st</span>
        )}
      </button>

      {expanded && children.length > 0 && (
        <div className="pl-5 pb-2 space-y-0.5">
          {children.map((child: any, i: number) => (
            <div key={i} className="flex items-center justify-between text-xs py-1 text-muted-foreground">
              <span className="flex items-center gap-1.5">
                <span className="text-muted-foreground/40">↳</span>
                {cleanName(child.description || child.name || '')}
              </span>
              {child.quantity && <span>{child.quantity} st</span>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

const JobInfoTab = ({ booking }: JobInfoTabProps) => {
  const productGroups = booking.products ? groupProducts(booking.products) : [];

  return (
    <div className="space-y-4">
      {/* Dates */}
      <div className="grid grid-cols-3 gap-2">
        <TimeBlock label="Rigg" date={booking.rigdaydate} start={booking.rig_start_time} end={booking.rig_end_time} />
        <TimeBlock label="Event" date={booking.eventdate} start={booking.event_start_time} end={booking.event_end_time} />
        <TimeBlock label="Riv" date={booking.rigdowndate} start={booking.rigdown_start_time} end={booking.rigdown_end_time} />
      </div>

      {/* Address */}
      {booking.deliveryaddress && (
        <div className="rounded-xl border bg-card p-3">
          <InfoRow label="Leveransadress" value={booking.deliveryaddress} icon={Calendar} />
          {(booking.delivery_postal_code || booking.delivery_city) && (
            <p className="text-xs text-muted-foreground pl-7">
              {[booking.delivery_postal_code, booking.delivery_city].filter(Boolean).join(' ')}
            </p>
          )}
        </div>
      )}

      {/* Project info */}
      {booking.assigned_project_name && (
        <div className="rounded-xl border bg-card p-3">
          <InfoRow label="Projekt" value={booking.assigned_project_name} icon={FileText} />
        </div>
      )}

      {/* Internal notes */}
      {booking.internalnotes && (
        <div className="rounded-xl border bg-card p-3">
          <div className="flex items-start gap-3">
            <StickyNote className="w-4 h-4 text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-xs text-muted-foreground mb-1">Interna anteckningar</p>
              <p className="text-sm text-foreground whitespace-pre-wrap">{booking.internalnotes}</p>
            </div>
          </div>
        </div>
      )}

      {/* Products with collapsible accessories */}
      {productGroups.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Produkter</p>
          <div>
            {productGroups.map((group, i) => (
              <ProductGroup key={i} parent={group.parent} children={group.children} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
};

export default JobInfoTab;
