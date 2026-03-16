import React, { useEffect, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Cloud, Sun, CloudRain, Snowflake, Wind, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayForecast {
  date: string;
  dayName: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  windSpeedMax: number;
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

const getDayName = (dateStr: string, index: number): string => {
  if (index === 0) return 'Idag';
  if (index === 1) return 'Imorgon';
  const date = new Date(dateStr);
  const days = ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'];
  return days[date.getDay()];
};

const LogisticsWeeklyWeatherWidget: React.FC = () => {
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=58.41&longitude=15.62&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max,precipitation_sum&timezone=Europe/Stockholm&forecast_days=7'
        );
        const data = await res.json();
        if (data?.daily) {
          const days: DayForecast[] = data.daily.time.map((date: string, i: number) => ({
            date,
            dayName: getDayName(date, i),
            tempMax: Math.round(data.daily.temperature_2m_max[i]),
            tempMin: Math.round(data.daily.temperature_2m_min[i]),
            weatherCode: data.daily.weather_code[i],
            windSpeedMax: Math.round(data.daily.wind_speed_10m_max[i]),
            precipitation: data.daily.precipitation_sum[i] || 0,
          }));
          setForecast(days);
        }
      } catch {
        setForecast([]);
      } finally {
        setLoading(false);
      }
    };

    fetchForecast();
    const interval = setInterval(fetchForecast, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  const windWarnings = forecast.filter(d => d.windSpeedMax > 15);

  if (loading) {
    return (
      <Card className="border-border/40 shadow-lg rounded-2xl">
        <CardContent className="p-4 h-[160px] flex items-center justify-center">
          <p className="text-xs text-muted-foreground">Laddar väderprognos...</p>
        </CardContent>
      </Card>
    );
  }

  if (forecast.length === 0) {
    return (
      <Card className="border-border/40 shadow-lg rounded-2xl">
        <CardContent className="p-4">
          <p className="text-xs text-muted-foreground">Kunde inte hämta väderdata</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className="border-border/40 shadow-lg rounded-2xl overflow-hidden">
      <CardContent className="p-0">
        {/* Wind warnings */}
        {windWarnings.length > 0 && (
          <div className="px-4 pt-3 pb-2 space-y-1.5">
            {windWarnings.map(day => (
              <div
                key={day.date}
                className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs text-destructive font-medium"
              >
                <AlertTriangle className="w-3.5 h-3.5 flex-shrink-0" />
                <span>
                  {day.dayName}: Vindbyar upp till {day.windSpeedMax} m/s – risk för transportstörningar
                </span>
              </div>
            ))}
          </div>
        )}

        {/* 7-day forecast */}
        <div className="px-3 py-3">
          <p className="text-[10px] text-muted-foreground uppercase tracking-wider font-medium px-1 mb-2">
            Veckoprognos – Linköping
          </p>
          <div className="grid grid-cols-7 gap-1">
            {forecast.map((day) => {
              const Icon = getWeatherIcon(day.weatherCode);
              const hasWindWarning = day.windSpeedMax > 15;

              return (
                <div
                  key={day.date}
                  className={cn(
                    "flex flex-col items-center gap-1 py-2 px-1 rounded-xl transition-colors",
                    hasWindWarning && "bg-destructive/5 ring-1 ring-destructive/20"
                  )}
                >
                  <span className="text-[11px] font-medium text-muted-foreground">
                    {day.dayName}
                  </span>
                  <Icon className={cn(
                    "w-5 h-5",
                    hasWindWarning ? "text-destructive" : "text-primary"
                  )} />
                  <div className="text-center">
                    <span className="text-xs font-bold">{day.tempMax}°</span>
                    <span className="text-[10px] text-muted-foreground">/{day.tempMin}°</span>
                  </div>
                  <div className={cn(
                    "flex items-center gap-0.5 text-[10px]",
                    hasWindWarning ? "text-destructive font-semibold" : "text-muted-foreground"
                  )}>
                    <Wind className="w-2.5 h-2.5" />
                    <span>{day.windSpeedMax}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Status bar */}
        <div className="px-4 pb-3">
          {windWarnings.length === 0 ? (
            <div className="rounded-lg bg-green-500/10 px-3 py-2 text-xs text-green-700 font-medium">
              ✓ Inga vädervarninngar för kommande veckan
            </div>
          ) : (
            <div className="rounded-lg bg-destructive/10 px-3 py-1.5 text-[10px] text-destructive">
              {windWarnings.length} dag{windWarnings.length > 1 ? 'ar' : ''} med vindvarning (&gt;15 m/s)
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};

export default LogisticsWeeklyWeatherWidget;
