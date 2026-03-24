import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const CATEGORY_PROMPTS: Record<string, string> = {
  project: `Du är en affärsanalytiker som analyserar projektdata.
Analysera datasetet och identifiera:
1. Mönster i lönsamma vs olönsamma projekt (marginal, kundtyp, projekttyp)
2. Samband mellan projektegenskaper och resultat
3. Projekt med onormalt lång stängningstid eller hög tidsåtgång
4. Inverkan av avvikelser och sena ändringar på marginal
5. Segmentering per kund/kundtyp/projekttyp
6. Konkreta åtgärdsförslag för att förbättra projektlönsamhet
Svara på svenska. Var konkret med siffror och tydliga slutsatser.`,

  product: `Du är en produktanalytiker som analyserar produktlönsamhet.
Analysera datasetet och identifiera:
1. Mest och minst lönsamma produkter (baserat på avg_project_margin_pct)
2. Produkter med hög avvikelsefrekvens eller som ofta läggs till sent
3. Produkter som bör prishöjas (hög volym, låg marginal)
4. Mönster mellan produktkategori och lönsamhet
5. Produkter som ofta förekommer i olönsamma projekt
6. Sortimentsrekommendationer och prissättningsförslag
Svara på svenska. Var konkret med siffror.`,

  combo: `Du är en analytiker som analyserar produktkombinationer.
Analysera datasetet och identifiera:
1. Kombinationer som ger högst/lägst marginal
2. Kombinationer som driver mest tid
3. Problemkombinationer (låg marginal + hög tid)
4. Mest frekventa kombinationer och deras lönsamhet
5. Rekommendationer för paketering och prissättning
Svara på svenska. Var konkret med siffror.`,

  staff: `Du är en HR-analytiker som analyserar personalbelastning.
Analysera datasetet och identifiera:
1. Belastningsfördelning - ojämnheter i arbetsbelastning
2. Övertidsmönster och risker
3. Samband mellan personalens timmar och projektmarginal
4. Effektivitet per person (intäkt per timme, marginal)
5. Vilka projekttyper olika personer jobbar med
6. Rekommendationer för bemanning och resursoptimering
Svara på svenska. Var konkret med siffror.`,

  time: `Du är en analytiker som specialiserar sig på tidsanalys.
Analysera datasetet och identifiera:
1. Projekt med hög timförbrukning relativt intäkt
2. Mönster i övertidsanvändning
3. Tidseffektivitet per projekttyp och produktmix
4. Samband mellan tidsåtgång och marginal
5. Baslinjetal per projekttyp (snitt, median, spridning)
6. Förbättringsförslag för resursplanering
Svara på svenska. Var konkret med siffror.`,

  economy: `Du är en ekonomianalytiker som analyserar finansiella trender.
Analysera datasetet och identifiera:
1. Intäktstrend - tillväxt eller minskning
2. Marginalutveckling och kostnadsdrivare
3. Säsongsmönster i omsättning och projektvolym
4. Lönsamhet per produktkategori
5. Intäkt per projekt och kundssegment
6. Prognos och rekommendationer för förbättrad lönsamhet
Svara på svenska. Var konkret med siffror.`,

  deviation: `Du är en kvalitetsanalytiker som analyserar avvikelser.
Analysera datasetet och identifiera:
1. Vanligaste avvikelsetyperna och deras frekvens
2. Samband mellan avvikelser och marginalförlust
3. Produkter och projekttyper som oftast drabbas
4. Tidsmässig utveckling - blir det bättre eller sämre?
5. Skillnader mellan projekt med/utan avvikelser
6. Förebyggande åtgärder och processförbättringar
Svara på svenska. Var konkret med siffror.`,

  forecast: `Du är en prediktiv analytiker som bygger prognoser.
Analysera datasetet och identifiera:
1. Baslinjer per projekttyp (förväntad tid, marginal, bemanning)
2. Riskfaktorer som predicerar dåligt resultat
3. Tidiga varningsindikatorer
4. Ineffektiva upplägg som bör undvikas
5. Rekommenderade konfigurationer (projekttyp × produktmix × personal)
6. Konfidensintervall och osäkerhet i prognoserna
Svara på svenska. Var konkret med siffror och ge handlingsbara rekommendationer.`,
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
    if (!dataset?.dataset_type || !dataset?.data) {
      return new Response(
        JSON.stringify({ error: "Invalid payload: missing dataset or dataset_type" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const category = dataset.dataset_category || 'project';
    const systemPrompt = CATEGORY_PROMPTS[category] || CATEGORY_PROMPTS.project;

    const maxRows = 100;
    const truncatedData = dataset.data.slice(0, maxRows);
    const wasTruncated = dataset.data.length > maxRows;

    const userPrompt = `Dataset: "${dataset.dataset_label}" (typ: ${dataset.dataset_type}, kategori: ${category})

Beskrivning: ${dataset.description}
Antal poster: ${dataset.record_count}${wasTruncated ? ` (visar ${maxRows} av ${dataset.record_count})` : ''}
Kolumner: ${dataset.columns.join(', ')}
Filter: ${JSON.stringify(dataset.filter_applied || {})}

Sammanfattning:
${JSON.stringify(dataset.summary, null, 2)}

Data (${truncatedData.length} rader):
${JSON.stringify(truncatedData, null, 2)}

Analysera datan och ge:
1. Sammanfattning av viktiga insikter
2. Identifierade mönster och avvikelser
3. Konkreta rekommendationer
4. Risker att bevaka`;

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
        return new Response(JSON.stringify({ error: "Rate limit exceeded. Försök igen om en stund." }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      if (response.status === 402) {
        return new Response(JSON.stringify({ error: "Otillräckliga AI-krediter. Ladda på under Settings > Workspace > Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
      }
      const errorText = await response.text();
      console.error("AI gateway error:", response.status, errorText);
      return new Response(JSON.stringify({ error: `AI gateway error: ${response.status}` }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    const aiResult = await response.json();
    const analysisText = aiResult.choices?.[0]?.message?.content || "Ingen analys genererad.";

    return new Response(
      JSON.stringify({
        dataset_type: dataset.dataset_type,
        dataset_category: category,
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
