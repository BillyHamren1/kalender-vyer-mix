import { QRCodeSVG } from "qrcode.react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Download, ExternalLink } from "lucide-react";

interface PackingQRCodeProps {
  packingId: string;
  packingName: string;
}

const PackingQRCode = ({ packingId, packingName }: PackingQRCodeProps) => {
  // Generate verification URL
  const verifyUrl = `${window.location.origin}/warehouse/packing/${packingId}/verify`;

  const handleDownload = () => {
    const svg = document.getElementById("packing-qr-code");
    if (!svg) return;

    const svgData = new XMLSerializer().serializeToString(svg);
    const canvas = document.createElement("canvas");
    const ctx = canvas.getContext("2d");
    const img = new Image();

    img.onload = () => {
      canvas.width = img.width;
      canvas.height = img.height;
      ctx?.drawImage(img, 0, 0);
      const pngFile = canvas.toDataURL("image/png");
      
      const downloadLink = document.createElement("a");
      downloadLink.download = `packlista-qr-${packingId}.png`;
      downloadLink.href = pngFile;
      downloadLink.click();
    };

    img.src = "data:image/svg+xml;base64," + btoa(unescape(encodeURIComponent(svgData)));
  };

  const handleOpenVerify = () => {
    window.open(verifyUrl, "_blank");
  };

  return (
    <Card className="bg-muted/50">
      <CardContent className="pt-6">
        <div className="flex flex-col sm:flex-row items-center gap-6">
          <div className="bg-white p-4 rounded-lg shadow-sm">
            <QRCodeSVG
              id="packing-qr-code"
              value={verifyUrl}
              size={160}
              level="M"
              includeMargin={true}
            />
          </div>
          <div className="flex-1 text-center sm:text-left">
            <h3 className="font-semibold mb-2">Skanna för verifiering</h3>
            <p className="text-sm text-muted-foreground mb-4">
              Skanna QR-koden med en mobil enhet för att öppna verifieringssidan.
              Personal kan sedan checka av produkter direkt i mobilen.
            </p>
            <div className="flex flex-wrap gap-2 justify-center sm:justify-start">
              <Button variant="outline" size="sm" onClick={handleDownload}>
                <Download className="h-4 w-4 mr-2" />
                Ladda ner QR
              </Button>
              <Button variant="outline" size="sm" onClick={handleOpenVerify}>
                <ExternalLink className="h-4 w-4 mr-2" />
                Öppna verifiering
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

export default PackingQRCode;
