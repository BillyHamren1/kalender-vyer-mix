import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

/**
 * Analytics AI Pipeline
 * 
 * Accepts structured dataset payloads and returns AI-generated insights.
 * 
 * Expected body:
 * {
 *   dataset: {
 *     dataset_type: string,
 *     dataset_label: string,
 *     description: string,
 *     filter_applied: object,
 *     generated_at: string,
 *     record_count: number,
 *     columns: string[],
 *     summary: object,
 *     data: object[]
 *   }
 * }
 */

const SYSTEM_PROMPTS: Record<string, string> = {
  product_profitability: `Du är en ekonomianalytiker som analyserar produktlönsamhet.
Analysera datasetet och identifiera:
1. Mest och minst lönsamma produkter (baserat på avg_project_margin_pct)
2. Produkter med hög avvikelsefrekvens (deviation_pct)
3. Produkter som ofta läggs till sent (late_addition_pct)
4. Mönster mellan produktkategori och lönsamhet
5. Rekommendationer för prissättning och sortiment
Svara på svenska. Var konkret med siffror.`,

  project_margin: `Du är en affärsanalytiker som analyserar projektmarginaler.
Analysera datasetet och identifiera:
1. Mönster i lönsamma vs olönsamma projekt
2. Samband mellan projekttyp/kundtyp och marginal
3. Projekt med onormalt lång stängningstid (closure_delay_days)
4. Inverkan av avvikelser och sena ändringar på marginal
5. Åtgärdsförslag för att förbättra marginalen
Svara på svenska. Var konkret med siffror.`,

  time_data: `Du är en analytiker som specialiserar sig på tidsanalys.
Analysera datasetet och identifiera:
1. Projekt med hög timförbrukning relativt intäkt (hours_per_revenue_sek)
2. Mönster i övertidsanvändning
3. Samband mellan personalstyrka och effektivitet
4. Tidseffektivitet per produkttyp (hours_per_product)
5. Förbättringsförslag för resursplanering
Svara på svenska. Var konkret med siffror.`,

  product_combinations: `Du är en analytiker som analyserar produktkombinationer.
Analysera datasetet och identifiera:
1. Kombinationer som ger högst/lägst marginal
2. Kombinationer som driver mest tid
3. Kombinationer som är mest frekventa
4. Mönster i kategori-samförekomst
5. Rekommendationer för paketering
Svara på svenska. Var konkret med siffror.`,

  staff_workload: `Du är en HR-analytiker som analyserar personalbelastning.
Analysera datasetet och identifiera:
1. Belastningsfördelning - vem jobbar mest/minst
2. Övertidsmönster
3. Samband mellan personalens timmar och projektmarginal
4. Resursoptimering - är arbetsbelastningen jämn?
5. Rekommendationer för bemanning
Svara på svenska. Var konkret med siffror.`,

  deviations: `Du är en kvalitetsanalytiker som analyserar avvikelser.
Analysera datasetet och identifiera:
1. Vanligaste avvikelsetyperna
2. Samband mellan avvikelser och marginal
3. Mönster i sena ändringar
4. Vilka projekttyper som oftast har problem
5. Förebyggande åtgärder
Svara på svenska. Var konkret med siffror.`,

  period_summary: `Du är en ekonomianalytiker som analyserar trender över tid.
Analysera datasetet och identifiera:
1. Intäktstrend - ökar eller minskar omsättningen?
2. Marginalutveckling över tid
3. Säsongsmönster i projektvolym
4. Avvikelseutveckling - blir det bättre eller sämre?
5. Prognos och rekommendationer
Svara på svenska. Var konkret med siffror.`,
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "LOVABLE_API_KEY is not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { dataset } = await req.json();

    if (!dataset || !dataset.dataset_type || !dataset.data) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: missing dataset or dataset_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const systemPrompt = SYSTEM_PROMPTS[dataset.dataset_type] || SYSTEM_PROMPTS.project_margin;

    // Limit data sent to AI to avoid token limits
    const maxRows = 100;
    const truncatedData = dataset.data.slice(0, maxRows);
    const wasTruncated = dataset.data.length > maxRows;

    const userPrompt = `Här är ett dataset av typen "${dataset.dataset_label}":

Beskrivning: ${dataset.description}
Antal poster: ${dataset.record_count}${wasTruncated ? ` (visar ${maxRows} av ${dataset.record_count})` : ''}
Kolumner: ${dataset.columns.join(', ')}
Filter: ${JSON.stringify(dataset.filter_applied || {})}

Sammanfattning:
${JSON.stringify(dataset.summary, null, 2)}

Data (${truncatedData.length} rader):
${JSON.stringify(truncatedData, null, 2)}

Analysera datan och ge insikter och rekommendationer.`;

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
      }),
    });

    if (!response.ok) {
      if (response.status === 429) {
        return new Response(
          JSON.stringify({ error: "Rate limit exceeded. Försök igen om en stund." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      if (response.status === 402) {
        return new Response(
          JSON.stringify({ error: "Otillräckliga AI-krediter. Ladda på under Settings > Workspace > Usage." }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(
        JSON.stringify({ error: `AI gateway error: ${response.status}` }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiResult = await response.json();
    const analysisText = aiResult.choices?.[0]?.message?.content || "Ingen analys genererad.";

    return new Response(
      JSON.stringify({
        dataset_type: dataset.dataset_type,
        dataset_label: dataset.dataset_label,
        filter_applied: dataset.filter_applied,
        record_count: dataset.record_count,
        summary: dataset.summary,
        analysis: analysisText,
        generated_at: new Date().toISOString(),
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("analytics-ai-pipeline error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
