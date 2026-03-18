import React, { useEffect, useState } from 'react';
import { Cloud, Sun, CloudRain, Snowflake, Wind, AlertTriangle, Droplets } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayForecast {
  date: string;
  dayName: string;
  dayNameShort: string;
  tempMax: number;
  tempMin: number;
  weatherCode: number;
  windSpeedMax: number;
}

const getWeatherIcon = (code: number) => {
  if (code <= 1) return Sun;
  if (code <= 3) return Cloud;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 51 || (code >= 80 && code <= 82)) return CloudRain;
  return Cloud;
};

const getWeatherLabel = (code: number): string => {
  if (code <= 1) return 'sol';
  if (code <= 3) return 'molnigt';
  if (code >= 71 && code <= 77) return 'snö';
  if (code >= 51 || (code >= 80 && code <= 82)) return 'regn';
  return 'molnigt';
};

const getDayNameShort = (dateStr: string, index: number): string => {
  if (index === 0) return 'Idag';
  if (index === 1) return 'Imor';
  const date = new Date(dateStr);
  return ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][date.getDay()];
};

const getDayNameLong = (dateStr: string, index: number): string => {
  if (index === 0) return 'idag';
  if (index === 1) return 'imorgon';
  const date = new Date(dateStr);
  return ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][date.getDay()];
};

function buildWeatherSummary(forecast: DayForecast[]): string {
  if (forecast.length === 0) return '';
  const parts: string[] = [];

  const today = forecast[0];
  parts.push(`Idag blir det ${getWeatherLabel(today.weatherCode)} med ${today.tempMax}°.`);

  const windyDays = forecast.filter(d => d.windSpeedMax > 15);
  if (windyDays.length > 0) {
    const dayNames = windyDays.map(d => d.dayName);
    if (windyDays.length === 1) {
      parts.push(`Det blåser kraftigt ${dayNames[0]} (${windyDays[0].windSpeedMax} m/s).`);
    } else {
      parts.push(`Blåsigt ${dayNames.slice(0, -1).join(', ')} och ${dayNames[dayNames.length - 1]}.`);
    }
  }

  const rainyDays = forecast.slice(1).filter(d =>
    (d.weatherCode >= 51 && d.weatherCode <= 67) || (d.weatherCode >= 80 && d.weatherCode <= 82)
  );
  if (rainyDays.length > 0) {
    const dayNames = rainyDays.map(d => d.dayName);
    if (rainyDays.length === 1) {
      parts.push(`Risk för regn på ${dayNames[0]}.`);
    } else {
      parts.push(`Regn väntas ${dayNames.slice(0, -1).join(', ')} och ${dayNames[dayNames.length - 1]}.`);
    }
  }

  const snowDays = forecast.slice(1).filter(d => d.weatherCode >= 71 && d.weatherCode <= 77);
  if (snowDays.length > 0) {
    parts.push(`Snö väntas ${snowDays.map(d => d.dayName).join(' och ')}.`);
  }

  const temps = forecast.map(d => d.tempMax);
  const minTemp = Math.min(...temps);
  const maxTemp = Math.max(...temps);
  if (maxTemp - minTemp > 5) {
    parts.push(`Temperaturen varierar mellan ${minTemp}° och ${maxTemp}° under veckan.`);
  }

  return parts.join(' ');
}

const LogisticsWeeklyWeatherWidget: React.FC = () => {
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=58.41&longitude=15.62&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max&timezone=Europe/Stockholm&forecast_days=7'
        );
        const data = await res.json();
        if (data?.daily) {
          setForecast(data.daily.time.map((date: string, i: number) => ({
            date,
            dayName: getDayNameLong(date, i),
            dayNameShort: getDayNameShort(date, i),
            tempMax: Math.round(data.daily.temperature_2m_max[i]),
            tempMin: Math.round(data.daily.temperature_2m_min[i]),
            weatherCode: data.daily.weather_code[i],
            windSpeedMax: Math.round(data.daily.wind_speed_10m_max[i]),
          })));
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

  if (loading) {
    return (
      <div className="h-[72px] flex items-center">
        <div className="flex gap-3">
          {[...Array(7)].map((_, i) => (
            <div key={i} className="w-10 h-14 rounded-lg bg-muted/50 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (forecast.length === 0) return null;

  const summary = buildWeatherSummary(forecast);
  const hasWarnings = forecast.some(d => d.windSpeedMax > 15);
  const todayForecast = forecast[0];
  const TodayIcon = getWeatherIcon(todayForecast.weatherCode);

  return (
    <div className="rounded-lg border border-border/50 bg-card overflow-hidden">
      {/* Forecast strip */}
      <div className="flex items-stretch w-full">
        {/* Today — hero */}
        <div className="flex flex-col items-center justify-center px-4 py-2 bg-primary/[0.06] border-r border-border/40 min-w-[64px]">
          <span className="text-[9px] font-semibold tracking-wider uppercase text-primary leading-none">Idag</span>
          <TodayIcon className="w-4.5 h-4.5 my-1 text-primary" />
          <span className="text-sm font-bold text-foreground leading-none tracking-tight">{todayForecast.tempMax}°</span>
          <span className="text-[9px] text-muted-foreground leading-none mt-0.5">{todayForecast.tempMin}°</span>
        </div>

        {/* Rest of week — evenly distributed */}
        {forecast.slice(1).map((day) => {
          const Icon = getWeatherIcon(day.weatherCode);
          const warn = day.windSpeedMax > 15;
          return (
            <div
              key={day.date}
              className={cn(
                "flex-1 flex flex-col items-center justify-center py-2 border-r border-border/20 last:border-r-0 transition-colors",
                warn && "bg-amber-500/[0.04]"
              )}
            >
              <span className={cn(
                "text-[9px] font-medium leading-none",
                warn ? "text-destructive" : "text-muted-foreground"
              )}>
                {day.dayNameShort}
              </span>
              <Icon className={cn(
                "w-3.5 h-3.5 my-1",
                warn ? "text-destructive/80" : "text-muted-foreground/60"
              )} />
              <span className="text-[11px] font-semibold text-foreground leading-none">{day.tempMax}°</span>
              <div className={cn(
                "flex items-center gap-px mt-0.5",
                warn ? "text-destructive" : "text-muted-foreground/50"
              )}>
                <Wind className="w-2 h-2" />
                <span className={cn("text-[8px] leading-none", warn && "font-bold")}>{day.windSpeedMax}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* Summary bar */}
      <div className={cn(
        "flex items-start gap-1.5 px-3 py-1.5 border-t border-border/30 text-[11px] leading-relaxed text-foreground",
        hasWarnings ? "bg-destructive/10" : "bg-green-500/10"
      )}>
        {hasWarnings ? (
          <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5 text-destructive" />
        ) : (
          <Droplets className="w-3 h-3 shrink-0 mt-0.5 text-primary/40" />
        )}
        <span className="italic">{summary}</span>
      </div>
    </div>
  );
};

export default LogisticsWeeklyWeatherWidget;
