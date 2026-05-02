// Suggest tags for products using Lovable AI Gateway.
// Body: { products: [{ id, name }], vocabulary?: string, instructions?: string }
// `vocabulary`/`instructions` is treated as a free-form instruction the user
// gives the AI (e.g. "Tagga alla möbler som möbler. Tagga 2EL som EL.")
// rather than a strict whitelist — earlier hard-filtering meant a single
// natural-language sentence killed every suggestion.
// Returns: { suggestions: [{ id, tags: string[] }] }
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  try {
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY')
    if (!LOVABLE_API_KEY) throw new Error('LOVABLE_API_KEY missing')

    // Validate caller is an authenticated user (RLS context)
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } }
    )
    const { data: userData } = await supabase.auth.getUser()
    if (!userData?.user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const body = await req.json().catch(() => ({}))
    const products = Array.isArray(body?.products) ? body.products : []
    const instructions: string = (body?.instructions ?? body?.vocabulary ?? '').toString().trim()

    if (products.length === 0) {
      return new Response(JSON.stringify({ suggestions: [] }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const cleanProducts = products
      .filter((p: any) => p && typeof p.id === 'string' && typeof p.name === 'string')
      .slice(0, 200)
      .map((p: any) => ({ id: p.id, name: p.name.slice(0, 200) }))

    const sysParts: string[] = [
      'Du är en assistent som klassificerar produkter i ett event-/uthyrningsföretags lager.',
      'För VARJE produkt i listan ska du returnera 1–3 korta taggar (svenska, gemener, max 2 ord per tagg).',
      'Returnera ALLTID minst en tagg per produkt — gissa hellre kategori utifrån produktnamnet än lämna tomt.',
      'Vanliga kategorier (välj fritt, du är inte låst till dessa): tält, golv, ljud, ljus, scen, möbler, värme, el, kabel, transport, kök, bar, dekor, säkerhet, tak, scen-konstruktion.',
      'Returnera ALLTID via funktionsanropet, aldrig prosa.',
    ]
    if (instructions) {
      sysParts.push(
        'Användarens egna instruktioner (följ dessa noga, de gäller ovanpå standardreglerna):\n' +
          instructions,
      )
    }

    const userPrompt = 'Klassificera följande produkter. Returnera EN rad i suggestions per produkt-id:\n' +
      cleanProducts.map((p) => `- [${p.id}] ${p.name}`).join('\n')

    const aiResp = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-3-flash-preview',
        messages: [
          { role: 'system', content: sysParts.join('\n\n') },
          { role: 'user', content: userPrompt },
        ],
        tools: [{
          type: 'function',
          function: {
            name: 'return_tags',
            description: 'Returnerar taggar per produkt-id',
            parameters: {
              type: 'object',
              properties: {
                suggestions: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      tags: { type: 'array', items: { type: 'string' } },
                    },
                    required: ['id', 'tags'],
                    additionalProperties: false,
                  },
                },
              },
              required: ['suggestions'],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: 'function', function: { name: 'return_tags' } },
      }),
    })

    if (!aiResp.ok) {
      const txt = await aiResp.text()
      console.error('AI gateway error', aiResp.status, txt)
      if (aiResp.status === 429) {
        return new Response(JSON.stringify({ error: 'AI rate limit – försök igen om en stund.' }), {
          status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      if (aiResp.status === 402) {
        return new Response(JSON.stringify({ error: 'AI-krediter slut. Lägg till krediter i Settings → Workspace → Usage.' }), {
          status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        })
      }
      return new Response(JSON.stringify({ error: 'AI gateway error' }), {
        status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const aiJson = await aiResp.json()
    const toolCall = aiJson?.choices?.[0]?.message?.tool_calls?.[0]
    let suggestions: Array<{ id: string; tags: string[] }> = []
    try {
      const args = JSON.parse(toolCall?.function?.arguments ?? '{}')
      suggestions = Array.isArray(args?.suggestions) ? args.suggestions : []
    } catch (e) {
      console.error('Failed to parse tool args', e, 'raw:', JSON.stringify(aiJson).slice(0, 500))
    }

    if (suggestions.length === 0) {
      console.warn(
        '[suggest-product-tags] AI returned 0 suggestions for',
        cleanProducts.length,
        'products. raw:',
        JSON.stringify(aiJson?.choices?.[0]?.message ?? {}).slice(0, 500),
      )
    }

    // Light sanitation only — no whitelist filtering.
    const norm = (s: string) => s.toLowerCase().trim().replace(/\s+/g, ' ').slice(0, 30)
    suggestions = suggestions
      .filter((s) => s && typeof s.id === 'string' && Array.isArray(s.tags))
      .map((s) => ({
        id: s.id,
        tags: Array.from(new Set(s.tags.map(norm).filter(Boolean))).slice(0, 3),
      }))

    return new Response(JSON.stringify({ suggestions }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (e) {
    console.error('suggest-product-tags error', e)
    return new Response(JSON.stringify({ error: e instanceof Error ? e.message : 'Unknown' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
