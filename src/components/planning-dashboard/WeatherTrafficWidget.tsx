import { useState, useEffect, useCallback } from "react";
import { Cloud, Sun, CloudRain, Snowflake, Wind, AlertTriangle, Car, RefreshCw, MapPin, Thermometer, Zap } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

const weatherIcons: Record<string, React.ReactNode> = {
  sun: <Sun className="w-8 h-8 text-amber-500" />,
  cloud: <Cloud className="w-8 h-8 text-gray-400" />,
  rain: <CloudRain className="w-8 h-8 text-blue-500" />,
  snow: <Snowflake className="w-8 h-8 text-cyan-400" />,
  wind: <Wind className="w-8 h-8 text-teal-500" />,
  storm: <Zap className="w-8 h-8 text-yellow-500" />,
};

const congestionColors: Record<string, string> = {
  low: "bg-emerald-500",
  medium: "bg-amber-500",
  high: "bg-red-500",
};

const congestionLabels: Record<string, string> = {
  low: "Låg",
  medium: "Medel",
  high: "Hög",
};

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

  // Initial fetch
  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Auto-refresh every 15 minutes
  useEffect(() => {
    const interval = setInterval(fetchData, 15 * 60 * 1000);
    return () => clearInterval(interval);
  }, [fetchData]);

  if (isLoading && !data) {
    return (
      <Card className="col-span-full">
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Cloud className="w-4 h-4" />
            Väder & Trafik
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-32 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  const weather = data?.data?.weather;
  const traffic = data?.data?.traffic;
  const recommendations = data?.data?.recommendations || [];

  return (
    <Card className="col-span-full">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-base font-medium">
            <Cloud className="w-4 h-4 text-primary" />
            AI Väder & Trafik-assistent
          </CardTitle>
          <div className="flex items-center gap-2">
            {data?.locations && data.locations.length > 0 && (
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="w-3 h-3" />
                {data.locations.slice(0, 3).join(", ")}
              </div>
            )}
            <Button
              variant="ghost"
              size="sm"
              onClick={fetchData}
              disabled={isLoading}
              className="h-7 px-2"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
        {lastFetch && (
          <p className="text-xs text-muted-foreground">
            Uppdaterad {lastFetch.toLocaleTimeString("sv-SE", { hour: "2-digit", minute: "2-digit" })}
          </p>
        )}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Weather Section */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-blue-50 to-cyan-50 dark:from-blue-950/30 dark:to-cyan-950/30 border">
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                {weather?.icon ? weatherIcons[weather.icon] : weatherIcons.cloud}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm">Väder</h3>
                  {weather?.temperature && (
                    <Badge variant="secondary" className="text-xs">
                      <Thermometer className="w-3 h-3 mr-1" />
                      {weather.temperature}
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {weather?.summary || "Ingen väderdata tillgänglig"}
                </p>
                {weather?.wind && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Wind className="w-3 h-3" />
                    {weather.wind}
                  </p>
                )}
                {weather?.alerts && weather.alerts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {weather.alerts.map((alert, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-amber-700 dark:text-amber-400 bg-amber-100 dark:bg-amber-900/30 px-2 py-1 rounded">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Traffic Section */}
          <div className="p-4 rounded-lg bg-gradient-to-br from-slate-50 to-gray-50 dark:from-slate-950/30 dark:to-gray-950/30 border">
            <div className="flex items-start gap-3">
              <div className="shrink-0">
                <Car className="w-8 h-8 text-primary" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-sm">Trafik</h3>
                  {traffic?.congestionLevel && (
                    <Badge className={`text-xs text-white ${congestionColors[traffic.congestionLevel]}`}>
                      {congestionLabels[traffic.congestionLevel]} belastning
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mb-2">
                  {traffic?.summary || "Ingen trafikdata tillgänglig"}
                </p>
                {traffic?.alerts && traffic.alerts.length > 0 && (
                  <div className="mt-2 space-y-1">
                    {traffic.alerts.map((alert, i) => (
                      <div key={i} className="flex items-start gap-1.5 text-xs text-red-700 dark:text-red-400 bg-red-100 dark:bg-red-900/30 px-2 py-1 rounded">
                        <AlertTriangle className="w-3 h-3 shrink-0 mt-0.5" />
                        <span>{alert}</span>
                      </div>
                    ))}
                  </div>
                )}
                {traffic?.tips && traffic.tips.length > 0 && (
                  <div className="mt-2">
                    <p className="text-xs font-medium mb-1">Transporttips:</p>
                    <ul className="text-xs text-muted-foreground space-y-0.5">
                      {traffic.tips.map((tip, i) => (
                        <li key={i} className="flex items-start gap-1">
                          <span className="text-primary">•</span>
                          {tip}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Recommendations */}
        {recommendations.length > 0 && (
          <div className="p-3 rounded-lg bg-primary/5 border border-primary/20">
            <h4 className="text-xs font-semibold mb-2 flex items-center gap-1.5 text-primary">
              <Zap className="w-3.5 h-3.5" />
              AI-rekommendationer för dagen
            </h4>
            <ul className="text-sm space-y-1">
              {recommendations.map((rec, i) => (
                <li key={i} className="flex items-start gap-2">
                  <span className="text-primary font-medium">{i + 1}.</span>
                  <span className="text-muted-foreground">{rec}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

export default WeatherTrafficWidget;
