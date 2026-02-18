import { useRef } from "react";
import { Upload, File, FileText, Image, Trash2, Download, Loader2 } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ProjectFile } from "@/types/project";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface ProjectFilesProps {
  files: ProjectFile[];
  onUpload: (data: { file: File; uploadedBy?: string }) => void;
  onDelete: (data: { id: string; url: string }) => void;
  isUploading: boolean;
}

const ProjectFiles = ({ files, onUpload, onDelete, isUploading }: ProjectFilesProps) => {
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

        {/* Uploaded project files */}
        <div>
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
