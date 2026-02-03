import { useState, useMemo, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { ArrowLeft, Package, CheckCircle2, User, Clock, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { usePackingList } from "@/hooks/usePackingList";
import { PackingListItem } from "@/types/packing";
import { format } from "date-fns";
import { sv } from "date-fns/locale";
import { cn } from "@/lib/utils";

const PackingVerify = () => {
  const { packingId } = useParams<{ packingId: string }>();
  const [verifierName, setVerifierName] = useState(() => 
    localStorage.getItem("packing-verifier-name") || ""
  );
  const [showNamePrompt, setShowNamePrompt] = useState(false);

  const {
    packing,
    items,
    isLoading,
    updateItem
  } = usePackingList(packingId || "");

  // Save verifier name to localStorage
  useEffect(() => {
    if (verifierName) {
      localStorage.setItem("packing-verifier-name", verifierName);
    }
  }, [verifierName]);

  // Show name prompt if no name is set
  useEffect(() => {
    if (!isLoading && !verifierName) {
      setShowNamePrompt(true);
    }
  }, [isLoading, verifierName]);

  // Calculate progress
  const progress = useMemo(() => {
    let totalToPack = 0;
    let totalPacked = 0;
    let totalVerified = 0;

    items.forEach(item => {
      totalToPack += item.quantity_to_pack;
      totalPacked += item.quantity_packed;
      if (item.verified_at) totalVerified++;
    });

    return {
      total: totalToPack,
      packed: totalPacked,
      verified: totalVerified,
      itemCount: items.length,
      percentage: totalToPack > 0 ? Math.round((totalPacked / totalToPack) * 100) : 0
    };
  }, [items]);

  const handleVerify = (item: PackingListItem) => {
    if (!item.verified_at) {
      updateItem(item.id, {
        verified_by: verifierName || "Okänd",
        verified_at: new Date().toISOString()
      });
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background p-4">
        <Skeleton className="h-8 w-3/4 mb-4" />
        <Skeleton className="h-32 w-full mb-4" />
        <Skeleton className="h-16 w-full mb-2" />
        <Skeleton className="h-16 w-full mb-2" />
        <Skeleton className="h-16 w-full" />
      </div>
    );
  }

  if (!packing) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <Package className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
            <h2 className="text-xl font-semibold mb-2">Packlista hittades inte</h2>
            <p className="text-muted-foreground mb-4">
              Kontrollera att QR-koden är korrekt.
            </p>
            <Link to="/warehouse/packing">
              <Button>
                <ArrowLeft className="h-4 w-4 mr-2" />
                Till packlistan
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Name prompt modal
  if (showNamePrompt) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardHeader>
            <CardTitle className="text-center">Ange ditt namn</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Ditt namn används för att logga vem som verifierat packningen.
            </p>
            <Input
              placeholder="Ditt namn"
              value={verifierName}
              onChange={(e) => setVerifierName(e.target.value)}
              autoFocus
            />
            <Button
              className="w-full"
              onClick={() => setShowNamePrompt(false)}
              disabled={!verifierName.trim()}
            >
              Fortsätt
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 bg-background border-b px-4 py-3">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-semibold text-lg">{packing.name}</h1>
            {packing.booking && (
              <p className="text-sm text-muted-foreground">
                {packing.booking.client}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2 text-sm">
            <User className="h-4 w-4 text-muted-foreground" />
            <span className="font-medium">{verifierName}</span>
          </div>
        </div>
      </div>

      {/* Progress Card */}
      <div className="p-4">
        <Card className="mb-4">
          <CardContent className="pt-4">
            <div className="flex justify-between text-sm mb-2">
              <span className="text-muted-foreground">
                Packat: {progress.packed}/{progress.total}
              </span>
              <span className="font-medium text-primary">{progress.percentage}%</span>
            </div>
            <Progress value={progress.percentage} className="h-3 mb-3" />
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Verifierat: {progress.verified}/{progress.itemCount} artiklar</span>
            </div>
          </CardContent>
        </Card>

        {/* Items list */}
        <div className="space-y-2">
          {items.map(item => {
            const isFullyPacked = item.quantity_packed >= item.quantity_to_pack;
            const isVerified = !!item.verified_at;
            const isAccessory = !!item.product?.parent_product_id;

            return (
              <Card
                key={item.id}
                className={cn(
                  "transition-colors",
                  isVerified && "bg-green-50 dark:bg-green-950/20 border-green-200",
                  !isFullyPacked && "opacity-60"
                )}
              >
                <CardContent className={cn(
                  "p-4 flex items-center gap-3",
                  isAccessory && "ml-4"
                )}>
                  <Checkbox
                    checked={isVerified}
                    onCheckedChange={() => handleVerify(item)}
                    disabled={!isFullyPacked}
                    className="h-6 w-6"
                  />
                  <div className="flex-1 min-w-0">
                    <p className={cn(
                      "font-medium",
                      isVerified && "text-green-700 dark:text-green-300"
                    )}>
                      {isAccessory && <span className="text-muted-foreground mr-1">↳</span>}
                      {item.product?.name || "Okänd produkt"}
                    </p>
                    <div className="flex items-center gap-3 text-xs text-muted-foreground mt-1">
                      <span className={cn(
                        "font-medium",
                        isFullyPacked ? "text-green-600" : "text-yellow-600"
                      )}>
                        {item.quantity_packed}/{item.quantity_to_pack} packade
                      </span>
                      {isVerified && item.verified_by && (
                        <span className="flex items-center gap-1">
                          <CheckCircle2 className="h-3 w-3 text-green-600" />
                          {item.verified_by}
                        </span>
                      )}
                    </div>
                    {isVerified && item.verified_at && (
                      <p className="text-xs text-muted-foreground flex items-center gap-1 mt-1">
                        <Clock className="h-3 w-3" />
                        {format(new Date(item.verified_at), "d MMM HH:mm", { locale: sv })}
                      </p>
                    )}
                  </div>
                  {isFullyPacked && !isVerified && (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => handleVerify(item)}
                    >
                      <Check className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </div>

        {/* All verified message */}
        {progress.verified === progress.itemCount && progress.itemCount > 0 && (
          <Card className="mt-4 bg-green-50 dark:bg-green-950/20 border-green-200">
            <CardContent className="py-6 text-center">
              <CheckCircle2 className="h-12 w-12 mx-auto text-green-600 mb-2" />
              <h3 className="font-semibold text-green-700 dark:text-green-300">
                Alla artiklar verifierade!
              </h3>
              <p className="text-sm text-green-600 dark:text-green-400 mt-1">
                Packlistan är komplett och verifierad.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
};

export default PackingVerify;
