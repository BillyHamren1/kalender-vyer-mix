import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Search, Package, Calendar, MapPin } from 'lucide-react';
import { fetchActivePackings } from '@/services/scannerService';
import { PackingWithBooking } from '@/types/packing';
import { format } from 'date-fns';
import { sv } from 'date-fns/locale';

interface PackingSelectorProps {
  onSelect: (packingId: string) => void;
}

export const PackingSelector: React.FC<PackingSelectorProps> = ({ onSelect }) => {
  const [packings, setPackings] = useState<PackingWithBooking[]>([]);
  const [filteredPackings, setFilteredPackings] = useState<PackingWithBooking[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadPackings = async () => {
      try {
        setIsLoading(true);
        const data = await fetchActivePackings();
        setPackings(data);
        setFilteredPackings(data);
      } catch (err: any) {
        setError(err.message || 'Kunde inte hämta packlistor');
      } finally {
        setIsLoading(false);
      }
    };

    loadPackings();
  }, []);

  useEffect(() => {
    const query = searchQuery.toLowerCase();
    const filtered = packings.filter(packing => 
      packing.name.toLowerCase().includes(query) ||
      packing.booking?.client?.toLowerCase().includes(query) ||
      packing.booking?.booking_number?.toLowerCase().includes(query)
    );
    setFilteredPackings(filtered);
  }, [searchQuery, packings]);

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return 'bg-blue-500/10 text-blue-700 border-blue-200';
      case 'in_progress':
        return 'bg-yellow-500/10 text-yellow-700 border-yellow-200';
      case 'completed':
        return 'bg-green-500/10 text-green-700 border-green-200';
      default:
        return 'bg-muted text-muted-foreground';
    }
  };

  const getStatusText = (status: string) => {
    switch (status) {
      case 'active': return 'Aktiv';
      case 'in_progress': return 'Pågående';
      case 'completed': return 'Klar';
      default: return status;
    }
  };

  if (isLoading) {
    return (
      <div className="space-y-3">
        {[1, 2, 3].map(i => (
          <Card key={i}>
            <CardContent className="p-4">
              <Skeleton className="h-5 w-3/4 mb-2" />
              <Skeleton className="h-4 w-1/2 mb-2" />
              <Skeleton className="h-4 w-2/3" />
            </CardContent>
          </Card>
        ))}
      </div>
    );
  }

  if (error) {
    return (
      <div className="text-center py-8">
        <p className="text-destructive">{error}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          type="search"
          placeholder="Sök packlista, kund..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-10"
        />
      </div>

      {/* Packing list */}
      <div className="space-y-3">
        {filteredPackings.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
            <p>Inga packlistor hittades</p>
          </div>
        ) : (
          filteredPackings.map(packing => (
            <Card 
              key={packing.id}
              className="cursor-pointer hover:bg-accent/50 transition-colors active:scale-[0.99]"
              onClick={() => onSelect(packing.id)}
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between mb-2">
                  <h3 className="font-semibold text-base line-clamp-1">
                    {packing.name}
                  </h3>
                  <Badge variant="outline" className={getStatusColor(packing.status)}>
                    {getStatusText(packing.status)}
                  </Badge>
                </div>
                
                {packing.booking && (
                  <div className="space-y-1 text-sm text-muted-foreground">
                    <div className="flex items-center gap-2">
                      <Package className="h-3.5 w-3.5" />
                      <span>{packing.booking.client}</span>
                      {packing.booking.booking_number && (
                        <span className="text-xs opacity-70">
                          #{packing.booking.booking_number}
                        </span>
                      )}
                    </div>
                    
                    {packing.booking.eventdate && (
                      <div className="flex items-center gap-2">
                        <Calendar className="h-3.5 w-3.5" />
                        <span>
                          {format(new Date(packing.booking.eventdate), 'd MMM yyyy', { locale: sv })}
                        </span>
                      </div>
                    )}
                    
                    {packing.booking.deliveryaddress && (
                      <div className="flex items-center gap-2">
                        <MapPin className="h-3.5 w-3.5" />
                        <span className="line-clamp-1">{packing.booking.deliveryaddress}</span>
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          ))
        )}
      </div>
    </div>
  );
};
