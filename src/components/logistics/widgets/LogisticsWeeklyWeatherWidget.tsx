import React, { useEffect, useState } from 'react';
import { Cloud, Sun, CloudRain, Snowflake, Wind, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface DayForecast {
  date: string;
  dayName: string;
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

const getDayName = (dateStr: string, index: number): string => {
  if (index === 0) return 'Idag';
  if (index === 1) return 'Imor';
  const date = new Date(dateStr);
  return ['Sön', 'Mån', 'Tis', 'Ons', 'Tor', 'Fre', 'Lör'][date.getDay()];
};

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
            dayName: getDayName(date, i),
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

  const windWarnings = forecast.filter(d => d.windSpeedMax > 15);

  if (loading) {
    return <div className="h-8 flex items-center text-[10px] text-muted-foreground">Laddar väder...</div>;
  }

  if (forecast.length === 0) return null;

  return (
    <div className="flex items-center gap-3 flex-wrap">
      {/* Compact 7-day row */}
      <div className="flex items-center gap-0.5 rounded-lg border border-border/40 bg-card px-2 py-1">
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
              <span className="text-[9px] text-muted-foreground leading-none">{day.dayName}</span>
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

      {/* Wind warnings inline */}
      {windWarnings.length > 0 && (
        <div className="flex items-center gap-1.5 rounded-lg bg-destructive/10 px-2.5 py-1.5 text-[10px] text-destructive font-medium">
          <AlertTriangle className="w-3 h-3 flex-shrink-0" />
          <span>Vind &gt;15 m/s: {windWarnings.map(d => d.dayName).join(', ')}</span>
        </div>
      )}
    </div>
  );
};

export default LogisticsWeeklyWeatherWidget;
