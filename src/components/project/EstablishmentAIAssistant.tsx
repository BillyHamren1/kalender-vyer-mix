import { useState, useRef, useEffect } from "react";
import { Bot, Send, Sparkles, Loader2, Lightbulb, X } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import ReactMarkdown from 'react-markdown';
import type { EstablishmentBookingData } from "@/services/establishmentPlanningService";
import { format } from "date-fns";
import { sv } from "date-fns/locale";

interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
}

interface Suggestion {
  id: string;
  title: string;
  description: string;
}

interface EstablishmentAIAssistantProps {
  bookingData: EstablishmentBookingData | null;
  onSuggestionApply?: (suggestion: any) => void;
}

const EstablishmentAIAssistant = ({ 
  bookingData,
  onSuggestionApply 
}: EstablishmentAIAssistantProps) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Generate initial suggestions based on booking data
  useEffect(() => {
    if (bookingData && (bookingData.products.length > 0 || bookingData.dates.rigdaydate)) {
      generateSuggestions();
    }
  }, [bookingData?.booking?.bookingNumber]);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const formatDate = (dateStr: string | null) => {
    if (!dateStr) return 'Ej angiven';
    try {
      return format(new Date(dateStr), 'd MMMM yyyy', { locale: sv });
    } catch {
      return dateStr;
    }
  };

  const formatTime = (timeStr: string | null) => {
    if (!timeStr) return '';
    return timeStr.substring(0, 5); // HH:MM
  };

  const buildContext = (): string => {
    if (!bookingData) return 'Ingen bokningsdata tillgänglig.';

    const { booking, products, dates, assignedStaff, project, timeReports, packing } = bookingData;

    // Build address string
    const addressParts = [booking.deliveryAddress, booking.deliveryPostalCode, booking.deliveryCity].filter(Boolean);
    const fullAddress = addressParts.length > 0 ? addressParts.join(', ') : 'Ej angiven';

    // Build product list with cost info
    const mainProducts = products.filter(p => !p.isPackageComponent);
    const totalProductValue = products.reduce((sum, p) => sum + (p.totalPrice || 0), 0);
    const totalSetupHours = products.reduce((sum, p) => sum + ((p.setupHours || 0) * p.quantity), 0);

    const productListItems: string[] = [];
    mainProducts.forEach(product => {
      const accessories = products.filter(p => p.parentPackageId === product.id);
      const priceStr = product.totalPrice ? ` - ${product.totalPrice.toLocaleString('sv-SE')} kr` : '';
      const hoursStr = product.setupHours ? `, ~${product.setupHours * product.quantity}h arbete` : '';
      productListItems.push(`- ${product.name} (${product.quantity} st)${priceStr}${hoursStr}`);
      
      if (accessories.length > 0) {
        accessories.forEach(acc => {
          productListItems.push(`  └ ${acc.name} (${acc.quantity} st)`);
        });
      }
    });
    const productList = productListItems.join('\n');

    // Build staff list with rates
    const staffByDate = new Map<string, typeof assignedStaff>();
    assignedStaff.forEach(staff => {
      const existing = staffByDate.get(staff.assignment_date) || [];
      existing.push(staff);
      staffByDate.set(staff.assignment_date, existing);
    });

    const staffListItems: string[] = [];
    const sortedDates = Array.from(staffByDate.keys()).sort();
    sortedDates.forEach(date => {
      const dateStaff = staffByDate.get(date) || [];
      const formattedDate = formatDate(date);
      dateStaff.forEach(s => {
        const roleStr = s.role ? ` (${s.role})` : '';
        const rateStr = s.hourlyRate ? ` - ${s.hourlyRate} kr/h` : '';
        staffListItems.push(`- ${s.name}${roleStr}${rateStr} - ${formattedDate}`);
      });
    });
    const staffList = staffListItems.join('\n');

    // Build logistics warnings
    const logisticsWarnings: string[] = [];
    if (booking.carryMoreThan10m) {
      logisticsWarnings.push('⚠️ Bärsträcka över 10m - överväg extra personal/transportutrustning');
    }
    if (!booking.groundNailsAllowed) {
      logisticsWarnings.push('⚠️ Markspett EJ tillåtet - kräver alternativ förankring');
    }
    if (booking.exactTimeNeeded) {
      logisticsWarnings.push(`⚠️ Exakt tid krävs: ${booking.exactTimeInfo || 'Se anteckningar'}`);
    }

    // Build context string
    let context = `
Du är en erfaren planeringsassistent för etablering av event. Du hjälper till att planera och optimera etableringsscheman.

═══════════════════════════════════════════════════
AKTUELL BOKNING
═══════════════════════════════════════════════════
• Bokningsnummer: ${booking.bookingNumber || 'Ej angivet'}
• Kund: ${booking.client}
• Status: ${booking.status || 'Okänd'}
• Adress: ${fullAddress}

KONTAKTPERSON:
• Namn: ${booking.contactName || 'Ej angiven'}
• Telefon: ${booking.contactPhone || 'Ej angiven'}
• E-post: ${booking.contactEmail || 'Ej angiven'}

═══════════════════════════════════════════════════
DATUM & TIDER
═══════════════════════════════════════════════════
• Riggdag: ${formatDate(dates.rigdaydate)}${dates.rig_start_time ? ` (${formatTime(dates.rig_start_time)} - ${formatTime(dates.rig_end_time)})` : ''}
• Eventdag: ${formatDate(dates.eventdate)}${dates.event_start_time ? ` (${formatTime(dates.event_start_time)} - ${formatTime(dates.event_end_time)})` : ''}
• Avetablering: ${formatDate(dates.rigdowndate)}${dates.rigdown_start_time ? ` (${formatTime(dates.rigdown_start_time)} - ${formatTime(dates.rigdown_end_time)})` : ''}

═══════════════════════════════════════════════════
LOGISTIK
═══════════════════════════════════════════════════
• Bärsträcka över 10m: ${booking.carryMoreThan10m ? 'Ja' : 'Nej'}
• Markspett tillåtet: ${booking.groundNailsAllowed ? 'Ja' : 'Nej'}
• Exakt tid krävs: ${booking.exactTimeNeeded ? `Ja - "${booking.exactTimeInfo || 'Se anteckningar'}"` : 'Nej'}

${logisticsWarnings.length > 0 ? `VIKTIGA VARNINGAR:\n${logisticsWarnings.join('\n')}\n` : ''}
═══════════════════════════════════════════════════
PRODUKTER (${products.length} st${totalProductValue > 0 ? `, totalt ${totalProductValue.toLocaleString('sv-SE')} kr` : ''}${totalSetupHours > 0 ? `, ~${totalSetupHours}h beräknat arbete` : ''})
═══════════════════════════════════════════════════
${productList || 'Inga produkter angivna'}

═══════════════════════════════════════════════════
TILLDELAD PERSONAL (${assignedStaff.length} personer)
═══════════════════════════════════════════════════
${staffList || 'Ingen personal tilldelad'}
`;

    // Add project context if available
    if (project) {
      context += `
═══════════════════════════════════════════════════
PROJEKTSTATUS
═══════════════════════════════════════════════════
• Projekt: ${project.name}
• Status: ${project.status}
• Projektledare: ${project.projectLeader || 'Ej angiven'}
• Förberedelser: ${project.tasksCompleted}/${project.tasksTotal} klara
`;
    }

    // Add time report history
    if (timeReports && timeReports.reportCount > 0) {
      context += `
═══════════════════════════════════════════════════
HISTORISK DATA (från tidigare tidrapporter)
═══════════════════════════════════════════════════
• Totalt rapporterade timmar: ${timeReports.totalHours.toFixed(1)}h
• Antal rapporter: ${timeReports.reportCount}
• Snitt per arbetsdag: ${timeReports.averageHoursPerDay.toFixed(1)}h
`;
    }

    // Add packing status
    if (packing) {
      const packingProgress = packing.itemsTotal > 0 
        ? Math.round((packing.itemsPacked / packing.itemsTotal) * 100) 
        : 0;
      context += `
═══════════════════════════════════════════════════
PACKNINGSSTATUS
═══════════════════════════════════════════════════
• Status: ${packing.status}
• Progress: ${packing.itemsPacked}/${packing.itemsTotal} artiklar packade (${packingProgress}%)
`;
    }

    // Add internal notes
    if (booking.internalNotes) {
      context += `
═══════════════════════════════════════════════════
INTERNA ANTECKNINGAR
═══════════════════════════════════════════════════
"${booking.internalNotes}"
`;
    }

    context += `
═══════════════════════════════════════════════════
DINA INSTRUKTIONER
═══════════════════════════════════════════════════
- Ge konkreta, praktiska förslag för etableringsplanering
- Ta hänsyn till produkternas storlek, setup-timmar och komplexitet
- Föreslå realistiska tidsramar baserat på beräknade arbetstimmar
- VIKTIGT: Beakta logistikvarningar (bärsträcka, markspett, exakt tid)
- Om du föreslår ett schema, formatera det tydligt med datum och tider
- Var proaktiv med att identifiera potentiella problem eller risker
- Om packning inte är klar, påminn om detta
- Ta hänsyn till personalens roller och kompetenser
- Svara alltid på svenska
`;

    return context.trim();
  };

  const generateSuggestions = async () => {
    setIsGeneratingSuggestions(true);
    
    try {
      const response = await supabase.functions.invoke('establishment-ai-assistant', {
        body: {
          type: 'suggestions',
          context: buildContext(),
          bookingData
        }
      });

      if (response.error) throw response.error;
      
      if (response.data?.suggestions) {
        setSuggestions(response.data.suggestions);
      }
    } catch (error) {
      console.error('Failed to generate suggestions:', error);
      // Set fallback suggestions
      setSuggestions([
        {
          id: '1',
          title: 'Generera tidsschema',
          description: 'Skapa ett optimalt etableringsschema baserat på produkter och personal'
        },
        {
          id: '2',
          title: 'Analysera resursbehov',
          description: 'Bedöm om tilldelad personal räcker för uppdraget'
        },
        {
          id: '3',
          title: 'Identifiera risker',
          description: 'Hitta potentiella problem med planeringen'
        }
      ]);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const sendMessage = async (messageText?: string) => {
    const text = messageText || input.trim();
    if (!text || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: text
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const response = await supabase.functions.invoke('establishment-ai-assistant', {
        body: {
          type: 'chat',
          messages: [...messages, userMessage].map(m => ({
            role: m.role,
            content: m.content
          })),
          context: buildContext()
        }
      });

      if (response.error) throw response.error;

      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.data?.message || 'Jag kunde inte generera ett svar just nu.'
      };

      setMessages(prev => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Chat error:', error);
      toast.error('Kunde inte skicka meddelande');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Tyvärr uppstod ett fel. Försök igen eller kontrollera din anslutning.'
      };
      setMessages(prev => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const handleSuggestionClick = (suggestion: Suggestion) => {
    sendMessage(suggestion.description);
  };

  return (
    <Card className="h-full flex flex-col">
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Bot className="h-4 w-4 text-primary" />
          Planeringsassistent
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          AI som lär sig era arbetsrutiner
        </p>
      </CardHeader>
      <CardContent className="flex-1 flex flex-col gap-3 p-3 pt-0 overflow-hidden">
        {/* Quick Suggestions */}
        {suggestions.length > 0 && messages.length === 0 && (
          <div className="space-y-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <Lightbulb className="h-3.5 w-3.5" />
              <span>Förslag baserat på bokningen</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {suggestions.map((suggestion) => (
                <Button
                  key={suggestion.id}
                  variant="outline"
                  size="sm"
                  className="h-auto py-1.5 px-2.5 text-xs whitespace-normal text-left"
                  onClick={() => handleSuggestionClick(suggestion)}
                  disabled={isLoading}
                >
                  <Sparkles className="h-3 w-3 mr-1.5 flex-shrink-0 text-amber-500" />
                  {suggestion.title}
                </Button>
              ))}
            </div>
          </div>
        )}

        {/* Chat Messages */}
        <ScrollArea className="flex-1" ref={scrollRef}>
          <div className="space-y-3 pr-2">
            {messages.length === 0 && (
              <div className="text-center py-6 text-sm text-muted-foreground">
                <Bot className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>Jag är din planeringsassistent.</p>
                <p className="text-xs mt-1">
                  Ställ frågor om etablering eller använd förslagen ovan.
                </p>
              </div>
            )}
            
            {messages.map((message) => (
              <div
                key={message.id}
                className={cn(
                  "flex",
                  message.role === 'user' ? "justify-end" : "justify-start"
                )}
              >
                <div
                  className={cn(
                    "max-w-[85%] rounded-lg px-3 py-2 text-sm",
                    message.role === 'user'
                      ? "bg-primary text-primary-foreground"
                      : "bg-muted"
                  )}
                >
                  {message.role === 'assistant' ? (
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                    </div>
                  ) : (
                    <p>{message.content}</p>
                  )}
                </div>
              </div>
            ))}
            
            {isLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-3 py-2">
                  <Loader2 className="h-4 w-4 animate-spin" />
                </div>
              </div>
            )}
          </div>
        </ScrollArea>

        {/* Input */}
        <div className="flex gap-2">
          <Textarea
            ref={inputRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ställ en fråga om planeringen..."
            className="min-h-[40px] max-h-[100px] resize-none text-sm"
            disabled={isLoading}
          />
          <Button
            size="icon"
            onClick={() => sendMessage()}
            disabled={!input.trim() || isLoading}
            className="flex-shrink-0"
          >
            {isLoading ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
};

export default EstablishmentAIAssistant;
