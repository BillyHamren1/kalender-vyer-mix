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

const getWeatherLabel = (code: number): string => {
  if (code <= 1) return 'sol';
  if (code <= 3) return 'moln';
  if (code >= 71 && code <= 77) return 'snö';
  if (code >= 51 || (code >= 80 && code <= 82)) return 'regn';
  return 'moln';
};

const getWeatherIcon = (code: number) => {
  if (code <= 1) return Sun;
  if (code <= 3) return Cloud;
  if (code >= 71 && code <= 77) return Snowflake;
  if (code >= 51 || (code >= 80 && code <= 82)) return CloudRain;
  return Cloud;
};

const getDayName = (dateStr: string, index: number): string => {
  if (index === 0) return 'idag';
  if (index === 1) return 'imorgon';
  const date = new Date(dateStr);
  return ['söndag', 'måndag', 'tisdag', 'onsdag', 'torsdag', 'fredag', 'lördag'][date.getDay()];
};

const LogisticsWeeklyWeatherWidget: React.FC = () => {
  const [forecast, setForecast] = useState<DayForecast[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchForecast = async () => {
      try {
        const res = await fetch(
          'https://api.open-meteo.com/v1/forecast?latitude=58.41&longitude=15.62&daily=temperature_2m_max,temperature_2m_min,weather_code,wind_speed_10m_max&timezone=Europe/Stockholm&forecast_days=5'
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

  if (loading) {
    return <span className="text-xs text-muted-foreground">Laddar väder...</span>;
  }

  if (forecast.length === 0) return null;

  // Build a readable summary
  const windWarnings = forecast.filter(d => d.windSpeedMax > 15);
  const today = forecast[0];
  const TodayIcon = getWeatherIcon(today.weatherCode);

  const summaryParts = forecast.slice(1).map(d => {
    const wind = d.windSpeedMax > 15 ? `, vind ${d.windSpeedMax} m/s` : '';
    return `${d.dayName} ${d.tempMax}°/${d.tempMin}° ${getWeatherLabel(d.weatherCode)}${wind}`;
  });

  return (
    <div className="text-xs text-muted-foreground leading-relaxed">
      <span className="inline-flex items-center gap-1">
        <TodayIcon className="w-3.5 h-3.5 text-primary inline" />
        <span className="font-medium text-foreground">
          {today.tempMax}°/{today.tempMin}° {getWeatherLabel(today.weatherCode)}
        </span>
        {today.windSpeedMax > 10 && (
          <span className="inline-flex items-center gap-px">
            <Wind className="w-3 h-3" /> {today.windSpeedMax} m/s
          </span>
        )}
      </span>
      <span className="mx-1.5">—</span>
      <span>{summaryParts.join(' · ')}</span>
      {windWarnings.length > 0 && (
        <span className="ml-2 inline-flex items-center gap-1 text-destructive font-medium">
          <AlertTriangle className="w-3 h-3" />
          Stark vind {windWarnings.map(d => d.dayName).join(', ')}
        </span>
      )}
    </div>
  );
};

export default LogisticsWeeklyWeatherWidget;
