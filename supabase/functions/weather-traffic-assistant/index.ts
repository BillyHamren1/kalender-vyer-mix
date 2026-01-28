import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface BookingLocation {
  id: string;
  client: string;
  deliveryaddress: string | null;
  delivery_city: string | null;
  eventdate: string | null;
  rigdaydate: string | null;
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      throw new Error("LOVABLE_API_KEY is not configured");
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Fetch today's and upcoming bookings with addresses
    const today = new Date().toISOString().split("T")[0];
    const nextWeek = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().split("T")[0];

    console.log("Fetching bookings from", today, "to", nextWeek);

    const { data: bookings, error: bookingsError } = await supabase
      .from("bookings")
      .select("id, client, deliveryaddress, delivery_city, eventdate, rigdaydate")
      .eq("status", "CONFIRMED")
      .or(`eventdate.gte.${today},rigdaydate.gte.${today}`)
      .or(`eventdate.lte.${nextWeek},rigdaydate.lte.${nextWeek}`)
      .limit(20);

    if (bookingsError) {
      console.error("Error fetching bookings:", bookingsError);
      throw new Error("Failed to fetch bookings");
    }

    console.log("Found bookings:", bookings?.length || 0);

    // Extract unique locations from bookings
    const locations = (bookings || [])
      .filter((b: BookingLocation) => b.deliveryaddress || b.delivery_city)
      .map((b: BookingLocation) => ({
        client: b.client,
        address: b.deliveryaddress || b.delivery_city,
        date: b.eventdate || b.rigdaydate,
      }));

    const uniqueCities = [...new Set(locations.map(l => {
      // Extract city from address (simple heuristic)
      const parts = (l.address || "").split(",").map(p => p.trim());
      return parts[parts.length - 1] || parts[0] || "Stockholm";
    }))].slice(0, 5);

    console.log("Unique cities to analyze:", uniqueCities);

    const currentDate = new Date().toLocaleDateString("sv-SE", {
      weekday: "long",
      year: "numeric",
      month: "long",
      day: "numeric",
    });

    const currentTime = new Date().toLocaleTimeString("sv-SE", {
      hour: "2-digit",
      minute: "2-digit",
    });

    const systemPrompt = `Du är en expert på logistik, transport och väderanalys för eventföretag i Sverige. 
Din uppgift är att analysera aktuella förhållanden och ge praktiska tips.

Svara ALLTID på svenska och i ett strukturerat JSON-format.

Dagens datum: ${currentDate}
Aktuell tid: ${currentTime}

Basera dina svar på realistiska förhållanden för svenska städer under denna årstid.`;

    const userPrompt = `Analysera väder- och trafikförhållanden för följande platser där vi har kommande jobb:

Platser: ${uniqueCities.join(", ")}

Kommande jobb:
${locations.slice(0, 10).map(l => `- ${l.client}: ${l.address} (${l.date})`).join("\n")}

Returnera ett JSON-objekt med följande struktur:
{
  "weather": {
    "summary": "Kort vädersammanfattning (max 50 ord)",
    "temperature": "Temperaturintervall t.ex. '2-5°C'",
    "conditions": "Väderförhållanden (sol/moln/regn/snö)",
    "wind": "Vindhastighet och riktning",
    "alerts": ["Lista med eventuella vädervarningar"],
    "icon": "sun|cloud|rain|snow|wind|storm"
  },
  "traffic": {
    "summary": "Kort trafiksammanfattning (max 50 ord)",
    "congestionLevel": "low|medium|high",
    "alerts": ["Lista med trafikstörningar eller varningar"],
    "tips": ["2-3 konkreta transporttips baserat på situationen"]
  },
  "recommendations": ["2-3 övergripande rekommendationer för dagens arbete"]
}`;

    console.log("Calling Lovable AI...");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-flash-preview",
        messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userPrompt },
        ],
        temperature: 0.7,
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limits exceeded, please try again later." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Payment required, please add funds to your Lovable AI workspace." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      throw new Error(`AI gateway error: ${response.status}`);
    }

    const aiResponse = await response.json();
    console.log("AI response received");

    const content = aiResponse.choices?.[0]?.message?.content || "";
    
    // Try to parse JSON from the response
    let parsedData;
    try {
      // Extract JSON from potential markdown code blocks
      const jsonMatch = content.match(/```(?:json)?\s*([\s\S]*?)```/) || [null, content];
      const jsonStr = jsonMatch[1] || content;
      parsedData = JSON.parse(jsonStr.trim());
    } catch (parseError) {
      console.error("Failed to parse AI response as JSON:", parseError);
      // Return a fallback structure
      parsedData = {
        weather: {
          summary: "Kunde inte hämta väderdata just nu.",
          temperature: "-",
          conditions: "Okänt",
          wind: "-",
          alerts: [],
          icon: "cloud",
        },
        traffic: {
          summary: "Kunde inte hämta trafikdata just nu.",
          congestionLevel: "low",
          alerts: [],
          tips: ["Kontrollera Trafikverket för aktuell information."],
        },
        recommendations: ["Försök igen om en stund."],
        rawResponse: content,
      };
    }

    return new Response(
      JSON.stringify({
        success: true,
        data: parsedData,
        locations: uniqueCities,
        lastUpdated: new Date().toISOString(),
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Weather/traffic assistant error:", error);
    const errorMessage = error instanceof Error ? error.message : "Unknown error";
    return new Response(
      JSON.stringify({ success: false, error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
