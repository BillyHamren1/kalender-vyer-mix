import React, { useEffect, useState } from 'react';
import { Cloud, Sun, CloudRain, Snowflake, Wind, AlertTriangle } from 'lucide-react';
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

  // Today
  const today = forecast[0];
  parts.push(`Idag blir det ${getWeatherLabel(today.weatherCode)} med ${today.tempMax}°.`);

  // Wind warnings
  const windyDays = forecast.filter(d => d.windSpeedMax > 15);
  if (windyDays.length > 0) {
    const dayNames = windyDays.map(d => d.dayName);
    if (windyDays.length === 1) {
      parts.push(`Det blåser kraftigt ${dayNames[0]} (${windyDays[0].windSpeedMax} m/s).`);
    } else {
      parts.push(`Blåsigt ${dayNames.slice(0, -1).join(', ')} och ${dayNames[dayNames.length - 1]}.`);
    }
  }

  // Rain days
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

  // Snow
  const snowDays = forecast.slice(1).filter(d => d.weatherCode >= 71 && d.weatherCode <= 77);
  if (snowDays.length > 0) {
    parts.push(`Snö väntas ${snowDays.map(d => d.dayName).join(' och ')}.`);
  }

  // Temp trend
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
    return <div className="h-8 flex items-center text-[10px] text-muted-foreground">Laddar väder...</div>;
  }

  if (forecast.length === 0) return null;

  const summary = buildWeatherSummary(forecast);
  const hasWarnings = forecast.some(d => d.windSpeedMax > 15);

  return (
    <div className="space-y-2">
      {/* Icon widget row */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-card px-2 py-1 w-fit">
        {forecast.map((day) => {
          const Icon = getWeatherIcon(day.weatherCode);
          const warn = day.windSpeedMax > 15;
          return (
            <div
              key={day.date}
              className={cn(
                "flex flex-col items-center px-1.5 py-0.5 rounded-md",
                warn && "bg-destructive/10"
              )}
            >
              <span className="text-[9px] text-muted-foreground leading-none">{day.dayNameShort}</span>
              <Icon className={cn("w-3.5 h-3.5 my-0.5", warn ? "text-destructive" : "text-primary")} />
              <span className="text-[10px] font-semibold leading-none">{day.tempMax}°</span>
              <div className={cn(
                "flex items-center gap-px text-[8px] leading-none mt-0.5",
                warn ? "text-destructive font-bold" : "text-muted-foreground"
              )}>
                <Wind className="w-2 h-2" />
                {day.windSpeedMax}
              </div>
            </div>
          );
        })}
      </div>

      {/* Descriptive summary */}
      <p className={cn(
        "text-[11px] leading-relaxed max-w-xl",
        hasWarnings ? "text-destructive/90" : "text-muted-foreground"
      )}>
        {hasWarnings && <AlertTriangle className="w-3 h-3 inline mr-1 -mt-px" />}
        {summary}
      </p>
    </div>
  );
};

export default LogisticsWeeklyWeatherWidget;
