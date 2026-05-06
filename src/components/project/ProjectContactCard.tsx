import { Card } from "@/components/ui/card";
import { User, Phone, Mail } from "lucide-react";

interface ProjectContactCardProps {
  contactName?: string | null;
  contactPhone?: string | null;
  contactEmail?: string | null;
  className?: string;
}

/**
 * Visar leveranskontakt från bokningen med direkta ring-/maila-knappar.
 * Renderas både i normala och stora projekt så att fältpersonal och projektledning
 * alltid har kontaktvägen synlig.
 */
const ProjectContactCard = ({
  contactName,
  contactPhone,
  contactEmail,
  className,
}: ProjectContactCardProps) => {
  if (!contactName && !contactPhone && !contactEmail) return null;

  return (
    <Card className={`p-4 border-border/40 rounded-2xl ${className ?? ""}`}>
      <div className="flex items-center gap-2 mb-2">
        <User className="h-4 w-4 text-primary" />
        <span className="text-xs uppercase tracking-wider text-muted-foreground font-semibold">
          Leveranskontakt
        </span>
      </div>
      {contactName && (
        <p className="text-sm font-semibold text-foreground mb-2">{contactName}</p>
      )}
      <div className="flex flex-wrap gap-2">
        {contactPhone && (
          <a
            href={`tel:${contactPhone.replace(/\s+/g, "")}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-medium hover:bg-primary/20 transition-colors"
          >
            <Phone className="w-3.5 h-3.5" />
            {contactPhone}
          </a>
        )}
        {contactEmail && (
          <a
            href={`mailto:${contactEmail}`}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-muted text-foreground text-xs font-medium hover:bg-muted/80 transition-colors"
          >
            <Mail className="w-3.5 h-3.5" />
            <span className="truncate max-w-[220px]">{contactEmail}</span>
          </a>
        )}
      </div>
    </Card>
  );
};

export default ProjectContactCard;
