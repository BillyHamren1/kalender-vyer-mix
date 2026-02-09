import React, { useState, useEffect } from 'react';
import { Star, X, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { toast } from 'sonner';

interface AddressFavorite {
  id: string;
  label: string;
  fullAddress: string;
  latitude?: number;
  longitude?: number;
}

interface AddressFavoritesProps {
  currentAddress?: string;
  currentLat?: number;
  currentLng?: number;
  onSelect: (address: string, lat?: number, lng?: number) => void;
}

const STORAGE_KEY = 'transport-address-favorites';

const loadFavorites = (): AddressFavorite[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

const saveFavorites = (favorites: AddressFavorite[]) => {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(favorites));
};

export const AddressFavorites: React.FC<AddressFavoritesProps> = ({
  currentAddress,
  currentLat,
  currentLng,
  onSelect,
}) => {
  const [favorites, setFavorites] = useState<AddressFavorite[]>(loadFavorites);
  const [isAdding, setIsAdding] = useState(false);
  const [newLabel, setNewLabel] = useState('');

  useEffect(() => {
    saveFavorites(favorites);
  }, [favorites]);

  const canSave = !!currentAddress && currentAddress.trim().length > 2 && !!currentLat && !!currentLng;

  const handleStartAdd = () => {
    // Pre-fill label with a short version of the address (first part before comma)
    const shortLabel = currentAddress?.split(',')[0]?.trim() || '';
    setNewLabel(shortLabel);
    setIsAdding(true);
  };

  const handleSave = () => {
    if (!newLabel.trim() || !currentAddress) return;

    const duplicate = favorites.some(
      (f) => f.fullAddress === currentAddress || f.label === newLabel.trim()
    );
    if (duplicate) {
      toast.error('Denna adress eller namn finns redan bland favoriter');
      return;
    }

    const newFav: AddressFavorite = {
      id: crypto.randomUUID(),
      label: newLabel.trim(),
      fullAddress: currentAddress,
      latitude: currentLat,
      longitude: currentLng,
    };

    setFavorites((prev) => [...prev, newFav]);
    setIsAdding(false);
    setNewLabel('');
    toast.success(`"${newFav.label}" sparad som favorit`);
  };

  const handleRemove = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setFavorites((prev) => prev.filter((f) => f.id !== id));
    toast('Favorit borttagen');
  };

  const handleSelect = (fav: AddressFavorite) => {
    onSelect(fav.fullAddress, fav.latitude, fav.longitude);
  };

  return (
    <div className="space-y-2">
      {/* Save button */}
      {canSave && !isAdding && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={handleStartAdd}
          className="h-7 gap-1.5 text-xs text-muted-foreground hover:text-foreground px-2"
        >
          <Star className="h-3.5 w-3.5" />
          Spara som favorit
        </Button>
      )}

      {/* Inline input for naming the favorite */}
      {isAdding && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            value={newLabel}
            onChange={(e) => setNewLabel(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSave();
              if (e.key === 'Escape') setIsAdding(false);
            }}
            placeholder="Ge favoriten ett namn..."
            className="h-8 text-sm rounded-lg"
          />
          <Button
            type="button"
            size="sm"
            onClick={handleSave}
            disabled={!newLabel.trim()}
            className="h-8 rounded-lg gap-1 px-3"
          >
            <Plus className="h-3.5 w-3.5" />
            Spara
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setIsAdding(false)}
            className="h-8 rounded-lg px-2"
          >
            Avbryt
          </Button>
        </div>
      )}

      {/* Favorites list */}
      {favorites.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {favorites.map((fav) => (
            <button
              key={fav.id}
              type="button"
              onClick={() => handleSelect(fav)}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium bg-accent/60 hover:bg-accent text-accent-foreground transition-colors border border-border/50"
            >
              <Star className="h-3 w-3 text-amber-500 fill-amber-500" />
              {fav.label}
              <span
                role="button"
                tabIndex={0}
                onClick={(e) => handleRemove(fav.id, e)}
                onKeyDown={(e) => { if (e.key === 'Enter') handleRemove(fav.id, e as any); }}
                className="ml-0.5 rounded-full p-0.5 hover:bg-destructive/20 hover:text-destructive transition-colors"
              >
                <X className="h-3 w-3" />
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
