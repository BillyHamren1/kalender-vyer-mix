import { FileImage, FileText, ExternalLink } from 'lucide-react';

interface BookingAttachment {
  id?: string;
  url: string;
  file_name?: string | null;
  name?: string | null;
  file_type?: string | null;
  uploaded_at?: string | null;
}

interface JobAttachmentsSectionProps {
  attachments: BookingAttachment[];
}

const IMAGE_EXTENSIONS = ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'];

const isImageFile = (attachment: BookingAttachment) => {
  const fileName = attachment.file_name || attachment.name || attachment.url || '';
  const ext = fileName.split('.').pop()?.toLowerCase() || '';
  return Boolean(attachment.file_type?.startsWith('image/')) || IMAGE_EXTENSIONS.includes(ext);
};

const dedupeAttachments = (attachments: BookingAttachment[]) => {
  const seen = new Set<string>();
  return attachments.filter((attachment) => {
    const key = attachment.id || attachment.url;
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
};

const JobAttachmentsSection = ({ attachments }: JobAttachmentsSectionProps) => {
  const deduped = dedupeAttachments(attachments);
  if (deduped.length === 0) return null;

  const imageAttachments = deduped.filter(isImageFile);
  const documentAttachments = deduped.filter((attachment) => !isImageFile(attachment));

  return (
    <div className="rounded-xl border bg-card p-3 space-y-3">
      <div className="flex items-center gap-2">
        <FileText className="w-4 h-4 text-muted-foreground" />
        <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">Bilagor</p>
      </div>

      {imageAttachments.length > 0 && (
        <div className="grid grid-cols-2 gap-2">
          {imageAttachments.map((attachment) => {
            const name = attachment.file_name || attachment.name || 'Bild';
            return (
              <a
                key={attachment.id || attachment.url}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="group overflow-hidden rounded-xl border bg-muted aspect-video"
                aria-label={`Öppna ${name}`}
              >
                <img
                  src={attachment.url}
                  alt={name}
                  className="h-full w-full object-cover transition-transform duration-200 group-active:scale-[0.98]"
                  loading="lazy"
                />
              </a>
            );
          })}
        </div>
      )}

      {documentAttachments.length > 0 && (
        <div className="space-y-2">
          {documentAttachments.map((attachment) => {
            const name = attachment.file_name || attachment.name || 'Fil';
            return (
              <a
                key={attachment.id || attachment.url}
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-xl border bg-background px-3 py-2.5 active:scale-[0.98] transition-transform"
              >
                <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted text-muted-foreground shrink-0">
                  {isImageFile(attachment) ? <FileImage className="w-5 h-5" /> : <FileText className="w-5 h-5" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-foreground">{name}</p>
                  <p className="text-[11px] text-muted-foreground">Öppna fil</p>
                </div>
                <ExternalLink className="w-4 h-4 text-muted-foreground shrink-0" />
              </a>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default JobAttachmentsSection;