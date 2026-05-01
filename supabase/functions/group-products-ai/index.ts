// AI-driven product grouping. Returns categories + product_ids.
// Frontend persists the result in the product_groupings table.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ProductIn {
  id: string;
  name: string;
}

interface ReqBody {
  prompt: string;
  products: ProductIn[];
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");

    const body = (await req.json()) as ReqBody;
    if (!body?.products?.length) {
      return json({ error: "products is required" }, 400);
    }
    const userPrompt = (body.prompt || "").trim() ||
      "Föreslå själv lämpliga kategorier baserat på produktnamnen.";

    // Cap to keep tokens reasonable
    const products = body.products.slice(0, 1500);

    const tools = [{
      type: "function",
      function: {
        name: "return_groups",
        description:
          "Returnera produkterna grupperade i kategorier enligt användarens prompt. Varje produkt ska finnas i exakt en grupp.",
        parameters: {
          type: "object",
          properties: {
            groups: {
              type: "array",
              items: {
                type: "object",
                properties: {
                  name: { type: "string", description: "Kategorinamn på svenska, kort." },
                  product_ids: {
                    type: "array",
                    items: { type: "string" },
                    description: "ID:n från inputlistan som hör till kategorin.",
                  },
                },
                required: ["name", "product_ids"],
                additionalProperties: false,
              },
            },
          },
          required: ["groups"],
          additionalProperties: false,
        },
      },
    }];

    const system = [
      "Du är en expert på att kategorisera produkter i utrustnings- och inredningslistor för event-, scen-, mässa-, bygg- och AV-branschen.",
      "Tänk steg-för-steg: identifiera vad varje produkt FAKTISKT är (möbel, golv, kabel, högtalare, ljuskälla, rigg, dekor, scen, textil, verktyg, förbrukning, transport, personal, etc.) baserat på produktnamnet — använd din breda allmänkunskap.",
      "Exempel på hur du ska resonera: 'Barstol/Eames/Soffa/Bord' = Möbler. 'Trägolv/Mattan/Linoleum/Dansgolv' = Golv. 'PAR64/Movinghead/Fresnel/Dimmer' = Ljus. 'Högtalare/Mixer/Mikrofon/DI-box' = Ljud. 'Projektor/LED-skärm/Kamera/Switcher' = Video. 'Truss/Motor/Stativ/Clamp' = Rigg. 'XLR/DMX/Strömkabel/Multikabel' = Kabel. 'Eluttag/Ställverk/CEE/Säkring' = El. 'Ridå/Backdrop/Tyg/Molton' = Textil/Dekor. 'Scen-element/Podie/Trappa' = Scen. 'Tält/Pagod/Partytält' = Tält. 'Värmare/Fläkt/AC' = Klimat.",
      "Om användaren anger specifika kategorier i prompten — följ dem EXAKT.",
      "Annars: välj 5–12 logiska, branschmässiga kategorier baserade på vad som faktiskt finns i listan.",
      "VIKTIGT: 'Övrigt' får MAX innehålla produkter som verkligen inte passar någon annan kategori. Ducka aldrig undan svåra fall i Övrigt — gör en kvalificerad gissning utifrån produktnamnet. Om en produkt heter t.ex. 'Stol X' så är det en möbel, även om du inte känner till modellen.",
      "Varje produkt placeras i EXAKT en kategori. Använd produktens id-värde (inte namnet) i product_ids.",
    ].join(" ");

    const userContent = [
      `Promt: ${userPrompt}`,
      "",
      "Produkter (id | namn):",
      products.map((p) => `${p.id} | ${p.name}`).join("\n"),
    ].join("\n");

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-3-pro-preview",
        messages: [
          { role: "system", content: system },
          { role: "user", content: userContent },
        ],
        tools,
        tool_choice: { type: "function", function: { name: "return_groups" } },
      }),
    });

    if (!resp.ok) {
      const t = await resp.text();
      console.error("AI gateway error", resp.status, t);
      if (resp.status === 429) return json({ error: "Rate limit, försök igen om en stund." }, 429);
      if (resp.status === 402) {
        return json({ error: "Lovable AI-krediter slut. Lägg till credits i workspace." }, 402);
      }
      return json({ error: "AI-fel" }, 500);
    }

    const data = await resp.json();
    const call = data?.choices?.[0]?.message?.tool_calls?.[0];
    const args = call?.function?.arguments;
    if (!args) return json({ error: "AI returnerade inget resultat" }, 500);

    let parsed: { groups: { name: string; product_ids: string[] }[] };
    try {
      parsed = typeof args === "string" ? JSON.parse(args) : args;
    } catch (e) {
      console.error("Parse error", e, args);
      return json({ error: "Kunde inte tolka AI-svar" }, 500);
    }

    // Sanity: keep only IDs that actually exist
    const validIds = new Set(products.map((p) => p.id));
    const cleaned = (parsed.groups || [])
      .map((g) => ({
        id: crypto.randomUUID(),
        name: (g.name || "Övrigt").toString().trim() || "Övrigt",
        product_ids: (g.product_ids || []).filter((id) => validIds.has(id)),
      }))
      .filter((g) => g.product_ids.length > 0);

    // Add an Övrigt group for anything missed
    const placed = new Set(cleaned.flatMap((g) => g.product_ids));
    const missing = products.filter((p) => !placed.has(p.id)).map((p) => p.id);
    if (missing.length > 0) {
      cleaned.push({ id: crypto.randomUUID(), name: "Övrigt", product_ids: missing });
    }

    return json({ groups: cleaned });
  } catch (e) {
    console.error("group-products-ai error", e);
    return json({ error: e instanceof Error ? e.message : "Unknown error" }, 500);
  }
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
