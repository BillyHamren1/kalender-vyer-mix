import { useOutletContext } from "react-router-dom";
import { Card, CardContent } from "@/components/ui/card";
import type { useLargeProjectDetail } from "@/hooks/useLargeProjectDetail";

const LargeEstablishmentPage = () => {
  const detail = useOutletContext<ReturnType<typeof useLargeProjectDetail>>();
  const { project } = detail;
  const bookings = project?.bookings || [];

  if (!project) return null;

  return (
    <div className="space-y-6">
      <Card className="border-border/40 shadow-2xl rounded-2xl">
        <CardContent className="py-12 text-center text-muted-foreground">
          <p className="text-sm">
            Etableringsschema för storprojekt – visar etablering och avetablering för alla {bookings.length} kopplade bokningar.
          </p>
          <p className="text-xs mt-1">Byggs ut i nästa fas.</p>
        </CardContent>
      </Card>
    </div>
  );
};

export default LargeEstablishmentPage;
