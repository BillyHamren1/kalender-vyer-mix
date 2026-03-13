import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { sv } from 'date-fns/locale';
import { Calendar, ChevronDown, ChevronRight, Clock, ClipboardCheck, FileText, StickyNote, MessageSquare, Send, Loader2 } from 'lucide-react';
import InspectionWizard from '@/components/mobile-app/inspection/InspectionWizard';
import { mobileApi } from '@/services/mobileApiService';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';

interface JobInfoTabProps {
  booking: any;
  bookingId: string;
  onCommentsUpdated?: () => void;
}

// --- Product grouping logic (mirrors desktop ProductsList.tsx) ---

interface ProductItem {
  id: string;
  name: string;
  quantity: number;
  notes?: string;
  parent_product_id?: string;
  parent_package_id?: string;
  is_package_component?: boolean;
}

interface ProductGroup {
  parent: ProductItem;
  children: ProductItem[];
}

const cleanProductName = (name: string): string => {
  return name
    .replace(/^[└↳]\s*,?\s*/, '')
    .replace(/^L,\s*/, '')
    .replace(/^⦿\s*/, '')
    .replace(/^\s+/, '')
    .trim();
};

const isChildProduct = (product: ProductItem): boolean => {
  if (product.parent_product_id) return true;
  if (product.parent_package_id) return true;
  if (product.is_package_component) return true;
  const name = product.name || '';
  return name.startsWith('└') || 
         name.startsWith('↳') || 
         name.startsWith('L,') || 
         name.startsWith('└,') ||
         name.startsWith('  ↳') ||
         name.startsWith('  └') ||
         name.startsWith('⦿');
};

const groupProducts = (products: ProductItem[]): ProductGroup[] => {
  const groups: ProductGroup[] = [];
  const childProducts = products.filter(p => isChildProduct(p));

  const childrenByParentId = new Map<string, ProductItem[]>();
  for (const child of childProducts) {
    const parentId = child.parent_product_id || child.parent_package_id;
    if (parentId) {
      const existing = childrenByParentId.get(parentId) || [];
      existing.push(child);
      childrenByParentId.set(parentId, existing);
    }
  }

  let currentParent: ProductItem | null = null;
  let currentSequentialChildren: ProductItem[] = [];

  for (const product of products) {
    if (!isChildProduct(product)) {
      if (currentParent) {
        const idChildren = childrenByParentId.get(currentParent.id) || [];
        const merged = [...new Map([...idChildren, ...currentSequentialChildren].map(c => [c.id, c])).values()];
        groups.push({ parent: currentParent, children: merged });
      }
      currentParent = product;
      currentSequentialChildren = [];
    } else {
      if (!product.parent_product_id && !product.parent_package_id) {
        currentSequentialChildren.push(product);
      }
    }
  }

  if (currentParent) {
    const idChildren = childrenByParentId.get(currentParent.id) || [];
    const merged = [...new Map([...idChildren, ...currentSequentialChildren].map(c => [c.id, c])).values()];
    groups.push({ parent: currentParent, children: merged });
  }

  return groups;
};

// --- Sub-components ---

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
    <div className="rounded-xl border border-border/50 bg-card p-3">
      <p className="text-[10px] font-bold uppercase tracking-widest text-primary mb-1">{label}</p>
      <p className="text-sm font-semibold text-foreground">
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

const ProductGroupRow = ({ group }: { group: ProductGroup }) => {
  const [isOpen, setIsOpen] = useState(false);
  const hasChildren = group.children.length > 0;

  return (
    <div className="border-b last:border-0 border-border/50">
      <button
        type="button"
        onClick={() => hasChildren && setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between text-sm py-2 text-left"
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {hasChildren && (
            isOpen
              ? <ChevronDown className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              : <ChevronRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          )}
          <span className="font-medium text-foreground truncate">
            {cleanProductName(group.parent.name)}
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0 ml-2">
          {hasChildren && (
            <span className="text-[10px] bg-muted text-muted-foreground px-1.5 py-0.5 rounded font-medium">
              +{group.children.length}
            </span>
          )}
          <span className="text-muted-foreground text-xs">{group.parent.quantity} st</span>
        </div>
      </button>

      {isOpen && hasChildren && (
        <div className="pl-5 pb-2 space-y-0.5 border-l-2 border-muted ml-2">
          {group.children.map((child) => (
            <div key={child.id} className="flex items-center justify-between text-sm py-1 text-muted-foreground">
              <span className="text-xs truncate">
                {cleanProductName(child.name)}
              </span>
              <span className="text-xs shrink-0 ml-2">{child.quantity} st</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

// --- Comments section ---

const CommentsSection = ({ bookingId, comments: initialComments, onCommentsUpdated }: { bookingId: string; comments: any[]; onCommentsUpdated?: () => void }) => {
  const [comments, setComments] = useState(initialComments || []);
  const [newComment, setNewComment] = useState('');
  const [isSending, setIsSending] = useState(false);

  const handleSend = async () => {
    if (!newComment.trim()) return;
    setIsSending(true);
    try {
      await mobileApi.createComment({ booking_id: bookingId, content: newComment.trim() });
      // Optimistic update
      setComments(prev => [...prev, {
        id: `temp-${Date.now()}`,
        content: newComment.trim(),
        author_name: 'Du',
        created_at: new Date().toISOString(),
      }]);
      setNewComment('');
      toast.success('Kommentar skickad');
      onCommentsUpdated?.();
    } catch (err: any) {
      toast.error(err.message || 'Kunde inte skicka kommentar');
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <MessageSquare className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Kommentarer</p>
      </div>

      {comments.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {comments.map((c: any) => (
            <div key={c.id} className="bg-muted/50 rounded-lg p-2.5">
              <div className="flex items-center justify-between gap-2 mb-1">
                <span className="text-xs font-semibold text-foreground">{c.author_name}</span>
                {c.created_at && (
                  <span className="text-[10px] text-muted-foreground">
                    {format(parseISO(c.created_at), 'd MMM HH:mm', { locale: sv })}
                  </span>
                )}
              </div>
              <p className="text-xs text-foreground/80 whitespace-pre-wrap">{c.content}</p>
            </div>
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <Textarea
          value={newComment}
          onChange={e => setNewComment(e.target.value)}
          placeholder="Skriv en kommentar..."
          className="min-h-[40px] rounded-xl text-sm flex-1"
          rows={1}
        />
        <button
          onClick={handleSend}
          disabled={isSending || !newComment.trim()}
          className="w-10 h-10 rounded-xl bg-primary text-primary-foreground flex items-center justify-center shrink-0 disabled:opacity-50 active:scale-95 transition-all"
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </button>
      </div>
    </div>
  );
};

// --- Main component ---

const JobInfoTab = ({ booking, bookingId, onCommentsUpdated }: JobInfoTabProps) => {
  const [showInspection, setShowInspection] = useState(false);
  const products: ProductItem[] = booking.products || [];
  const groups = groupProducts(products);
  const comments = booking.project?.comments || [];

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

      {/* Comments */}
      <CommentsSection bookingId={bookingId} comments={comments} onCommentsUpdated={onCommentsUpdated} />

      {/* Products - grouped hierarchy */}
      {groups.length > 0 && (
        <div className="rounded-xl border bg-card p-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground mb-2">Produkter</p>
          <div>
            {groups.map((group) => (
              <ProductGroupRow key={group.parent.id} group={group} />
            ))}
          </div>
        </div>
      )}
      {/* Inspection button */}
      <button
        type="button"
        onClick={() => setShowInspection(true)}
        className="w-full flex items-center justify-center gap-2 py-3 rounded-xl bg-primary text-primary-foreground font-semibold text-sm active:scale-[0.98] transition-all shadow-md"
      >
        <ClipboardCheck className="w-4.5 h-4.5" />
        Skapa besiktning
      </button>

      {showInspection && (
        <InspectionWizard bookingId={bookingId} onClose={() => setShowInspection(false)} />
      )}
    </div>
  );
};

export default JobInfoTab;
