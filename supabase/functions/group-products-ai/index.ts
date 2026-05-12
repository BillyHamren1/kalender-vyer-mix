// AI-driven product grouping. Returns categories + product_ids.
// Frontend persists the result in the product_groupings table.
//
// Two lägen:
// 1) Skapa från scratch: skicka { prompt, products }
// 2) Ändra befintlig gruppering med naturligt språk
//    (t.ex. "Slå ihop Ljud och Video till AV", "Ta bort tag Övrigt och fördela",
//     "Döp om X till Y", "Flytta alla högtalare till Ljud"):
//    skicka { prompt, products, currentGroups }

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

interface ProductIn {
  id: string;
  name: string;
}

interface GroupIn {
  id?: string;
  name: string;
  product_ids: string[];
}

interface ReqBody {
  prompt: string;
  products: ProductIn[];
  currentGroups?: GroupIn[];
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

    const hasCurrent = Array.isArray(body.currentGroups) && body.currentGroups.length > 0;
    const userPrompt = (body.prompt || "").trim() ||
      (hasCurrent
        ? "Förbättra grupperingen om det behövs, behåll annars som den är."
        : "Föreslå själv lämpliga kategorier baserat på produktnamnen.");

    const products = body.products.slice(0, 1500);

    const tools = [{
      type: "function",
      function: {
        name: "return_groups",
        description:
          "Returnera den fullständiga, uppdaterade listan av kategorier. Varje produkt-id ska finnas i exakt en grupp.",
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

    const baseSystem = [
      "Du är en expert på att kategorisera produkter i utrustnings- och inredningslistor för event-, scen-, mässa-, bygg- och AV-branschen.",
      "Tänk steg-för-steg: identifiera vad varje produkt FAKTISKT är (möbel, golv, kabel, högtalare, ljuskälla, rigg, dekor, scen, textil, verktyg, förbrukning, transport, personal, etc.) baserat på produktnamnet.",
      "Exempel: 'Barstol/Eames/Soffa/Bord' = Möbler. 'Trägolv/Mattan/Linoleum/Dansgolv' = Golv. 'PAR64/Movinghead/Fresnel/Dimmer' = Ljus. 'Högtalare/Mixer/Mikrofon/DI-box' = Ljud. 'Projektor/LED-skärm/Kamera/Switcher' = Video. 'Truss/Motor/Stativ/Clamp' = Rigg. 'XLR/DMX/Strömkabel' = Kabel. 'Ridå/Backdrop/Molton' = Textil/Dekor.",
      "Varje produkt placeras i EXAKT en kategori. Använd produktens id (inte namnet) i product_ids.",
      "VIKTIGT: 'Övrigt' får MAX innehålla produkter som verkligen inte passar någon annan kategori.",
    ];

    const editSystem = [
      ...baseSystem,
      "Du får en BEFINTLIG gruppering och en instruktion från användaren. Tolka instruktionen flexibelt och utför den.",
      "Stödda kommandon (exempel — användaren kan formulera fritt):",
      "- 'Slå ihop A och B' / 'Merga X, Y till Z' → kombinera grupperna till en (använd nytt namn om angivet, annars första namnet).",
      "- 'Ta bort gruppen X' / 'Radera tag X' → ta bort gruppen och fördela dess produkter till passande befintliga eller nya grupper (aldrig förlora produkter).",
      "- 'Döp om X till Y' / 'Byt namn X → Y' → byt bara namnet, behåll produkterna.",
      "- 'Flytta alla högtalare till Ljud' / 'Lägg X i Y' → flytta matchande produkter mellan grupper.",
      "- 'Dela upp X i A och B' → splitta en grupp logiskt.",
      "- 'Lägg till grupp X' → skapa ny tom eller fyll med matchande produkter.",
      "- 'Städa upp' / 'Förbättra' → rimliga justeringar utan att ändra namn i onödan.",
      "Behåll alla grupper som inte berörs OFÖRÄNDRADE (samma namn, samma produkter).",
      "Returnera ALLTID hela den nya listan av grupper, inte bara diffen.",
      "Om instruktionen är otydlig — gör din bästa tolkning, ändra hellre lite än mycket.",
    ];

    const newSystem = [
      ...baseSystem,
      "Om användaren anger specifika kategorier i prompten — följ dem EXAKT.",
      "Annars: välj 5–12 logiska, branschmässiga kategorier baserade på vad som faktiskt finns i listan.",
    ];

    const system = (hasCurrent ? editSystem : newSystem).join(" ");

    const productLines = products.map((p) => `${p.id} | ${p.name}`).join("\n");

    let userContent: string;
    if (hasCurrent) {
      const groupBlock = body.currentGroups!
        .map((g) => `### ${g.name}\n${g.product_ids.join("\n")}`)
        .join("\n\n");
      userContent = [
        `Instruktion: ${userPrompt}`,
        "",
        "BEFINTLIG GRUPPERING (gruppnamn + product_ids):",
        groupBlock,
        "",
        "ALLA produkter (id | namn) — använd dessa id:n:",
        productLines,
      ].join("\n");
    } else {
      userContent = [
        `Promt: ${userPrompt}`,
        "",
        "Produkter (id | namn):",
        productLines,
      ].join("\n");
    }

    const resp = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
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

    const validIds = new Set(products.map((p) => p.id));
    const seen = new Set<string>();
    const cleaned = (parsed.groups || [])
      .map((g) => {
        const ids: string[] = [];
        for (const id of g.product_ids || []) {
          if (validIds.has(id) && !seen.has(id)) {
            seen.add(id);
            ids.push(id);
          }
        }
        return {
          id: crypto.randomUUID(),
          name: (g.name || "Övrigt").toString().trim() || "Övrigt",
          product_ids: ids,
        };
      })
      .filter((g) => g.product_ids.length > 0);

    const missing = products.filter((p) => !seen.has(p.id)).map((p) => p.id);
    if (missing.length > 0) {
      const ovrigt = cleaned.find((g) => g.name.toLowerCase() === "övrigt");
      if (ovrigt) ovrigt.product_ids.push(...missing);
      else cleaned.push({ id: crypto.randomUUID(), name: "Övrigt", product_ids: missing });
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
