import { useEffect, useMemo, useState } from "react";
import { Download, Loader2 } from "lucide-react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { toast } from "sonner";
import { getDocument, GlobalWorkerOptions } from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

GlobalWorkerOptions.workerSrc = pdfWorker;

interface PdfPreviewDialogProps {
  fileName: string | null;
  open: boolean;
  pdfUrl: string | null;
  onClose: () => void;
}

const PdfPreviewDialog = ({ fileName, open, pdfUrl, onClose }: PdfPreviewDialogProps) => {
  const [pageImages, setPageImages] = useState<string[]>([]);
  const [isRendering, setIsRendering] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const createdUrls: string[] = [];

    const renderPdf = async () => {
      if (!open || !pdfUrl) {
        setPageImages([]);
        return;
      }

      setIsRendering(true);

      try {
        const loadingTask = getDocument(pdfUrl);
        const pdf = await loadingTask.promise;
        const renderedPages: string[] = [];

        for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
          const page = await pdf.getPage(pageNumber);
          const viewport = page.getViewport({ scale: 1.35 });
          const canvas = document.createElement("canvas");
          const context = canvas.getContext("2d");

          if (!context) {
            throw new Error("canvas_context_missing");
          }

          canvas.width = Math.ceil(viewport.width);
          canvas.height = Math.ceil(viewport.height);

          await page.render({ canvas, canvasContext: context, viewport }).promise;

          const imageUrl = canvas.toDataURL("image/png");
          renderedPages.push(imageUrl);
          createdUrls.push(imageUrl);
        }

        if (!cancelled) {
          setPageImages(renderedPages);
        }
      } catch (error) {
        console.error("Failed to render PDF", error);
        if (!cancelled) {
          setPageImages([]);
          toast.error("Kunde inte visa PDF-filen");
        }
      } finally {
        if (!cancelled) {
          setIsRendering(false);
        }
      }
    };

    void renderPdf();

    return () => {
      cancelled = true;
      setPageImages([]);
      createdUrls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [open, pdfUrl]);

  const title = useMemo(() => fileName || "PDF", [fileName]);

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose()}>
      <DialogContent className="max-w-5xl h-[85vh] p-0 overflow-hidden">
        <div className="flex h-full flex-col bg-background">
          <div className="flex items-center justify-between gap-3 border-b border-border/40 px-4 py-3 pr-12">
            <p className="min-w-0 truncate text-sm font-medium">{title}</p>
            {pdfUrl ? (
              <Button asChild variant="outline" size="sm">
                <a href={pdfUrl} download={title} rel="noopener noreferrer">
                  <Download className="mr-2 h-4 w-4" />
                  Ladda ner
                </a>
              </Button>
            ) : null}
          </div>

          <ScrollArea className="flex-1 bg-muted/20">
            <div className="mx-auto flex w-full max-w-4xl flex-col gap-4 p-4">
              {isRendering ? (
                <div className="flex min-h-[50vh] items-center justify-center text-muted-foreground">
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  Laddar PDF…
                </div>
              ) : null}

              {!isRendering && pageImages.length === 0 ? (
                <div className="flex min-h-[50vh] items-center justify-center text-sm text-muted-foreground">
                  PDF-filen kunde inte renderas.
                </div>
              ) : null}

              {pageImages.map((pageImage, index) => (
                <img
                  key={`${pageImage}-${index}`}
                  src={pageImage}
                  alt={`${title} sida ${index + 1}`}
                  className="w-full rounded-md border border-border/40 bg-background shadow-sm"
                  loading="lazy"
                />
              ))}
            </div>
          </ScrollArea>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default PdfPreviewDialog;