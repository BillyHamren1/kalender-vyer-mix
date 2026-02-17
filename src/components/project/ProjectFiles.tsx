import { useRef } from "react";
import { Upload, File, FileText, Image, Trash2, Download, Loader2, Lock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { ProjectFile } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface BookingAttachment {
  id: string;
  booking_id: string;
  url: string;
  file_name: string | null;
  file_type: string | null;
  uploaded_at: string;
}

interface ProjectFilesProps {
  files: ProjectFile[];
  onUpload: (data: { file: File; uploadedBy?: string }) => void;
  onDelete: (data: { id: string; url: string }) => void;
  isUploading: boolean;
  bookingAttachments?: BookingAttachment[];
}

const ProjectFiles = ({ files, onUpload, onDelete, isUploading, bookingAttachments = [] }: ProjectFilesProps) => {
  const inputRef = useRef<HTMLInputElement>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onUpload({ file });
      e.target.value = '';
    }
  };

  const getFileIcon = (fileType: string | null) => {
    if (fileType?.startsWith('image/')) return Image;
    if (fileType?.includes('pdf') || fileType?.includes('document')) return FileText;
    return File;
  };

  const hasBookingAttachments = bookingAttachments.length > 0;

  return (
    <Card className="border-border/40 shadow-2xl rounded-2xl">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-4">
        <CardTitle className="tracking-tight">Filer</CardTitle>
        <div>
          <input
            ref={inputRef}
            type="file"
            className="hidden"
            onChange={handleFileChange}
            accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.gif"
          />
          <Button
            size="sm"
            onClick={() => inputRef.current?.click()}
            disabled={isUploading}
          >
            {isUploading ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <Upload className="h-4 w-4 mr-2" />
            )}
            Ladda upp
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-6">

        {/* Booking attachments – read-only thumbnail grid */}
        {hasBookingAttachments && (
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Lock className="h-3.5 w-3.5 text-muted-foreground" />
              <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
                Bilder från bokning ({bookingAttachments.length})
              </h3>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {bookingAttachments.map(att => {
                const isImage = att.file_type?.startsWith('image/') ?? true;
                return (
                  <button
                    key={att.id}
                    onClick={() => window.open(att.url, '_blank')}
                    className="group relative aspect-square rounded-xl overflow-hidden border border-border/40 bg-muted hover:border-primary/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                    title={att.file_name || 'Bokningsbild'}
                  >
                    {isImage ? (
                      <img
                        src={att.url}
                        alt={att.file_name || 'Bokningsbild'}
                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-200"
                        loading="lazy"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <File className="h-8 w-8 text-muted-foreground" />
                      </div>
                    )}
                    <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/70 to-transparent p-2 opacity-0 group-hover:opacity-100 transition-opacity">
                      <p className="text-white text-xs truncate">{att.file_name || 'Bokningsbild'}</p>
                    </div>
                  </button>
                );
              })}
            </div>
            <Separator className="mt-6" />
          </div>
        )}

        {/* Uploaded project files */}
        <div>
          {hasBookingAttachments && (
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3">
              Uppladdade filer
            </h3>
          )}
          {files.length === 0 ? (
            <div className="text-center py-8 border-2 border-dashed border-border/40 rounded-xl">
              <Upload className="h-8 w-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-muted-foreground">
                Inga filer uppladdade ännu
              </p>
              <p className="text-sm text-muted-foreground mt-1">
                Dra och släpp eller klicka på "Ladda upp"
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              {files.map(file => {
                const FileIcon = getFileIcon(file.file_type);
                const isImage = file.file_type?.startsWith('image/');

                return (
                  <div
                    key={file.id}
                    className="flex items-center gap-3 p-3 rounded-xl border border-border/40 bg-card hover:bg-muted/30 transition-colors group"
                  >
                    {isImage ? (
                      <img
                        src={file.url}
                        alt={file.file_name}
                        className="h-10 w-10 object-cover rounded"
                      />
                    ) : (
                      <div
                        className="h-10 w-10 flex items-center justify-center rounded-xl"
                        style={{ background: 'var(--gradient-icon)', boxShadow: 'var(--shadow-icon)' }}
                      >
                        <FileIcon className="h-5 w-5 text-primary-foreground" />
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.file_name}</p>
                      <p className="text-sm text-muted-foreground">
                        {format(new Date(file.uploaded_at), 'd MMM yyyy', { locale: sv })}
                      </p>
                    </div>

                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => window.open(file.url, '_blank')}
                      >
                        <Download className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => onDelete({ id: file.id, url: file.url })}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </CardContent>
    </Card>
  );
};

export default ProjectFiles;
