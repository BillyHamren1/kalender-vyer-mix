import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Package, ExternalLink } from 'lucide-react';

interface PackingStatusCardProps {
  bookingId: string;
}

const STATUS_CONFIG: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline'; className: string }> = {
  planning: { label: 'Ej påbörjad', variant: 'outline', className: 'border-muted-foreground/30 text-muted-foreground' },
  in_progress: { label: 'Pågår', variant: 'default', className: 'bg-yellow-500/15 text-yellow-700 border-yellow-500/30' },
  packed: { label: 'Packad', variant: 'default', className: 'bg-emerald-500/15 text-emerald-700 border-emerald-500/30' },
  delivered: { label: 'Levererad', variant: 'default', className: 'bg-primary/15 text-primary border-primary/30' },
  cancelled: { label: 'Avbokad', variant: 'destructive', className: 'bg-destructive/15 text-destructive border-destructive/30' },
};

const PackingStatusCard: React.FC<PackingStatusCardProps> = ({ bookingId }) => {
  const navigate = useNavigate();

  const { data: packingProject, isLoading } = useQuery({
    queryKey: ['packing-status', bookingId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('packing_projects')
        .select('id, status, name')
        .eq('booking_id', bookingId)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!bookingId,
  });

  if (isLoading) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Packning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-6 w-24 bg-muted animate-pulse rounded" />
        </CardContent>
      </Card>
    );
  }

  if (!packingProject) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Package className="h-4 w-4" />
            Packning
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">Ingen packlista skapad ännu.</p>
        </CardContent>
      </Card>
    );
  }

  const config = STATUS_CONFIG[packingProject.status] || STATUS_CONFIG.planning;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-base flex items-center gap-2">
          <Package className="h-4 w-4" />
          Packning
        </CardTitle>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Badge variant={config.variant} className={config.className}>
          {config.label}
        </Badge>
        <Button
          variant="outline"
          size="sm"
          onClick={() => navigate(`/warehouse/packing/${packingProject.id}`)}
          className="gap-1.5"
        >
          Öppna packlista
          <ExternalLink className="h-3.5 w-3.5" />
        </Button>
      </CardContent>
    </Card>
  );
};

export default PackingStatusCard;
