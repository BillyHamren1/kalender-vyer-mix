import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Cloud, Sun, CloudRain, Snowflake, Wind, Droplets, Thermometer } from 'lucide-react';
import { cn } from '@/lib/utils';

interface WeatherData {
  temperature: number;
  windSpeed: number;
  weatherCode: number;
  precipitation: number;
}

const getWeatherIcon = (code: number) => {
  if (code <= 1) return Sun;
  if (code <= 3) return Cloud;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 51 || (code >= 80 && code <= 82)) return CloudRain;
  return Cloud;
};

const getWeatherLabel = (code: number): string => {
  if (code === 0) return 'Klart';
  if (code <= 3) return 'Molnigt';
  if (code >= 71 && code <= 77) return 'Snö';
  if (code >= 61 && code <= 67) return 'Regn';
  if (code >= 51 && code <= 57) return 'Duggregn';
  if (code >= 80 && code <= 82) return 'Skurar';
  if (code >= 95) return 'Åska';
  if (code >= 45 && code <= 48) return 'Dimma';
  return 'Molnigt';
};

const getRoadWarning = (weather: WeatherData): string | null => {
  if (weather.temperature <= 0 && weather.precipitation > 0) return '⚠️ Risk för halka';
  if (weather.temperature <= -5) return '⚠️ Kraftig kyla – kontrollera fordon';
  if (weather.windSpeed > 15) return '⚠️ Hård vind – kör försiktigt';
  if (weather.precipitation > 5) return '⚠️ Kraftigt regn – sämre sikt';
  return null;
};

const LogisticsWeatherWidget: React.FC = () => {
  const [weather, setWeather] = useState<WeatherData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchWeather = async () => {
      try {
        // Open-Meteo free API - Linköping as default
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=58.41&longitude=15.62&current=temperature_2m,wind_speed_10m,weather_code,precipitation&timezone=Europe/Stockholm'
        );
        const data = await res.json();
        if (data?.current) {
          setWeather({
            temperature: Math.round(data.current.temperature_2m),
            windSpeed: Math.round(data.current.wind_speed_10m),
            weatherCode: data.current.weather_code,
            precipitation: data.current.precipitation || 0,
          });
        }
      } catch {
        // Fallback
        setWeather({ temperature: -2, windSpeed: 5, weatherCode: 3, precipitation: 0 });
      } finally {
        setLoading(false);
      }
    };

    fetchWeather();
    const interval = setInterval(fetchWeather, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  if (loading || !weather) {
    return (
      <Card className="border-border/40 shadow-2xl rounded-2xl">
        <CardContent className="p-4 h-[180px] flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Laddar väder...</p>
        </CardContent>
      </Card>
    );
  }

  const WeatherIcon = getWeatherIcon(weather.weatherCode);
  const label = getWeatherLabel(weather.weatherCode);
  const warning = getRoadWarning(weather);

  return (
    <Card className="border-border/40 shadow-2xl rounded-2xl overflow-hidden">
      <CardContent className="p-0">
        {/* Temperature hero */}
        <div className="px-4 py-4 flex items-center justify-between">
          <div>
            <div className="flex items-baseline gap-1">
              <span className="text-4xl font-bold">{weather.temperature}°</span>
            </div>
            <p className="text-sm text-muted-foreground">{label}</p>
          </div>
          <div className="w-14 h-14 rounded-xl bg-primary/10 flex items-center justify-center">
            <WeatherIcon className="w-7 h-7 text-primary" />
          </div>
        </div>

        {/* Details */}
        <div className="px-4 pb-3 grid grid-cols-2 gap-3">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Wind className="w-3.5 h-3.5" />
            <span>{weather.windSpeed} m/s</span>
          </div>
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Droplets className="w-3.5 h-3.5" />
            <span>{weather.precipitation} mm</span>
          </div>
        </div>

        {/* Road warning */}
        <div className="px-4 pb-4">
          {warning ? (
            <div className="rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium">
              {warning}
            </div>
          ) : (
            <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-700 font-medium">
              ✓ Inga vädervarninngar för trafik
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsWeatherWidget;
