import { useState, useEffect, useCallback } from "react";
import { Cloud, Sun, CloudRain, Snowflake, Wind, AlertTriangle, Car, RefreshCw, MapPin, Thermometer, Zap, Navigation, Clock, TrendingUp, Shield } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface WeatherData {
  summary: string;
  temperature: string;
  conditions: string;
  wind: string;
  alerts: string[];
  icon: "sun" | "cloud" | "rain" | "snow" | "wind" | "storm";
}

interface TrafficData {
  summary: string;
  congestionLevel: "low" | "medium" | "high";
  alerts: string[];
  tips: string[];
}

interface AssistantResponse {
  success: boolean;
  data: {
    weather: WeatherData;
    traffic: TrafficData;
    recommendations: string[];
  };
  locations: string[];
  lastUpdated: string;
  error?: string;
}

const WeatherTrafficWidget = () => {
  const [data, setData] = useState<AssistantResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<Date | null>(null);

  const fetchData = useCallback(async () => {
    setIsLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke("weather-traffic-assistant");
      
      if (error) {
        console.error("Error fetching weather/traffic data:", error);
        toast.error("Kunde inte hämta väder- och trafikdata");
        return;
      }

      if (result?.success) {
        setData(result as AssistantResponse);
        setLastFetch(new Date());
      } else {
        console.error("API returned error:", result?.error);
        toast.error(result?.error || "Något gick fel");
      }
    } catch (err) {
      console.error("Failed to fetch weather/traffic:", err);
      toast.error("Kunde inte ansluta till servern");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (isLoading && !data) {
    return (
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-1">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <div className="lg:col-span-1">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
        <div className="lg:col-span-1">
          <Skeleton className="h-48 w-full rounded-2xl" />
        </div>
      </div>
    );
  }

  const weather = data?.data?.weather;
  const traffic = data?.data?.traffic;
  const recommendations = data?.data?.recommendations || [];

  const getWeatherIcon = (icon?: string) => {
    switch (icon) {
      case "sun": return <Sun className="w-12 h-12" />;
      case "rain": return <CloudRain className="w-12 h-12" />;
      case "snow": return <Snowflake className="w-12 h-12" />;
      case "wind": return <Wind className="w-12 h-12" />;
      case "storm": return <Zap className="w-12 h-12" />;
      default: return <Cloud className="w-12 h-12" />;
    }
  };

  const getWeatherGradient = (icon?: string) => {
    switch (icon) {
      case "sun": return "from-amber-400 via-orange-400 to-yellow-500";
      case "rain": return "from-blue-500 via-blue-600 to-indigo-600";
      case "snow": return "from-cyan-400 via-blue-300 to-slate-400";
      case "wind": return "from-teal-400 via-cyan-500 to-blue-500";
      case "storm": return "from-purple-600 via-indigo-600 to-blue-700";
      default: return "from-slate-400 via-gray-500 to-slate-600";
    }
  };

  const getCongestionData = (level?: string) => {
    switch (level) {
      case "low": return { 
        gradient: "from-emerald-500 to-green-600", 
        label: "Låg belastning", 
        barWidth: "33%",
        textColor: "text-emerald-400"
      };
      case "high": return { 
        gradient: "from-red-500 to-rose-600", 
        label: "Hög belastning", 
        barWidth: "100%",
        textColor: "text-red-400"
      };
      default: return { 
        gradient: "from-amber-500 to-orange-500", 
        label: "Normal belastning", 
        barWidth: "66%",
        textColor: "text-amber-400"
      };
    }
  };

  const congestion = getCongestionData(traffic?.congestionLevel);

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
      {/* Weather Card */}
      <div className={`relative overflow-hidden rounded-2xl bg-gradient-to-br ${getWeatherGradient(weather?.icon)} p-6 text-white shadow-xl`}>
        <div className="absolute top-0 right-0 opacity-20 transform translate-x-4 -translate-y-4">
          {getWeatherIcon(weather?.icon)}
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              {getWeatherIcon(weather?.icon)}
            </div>
            <div className="text-right">
              <div className="text-3xl font-bold">{weather?.temperature || "- °C"}</div>
              <div className="text-xs opacity-80 flex items-center gap-1 justify-end">
                <Wind className="w-3 h-3" />
                {weather?.wind || "Ingen vinddata"}
              </div>
            </div>
          </div>
          
          <h3 className="font-bold text-lg mb-1">Väder</h3>
          <p className="text-sm opacity-90 leading-relaxed line-clamp-3">
            {weather?.summary || "Ingen väderdata tillgänglig"}
          </p>

          {weather?.alerts && weather.alerts.length > 0 && (
            <div className="mt-4 space-y-1.5">
              {weather.alerts.slice(0, 2).map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-white/20 backdrop-blur-sm rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="line-clamp-1">{alert}</span>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="absolute bottom-2 right-3 flex items-center gap-1 text-[10px] opacity-60">
          <MapPin className="w-2.5 h-2.5" />
          {data?.locations?.slice(0, 2).join(", ") || "Inga platser"}
        </div>
      </div>

      {/* Traffic Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-slate-800 via-slate-900 to-gray-900 p-6 text-white shadow-xl">
        <div className="absolute top-4 right-4 opacity-10">
          <Car className="w-20 h-20" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className={`p-2.5 rounded-xl bg-gradient-to-br ${congestion.gradient}`}>
                <Navigation className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">Trafik</h3>
                <span className={`text-xs font-medium ${congestion.textColor}`}>
                  {congestion.label}
                </span>
              </div>
            </div>
          </div>

          {/* Congestion Bar */}
          <div className="mb-4">
            <div className="h-2 bg-white/10 rounded-full overflow-hidden">
              <div 
                className={`h-full bg-gradient-to-r ${congestion.gradient} rounded-full transition-all duration-500`}
                style={{ width: congestion.barWidth }}
              />
            </div>
          </div>
          
          <p className="text-sm text-gray-300 leading-relaxed line-clamp-2 mb-3">
            {traffic?.summary || "Ingen trafikdata tillgänglig"}
          </p>

          {traffic?.alerts && traffic.alerts.length > 0 && (
            <div className="space-y-1.5">
              {traffic.alerts.slice(0, 2).map((alert, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-red-500/20 text-red-300 rounded-lg px-3 py-2">
                  <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                  <span className="line-clamp-1">{alert}</span>
                </div>
              ))}
            </div>
          )}

          {traffic?.tips && traffic.tips.length > 0 && !traffic?.alerts?.length && (
            <div className="space-y-1.5">
              {traffic.tips.slice(0, 2).map((tip, i) => (
                <div key={i} className="flex items-center gap-2 text-xs bg-white/10 text-gray-300 rounded-lg px-3 py-2">
                  <TrendingUp className="w-3.5 h-3.5 shrink-0 text-emerald-400" />
                  <span className="line-clamp-1">{tip}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* AI Recommendations Card */}
      <div className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-primary/90 via-primary to-primary/80 p-6 text-white shadow-xl">
        <div className="absolute top-4 right-4 opacity-10">
          <Shield className="w-20 h-20" />
        </div>
        <div className="relative z-10">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-2.5 rounded-xl bg-white/20 backdrop-blur-sm">
                <Zap className="w-5 h-5" />
              </div>
              <div>
                <h3 className="font-bold text-lg">AI-Tips</h3>
                <span className="text-xs opacity-80">Dagens rekommendationer</span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              className="h-8 w-8 p-0 text-white hover:bg-white/20 rounded-full"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>

          {recommendations.length > 0 ? (
            <div className="space-y-2">
              {recommendations.slice(0, 3).map((rec, i) => (
                <div key={i} className="flex items-start gap-3 bg-white/10 backdrop-blur-sm rounded-lg px-3 py-2.5">
                  <span className="flex items-center justify-center w-5 h-5 rounded-full bg-white/20 text-xs font-bold shrink-0">
                    {i + 1}
                  </span>
                  <p className="text-sm leading-snug line-clamp-2">{rec}</p>
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center justify-center py-6 text-center opacity-80">
              <Cloud className="w-10 h-10 mb-2 opacity-50" />
              <p className="text-sm">Inga rekommendationer just nu</p>
            </div>
          )}

          {lastFetch && (
            <div className="flex items-center justify-end gap-1 mt-4 text-[10px] opacity-60">
              <Clock className="w-2.5 h-2.5" />
              Uppdaterad {lastFetch.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default WeatherTrafficWidget;
