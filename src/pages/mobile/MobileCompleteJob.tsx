import { useState, useRef, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useMobileBookingDetails, useInvalidateMobileData } from '@/hooks/useMobileData';
import { mobileApi } from '@/services/mobileApiService';
import { MobileBackHeader } from '@/components/mobile-app/MobileHeader';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { Loader2, Camera, X, CheckCircle2 } from 'lucide-react';
import { toast } from 'sonner';
import { takePhotoBase64 } from '@/utils/capacitorCamera';
import { useLanguage } from '@/i18n/LanguageContext';

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
  return name.startsWith('└') || name.startsWith('↳') || name.startsWith('L,') || name.startsWith('└,') || name.startsWith('  ↳') || name.startsWith('  └') || name.startsWith('⦿');
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

interface PendingImage {
  id: string;
  base64: string;
  fileName: string;
  fileType: string;
}

const MobileCompleteJob = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { data: bookingData, isLoading } = useMobileBookingDetails(id);
  const { invalidateBookingDetails } = useInvalidateMobileData();
  const booking = bookingData?.booking ?? null;
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [checkedIds, setCheckedIds] = useState<Set<string>>(new Set());
  const [comment, setComment] = useState('');
  const [images, setImages] = useState<PendingImage[]>([]);
  const [isSaving, setIsSaving] = useState(false);

  const products: ProductItem[] = useMemo(() => booking?.products || [], [booking]);
  const groups = useMemo(() => groupProducts(products), [products]);

  const allProductIds = useMemo(() => products.map(p => p.id), [products]);
  const allChecked = allProductIds.length > 0 && allProductIds.every(id => checkedIds.has(id));

  const toggleProduct = (productId: string) => {
    setCheckedIds(prev => {
      const next = new Set(prev);
      if (next.has(productId)) next.delete(productId);
      else next.add(productId);
      return next;
    });
  };

  const toggleAll = () => {
    if (allChecked) setCheckedIds(new Set());
    else setCheckedIds(new Set(allProductIds));
  };

  const handleCameraClick = async () => {
    const base64 = await takePhotoBase64();
    if (base64) {
      setImages(prev => [...prev, {
        id: crypto.randomUUID(),
        base64,
        fileName: `completion_${Date.now()}.jpg`,
        fileType: 'image/jpeg',
      }]);
    } else {
      fileInputRef.current?.click();
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;
    Array.from(files).forEach(file => {
      const reader = new FileReader();
      reader.onload = () => {
        setImages(prev => [...prev, {
          id: crypto.randomUUID(),
          base64: reader.result as string,
          fileName: file.name,
          fileType: file.type || 'image/jpeg',
        }]);
      };
      reader.readAsDataURL(file);
    });
    e.target.value = '';
  };

  const removeImage = (imageId: string) => {
    setImages(prev => prev.filter(i => i.id !== imageId));
  };

  const handleSubmit = async () => {
    if (!id || !booking) return;
    setIsSaving(true);

    try {
      const pcs = t('complete.pcs');
      const checklistLines = groups.flatMap(group => {
        const lines: string[] = [];
        const parentChecked = checkedIds.has(group.parent.id);
        lines.push(`${parentChecked ? '✅' : '⬜'} ${cleanProductName(group.parent.name)} (${group.parent.quantity} ${pcs})`);
        for (const child of group.children) {
          const childChecked = checkedIds.has(child.id);
          lines.push(`   ${childChecked ? '✅' : '⬜'} ${cleanProductName(child.name)} (${child.quantity} ${pcs})`);
        }
        return lines;
      });

      const checkedCount = checkedIds.size;
      const totalCount = allProductIds.length;

      let fullComment = t('complete.headerTpl', { checked: checkedCount, total: totalCount, lines: checklistLines.join('\n') });
      if (comment.trim()) fullComment += t('complete.commentBlock', { text: comment.trim() });
      if (images.length > 0) fullComment += t('complete.imagesBlock', { n: images.length });

      await mobileApi.createComment({ booking_id: id, content: fullComment });

      for (const img of images) {
        await mobileApi.uploadFile({
          booking_id: id,
          file_name: img.fileName,
          file_data: img.base64,
          file_type: img.fileType,
        });
      }

      invalidateBookingDetails(id);
      toast.success(t('complete.savedToast'));
      navigate(`/m/job/${id}`);
    } catch (err: any) {
      toast.error(err.message || t('complete.couldNotSave'));
    } finally {
      setIsSaving(false);
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <Loader2 className="w-7 h-7 animate-spin text-primary" />
      </div>
    );
  }

  if (!booking) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-card">
        <p className="text-muted-foreground">{t('complete.notFound')}</p>
      </div>
    );
  }

  const pcs = t('complete.pcs');

  return (
    <div className="flex flex-col min-h-screen bg-card pb-32">
      <MobileBackHeader title={t('complete.title')} subtitle={booking.client} backTo={`/m/job/${id}`} />

      <div className="flex-1 px-4 py-4 space-y-5">
        <section>
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-semibold text-foreground">{t('complete.checklistHeader')}</h2>
            <button onClick={toggleAll} className="text-xs text-primary font-medium">
              {allChecked ? t('complete.uncheckAll') : t('complete.checkAll')}
            </button>
          </div>

          {groups.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('complete.noProducts')}</p>
          ) : (
            <div className="space-y-1">
              {groups.map(group => (
                <div key={group.parent.id}>
                  <label className="flex items-start gap-3 p-3 rounded-xl bg-muted/30 border border-border cursor-pointer active:bg-muted/50 transition-colors">
                    <Checkbox
                      checked={checkedIds.has(group.parent.id)}
                      onCheckedChange={() => toggleProduct(group.parent.id)}
                      className="mt-0.5"
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium text-foreground leading-snug">{cleanProductName(group.parent.name)}</p>
                      <p className="text-xs text-muted-foreground">{group.parent.quantity} {pcs}</p>
                    </div>
                  </label>

                  {group.children.map(child => (
                    <label key={child.id} className="flex items-start gap-3 p-2.5 pl-8 rounded-lg cursor-pointer active:bg-muted/30 transition-colors">
                      <Checkbox
                        checked={checkedIds.has(child.id)}
                        onCheckedChange={() => toggleProduct(child.id)}
                        className="mt-0.5"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-foreground leading-snug">{cleanProductName(child.name)}</p>
                        <p className="text-xs text-muted-foreground">{child.quantity} {pcs}</p>
                      </div>
                    </label>
                  ))}
                </div>
              ))}
            </div>
          )}
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">{t('complete.commentLabel')}</h2>
          <Textarea
            value={comment}
            onChange={e => setComment(e.target.value)}
            placeholder={t('complete.commentPlaceholder')}
            rows={3}
            className="bg-muted/30 border-border"
          />
        </section>

        <section>
          <h2 className="text-sm font-semibold text-foreground mb-2">{t('complete.imagesLabel')}</h2>
          <div className="flex gap-2 flex-wrap">
            {images.map(img => (
              <div key={img.id} className="relative w-20 h-20 rounded-xl overflow-hidden border border-border">
                <img src={img.base64} alt="" className="w-full h-full object-cover" />
                <button
                  onClick={() => removeImage(img.id)}
                  className="absolute top-0.5 right-0.5 w-5 h-5 rounded-full bg-destructive text-destructive-foreground flex items-center justify-center"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
            <button
              onClick={handleCameraClick}
              className="w-20 h-20 rounded-xl border-2 border-dashed border-border flex flex-col items-center justify-center gap-1 text-muted-foreground active:bg-muted/30 transition-colors"
            >
              <Camera className="w-5 h-5" />
              <span className="text-[10px]">{t('complete.photoShort')}</span>
            </button>
          </div>
          <input ref={fileInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleFileSelect} />
        </section>
      </div>

      <div className="fixed bottom-0 left-0 right-0 p-4 bg-card border-t border-border safe-area-bottom">
        <Button onClick={handleSubmit} disabled={isSaving} className="w-full h-12 text-base font-semibold rounded-xl">
          {isSaving ? <Loader2 className="w-5 h-5 animate-spin mr-2" /> : <CheckCircle2 className="w-5 h-5 mr-2" />}
          {t('complete.completeButton')}
        </Button>
      </div>
    </div>
  );
};

export default MobileCompleteJob;
