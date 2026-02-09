import React, { useState, useEffect, useRef, useCallback } from 'react';
import { Input } from '@/components/ui/input';
import { MapPin, Check, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';

interface Suggestion {
  mapbox_id: string;
  name: string;
  full_address?: string;
  place_formatted?: string;
}

interface AddressAutocompleteProps {
  value: string;
  onChange: (address: string, lat?: number, lng?: number) => void;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

export const AddressAutocomplete: React.FC<AddressAutocompleteProps> = ({
  value,
  onChange,
  placeholder = 'Sök adress...',
  className,
  disabled,
}) => {
  const [query, setQuery] = useState(value);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGeocoded, setIsGeocoded] = useState(false);
  const [mapboxToken, setMapboxToken] = useState<string | null>(null);
  const [sessionToken, setSessionToken] = useState(() => crypto.randomUUID());
  const containerRef = useRef<HTMLDivElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  // Sync external value changes
  useEffect(() => {
    setQuery(value);
  }, [value]);

  // Fetch mapbox token once
  useEffect(() => {
    const fetchToken = async () => {
      try {
        const { data, error } = await supabase.functions.invoke('mapbox-token');
        if (!error && data?.token) {
          setMapboxToken(data.token);
        }
      } catch (e) {
        console.error('Failed to fetch mapbox token:', e);
      }
    };
    fetchToken();
  }, []);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const searchAddress = useCallback(async (text: string) => {
    if (!mapboxToken || text.length < 2) {
      setSuggestions([]);
      return;
    }

    setIsLoading(true);
    try {
      // Use Mapbox Search Box API - suggest endpoint (designed for autocomplete)
      const url = `https://api.mapbox.com/search/searchbox/v1/suggest?q=${encodeURIComponent(text)}&access_token=${mapboxToken}&session_token=${sessionToken}&country=se&language=sv&limit=5&types=address,street,place`;
      const res = await fetch(url);
      const data = await res.json();

      if (data.suggestions?.length) {
        setSuggestions(data.suggestions);
        setIsOpen(true);
      } else {
        setSuggestions([]);
        setIsOpen(false);
      }
    } catch (err) {
      console.error('Mapbox suggest error:', err);
      setSuggestions([]);
    } finally {
      setIsLoading(false);
    }
  }, [mapboxToken, sessionToken]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setQuery(val);
    setIsGeocoded(false);
    onChange(val); // Update parent with text only

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      searchAddress(val);
    }, 250);
  };

  const handleSelect = async (suggestion: Suggestion) => {
    // Use retrieve endpoint to get full details with coordinates
    if (!mapboxToken) return;

    setIsLoading(true);
    setSuggestions([]);
    setIsOpen(false);

    try {
      const url = `https://api.mapbox.com/search/searchbox/v1/retrieve/${suggestion.mapbox_id}?access_token=${mapboxToken}&session_token=${sessionToken}`;
      const res = await fetch(url);
      const data = await res.json();

      const feature = data.features?.[0];
      if (feature) {
        const address = feature.properties?.full_address || feature.properties?.name || suggestion.full_address || suggestion.name;
        const coords = feature.geometry?.coordinates;
        const lat = coords?.[1];
        const lng = coords?.[0];

        setQuery(address);
        setIsGeocoded(!!lat && !!lng);
        onChange(address, lat, lng);
      } else {
        // Fallback: use suggestion name without coordinates
        const address = suggestion.full_address || suggestion.name;
        setQuery(address);
        onChange(address);
      }
    } catch (err) {
      console.error('Mapbox retrieve error:', err);
      const address = suggestion.full_address || suggestion.name;
      setQuery(address);
      onChange(address);
    } finally {
      setIsLoading(false);
      // Reset session token for next search session
      setSessionToken(crypto.randomUUID());
    }
  };

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Input
          type="text"
          value={query}
          onChange={handleInputChange}
          onFocus={() => { if (suggestions.length) setIsOpen(true); }}
          placeholder={placeholder}
          className={cn('rounded-xl pr-8', className)}
          disabled={disabled}
        />
        <div className="absolute right-2.5 top-1/2 -translate-y-1/2">
          {isLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
          ) : isGeocoded ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <MapPin className="h-4 w-4 text-muted-foreground" />
          )}
        </div>
      </div>

      {isOpen && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-popover border border-border rounded-xl shadow-lg overflow-hidden max-h-[240px] overflow-y-auto">
          {suggestions.map((suggestion) => (
            <button
              key={suggestion.mapbox_id}
              type="button"
              className="w-full text-left px-3 py-2.5 hover:bg-accent/50 transition-colors border-b border-border/30 last:border-0 flex items-start gap-2"
              onClick={() => handleSelect(suggestion)}
            >
              <MapPin className="h-4 w-4 mt-0.5 shrink-0 text-muted-foreground" />
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{suggestion.name}</p>
                {suggestion.place_formatted && (
                  <p className="text-xs text-muted-foreground truncate">{suggestion.place_formatted}</p>
                )}
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
};
