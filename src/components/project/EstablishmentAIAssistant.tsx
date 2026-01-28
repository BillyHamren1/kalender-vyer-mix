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
  bookingData: {
    client: string;
    products: { name: string; quantity: number }[];
    dates: {
      rigdaydate: string | null;
      eventdate: string | null;
      rigdowndate: string | null;
    };
    assignedStaff: { name: string; role: string | null; assignment_date: string }[];
    address: string | null;
  };
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
    if (bookingData.products.length > 0 || bookingData.dates.rigdaydate) {
      generateSuggestions();
    }
  }, []);

  const scrollToBottom = () => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const buildContext = () => {
    const productList = bookingData.products.map(p => `- ${p.name} (${p.quantity} st)`).join('\n');
    const staffList = bookingData.assignedStaff.map(s => `- ${s.name}${s.role ? ` (${s.role})` : ''} - ${s.assignment_date}`).join('\n');
    
    return `
Du är en erfaren planeringsassistent för etablering av event. Du hjälper till att planera och optimera etableringsscheman.

AKTUELL BOKNING:
- Kund: ${bookingData.client}
- Adress: ${bookingData.address || 'Ej angiven'}
- Riggdag: ${bookingData.dates.rigdaydate || 'Ej angiven'}
- Eventdag: ${bookingData.dates.eventdate || 'Ej angiven'}
- Avetablering: ${bookingData.dates.rigdowndate || 'Ej angiven'}

PRODUKTER ATT ETABLERA:
${productList || 'Inga produkter angivna'}

TILLDELAD PERSONAL:
${staffList || 'Ingen personal tilldelad'}

INSTRUKTIONER:
- Ge konkreta, praktiska förslag för etableringsplanering
- Ta hänsyn till produkternas storlek och komplexitet
- Föreslå realistiska tidsramar baserat på erfarenhet
- Om du föreslår ett schema, formatera det tydligt med datum och tider
- Var proaktiv med att identifiera potentiella problem eller risker
- Svara alltid på svenska
`.trim();
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
