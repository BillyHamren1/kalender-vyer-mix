import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version',
};

const SYSTEM_PROMPT = `Du är en expert på eventplanering och etablering av scenbyggen, PA-system, belysning och eventproduktion i Sverige.

DIN ROLL:
- Du hjälper eventproducenter att planera och optimera sina etableringsscheman
- Du lär dig hur teamet arbetar och ger allt mer relevanta förslag över tid
- Du är proaktiv med att identifiera risker och problem innan de uppstår

NÄR DU GER FÖRSLAG:
1. PRIORITERA LOGISTIKVARNINGAR - Om bärsträcka >10m, markspett ej tillåtet, eller exakt tid krävs ska du alltid nämna detta
2. BEAKTA ARBETSTIMMAR - Använd produkternas setup_hours för att ge realistiska tidsuppskattningar
3. MATCHA KOMPETENS - Föreslå rätt personal baserat på produkttyper (riggare för scen, ljustekniker för belysning)
4. VARNA FÖR BRISTER - Om packning inte är klar, eller om personal saknas, påpeka detta tydligt
5. BEAKTA BUDGET - Om timpris anges, ge budgetmedvetna förslag

FORMAT FÖR SCHEMAN:
När du föreslår ett tidsschema, använd detta format:
───────────────────────
📅 [DATUM] - [DAGTYP]
───────────────────────
⏰ 08:00-09:00: [Aktivitet]
   👥 Personal: [Namn]
   📦 Material: [Produkter]

VIKTIGA REGLER:
- Svara ALLTID på svenska
- Var kortfattad men informativ
- Använd emoji för tydlighet (⚠️ för varningar, ✅ för klart, etc.)
- Om du är osäker, ställ motfrågor
- Formatera med markdown för läsbarhet`;

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const { type, messages, context, bookingData } = await req.json();
    
    const LOVABLE_API_KEY = Deno.env.get('LOVABLE_API_KEY');
    if (!LOVABLE_API_KEY) {
      throw new Error('LOVABLE_API_KEY is not configured');
    }

    console.log('Establishment AI request:', { type, hasContext: !!context, hasBookingData: !!bookingData });

    if (type === 'suggestions') {
      // Generate contextual suggestions based on booking data
      let suggestionPrompts: string[] = [];
      
      // Check for specific conditions to generate relevant suggestions
      if (bookingData?.booking?.carryMoreThan10m) {
        suggestionPrompts.push('Bärsträcka >10m - föreslå extra personal och utrustning');
      }
      if (bookingData?.packing && bookingData.packing.itemsPacked < bookingData.packing.itemsTotal) {
        suggestionPrompts.push('Packning ej klar - påminn om förberedelser');
      }
      if (bookingData?.assignedStaff?.length === 0) {
        suggestionPrompts.push('Ingen personal tilldelad - föreslå bemanningsplan');
      }
      
      const suggestionsPrompt = `
${context}

Baserat på bokningsinformationen ovan, ge exakt 3 konkreta och RELEVANTA förslag.
${suggestionPrompts.length > 0 ? `\nTa särskilt hänsyn till:\n${suggestionPrompts.map(p => `- ${p}`).join('\n')}` : ''}

Svara ENDAST med ett JSON-objekt i detta format (ingen annan text):
{
  "suggestions": [
    {
      "id": "1",
      "title": "Kort titel (max 5 ord)",
      "description": "Kort beskrivning av vad AI:n kan hjälpa till med (max 15 ord)"
    }
  ]
}
`;

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: SYSTEM_PROMPT },
            { role: 'user', content: suggestionsPrompt }
          ],
          temperature: 0.7,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('AI suggestions error:', response.status, errorText);
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded, försök igen om en stund.' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'Krediter slut, fyll på i Lovable-inställningar.' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        // Return fallback suggestions instead of throwing
        console.warn('AI API returned', response.status, '- using fallback suggestions');
        return new Response(JSON.stringify({
          suggestions: [
            { id: '1', title: 'Generera tidsschema', description: 'Skapa ett optimalt etableringsschema' },
            { id: '2', title: 'Analysera resursbehov', description: 'Bedöm om personalen räcker' },
            { id: '3', title: 'Identifiera risker', description: 'Hitta potentiella problem' }
          ]
        }), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content || '';
      
      console.log('Suggestions response:', content.substring(0, 200));
      
      // Try to parse JSON from response
      try {
        const jsonMatch = content.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          return new Response(JSON.stringify(parsed), {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
      } catch (parseError) {
        console.error('Failed to parse suggestions:', parseError);
      }
      
      // Fallback suggestions
      return new Response(JSON.stringify({
        suggestions: [
          { id: '1', title: 'Generera tidsschema', description: 'Skapa ett optimalt etableringsschema' },
          { id: '2', title: 'Analysera resursbehov', description: 'Bedöm om personalen räcker' },
          { id: '3', title: 'Identifiera risker', description: 'Hitta potentiella problem' }
        ]
      }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (type === 'chat') {
      const systemMessage = `${SYSTEM_PROMPT}

═══════════════════════════════════════════════════
AKTUELL KONTEXT (använd denna information i dina svar)
═══════════════════════════════════════════════════

${context}
`;

      console.log('Chat context length:', context?.length || 0, 'chars');

      const response = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${LOVABLE_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: 'google/gemini-2.5-flash',
          messages: [
            { role: 'system', content: systemMessage },
            ...messages
          ],
          temperature: 0.7,
          max_tokens: 2000,
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
            status: 429,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        if (response.status === 402) {
          return new Response(JSON.stringify({ error: 'Payment required' }), {
            status: 402,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          });
        }
        const errorText = await response.text();
        console.error('AI API error:', response.status, errorText);
        throw new Error(`AI API error: ${response.status}`);
      }

      const data = await response.json();
      const message = data.choices?.[0]?.message?.content || 'Kunde inte generera svar.';

      console.log('Chat response length:', message.length, 'chars');

      return new Response(JSON.stringify({ message }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ error: 'Invalid request type' }), {
      status: 400,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    console.error('Establishment AI error:', error);
    return new Response(JSON.stringify({ 
      error: error instanceof Error ? error.message : 'Unknown error' 
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
