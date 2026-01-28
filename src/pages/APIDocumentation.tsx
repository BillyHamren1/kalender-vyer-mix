import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Copy, Check, Key, Calendar, FileText, MessageSquare, Upload, Clock, User, MapPin, Smartphone, Zap, Camera, Navigation } from 'lucide-react';
import { toast } from 'sonner';

const API_BASE_URL = 'https://pihrhltinhewhoxefjxv.supabase.co/functions/v1/mobile-app-api';

interface EndpointProps {
  action: string;
  description: string;
  icon: React.ReactNode;
  requiresAuth: boolean;
  requestExample: object;
  responseExample: object;
  notes?: string[];
}

const CodeBlock = ({ code, language = 'json' }: { code: string; language?: string }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    toast.success('Kopierat till urklipp');
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-muted p-4 rounded-lg overflow-x-auto text-sm">
        <code className={`language-${language}`}>{code}</code>
      </pre>
      <Button
        variant="ghost"
        size="icon"
        className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
        onClick={handleCopy}
      >
        {copied ? <Check className="h-4 w-4 text-primary" /> : <Copy className="h-4 w-4" />}
      </Button>
    </div>
  );
};

const EndpointCard = ({ endpoint }: { endpoint: EndpointProps }) => {
  const [isOpen, setIsOpen] = useState(false);

  return (
    <Collapsible open={isOpen} onOpenChange={setIsOpen}>
      <Card className="mb-4">
        <CollapsibleTrigger asChild>
          <CardHeader className="cursor-pointer hover:bg-muted/50 transition-colors">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/10 text-primary">
                  {endpoint.icon}
                </div>
                <div>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <code className="text-primary font-mono">{endpoint.action}</code>
                    {endpoint.requiresAuth && (
                      <Badge variant="outline" className="text-xs">
                        <Key className="h-3 w-3 mr-1" />
                        Auth
                      </Badge>
                    )}
                  </CardTitle>
                  <CardDescription>{endpoint.description}</CardDescription>
                </div>
              </div>
              {isOpen ? <ChevronDown className="h-5 w-5" /> : <ChevronRight className="h-5 w-5" />}
            </div>
          </CardHeader>
        </CollapsibleTrigger>
        <CollapsibleContent>
          <CardContent className="space-y-4">
            {endpoint.notes && endpoint.notes.length > 0 && (
              <div className="bg-accent/50 border border-border rounded-lg p-3">
                <p className="text-sm font-medium text-accent-foreground mb-1">Observera:</p>
                <ul className="text-sm text-muted-foreground list-disc list-inside space-y-1">
                  {endpoint.notes.map((note, i) => (
                    <li key={i}>{note}</li>
                  ))}
                </ul>
              </div>
            )}
            
            <div>
              <h4 className="font-semibold mb-2">Request</h4>
              <CodeBlock code={JSON.stringify(endpoint.requestExample, null, 2)} />
            </div>
            
            <div>
              <h4 className="font-semibold mb-2">Response</h4>
              <CodeBlock code={JSON.stringify(endpoint.responseExample, null, 2)} />
            </div>
          </CardContent>
        </CollapsibleContent>
      </Card>
    </Collapsible>
  );
};

const APIDocumentation = () => {
  const [promptCopied, setPromptCopied] = useState(false);

  const implementationPrompt = `# PROMPT: Bygg Tidrapporteringsapp med GPS-baserad Automatisk Tidtagning

## Översikt
Skapa en mobilapp (React Native/Flutter/Swift/Kotlin) för fältpersonal som:
1. Loggar in med användarnamn/lösenord
2. Visar schemalagda jobb med ALL information
3. AUTOMATISKT startar tidrapportering när personal anländer till arbetsplatsen (GPS)
4. AUTOMATISKT stoppar tidrapportering när personal lämnar arbetsplatsen
5. Hanterar utlägg med kvittofotografering
6. Möjliggör kommentarer och filuppladdning till projekt

## API-ENDPOINT
POST ${API_BASE_URL}

Alla anrop är POST-requests med JSON-body. Ange "action" för att specificera operation.

---

## AUTENTISERING

### Login
\`\`\`json
{
  "action": "login",
  "data": {
    "username": "fornamn.efternamn",
    "password": "lösenord"
  }
}
\`\`\`

Response innehåller "token" som ska sparas säkert och skickas med i alla efterföljande anrop.
Token är giltig i 24 timmar.

---

## GPS-BASERAD AUTOMATISK TIDRAPPORTERING

### Koncept
1. Hämta bokningar med \`get_bookings\` - varje bokning innehåller:
   - \`delivery_latitude\` (GPS latitud)
   - \`delivery_longitude\` (GPS longitud)
   
2. Implementera GEOFENCING:
   - Definiera en radie (rekommenderat: 100-200 meter)
   - Övervaka användarens position kontinuerligt
   - När användaren KOMMER INOM radien → starta timer automatiskt
   - När användaren LÄMNAR radien → stoppa timer och skapa tidrapport

3. Spara tidrapport via \`create_time_report\`:
   - start_time: När användaren kom till platsen
   - end_time: När användaren lämnade platsen
   - hours_worked: Beräknas automatiskt (end - start - pauser)

### Implementeringsdetaljer för Geofencing

\`\`\`pseudocode
// Vid appstart efter login
bookings = await api.getBookings(token)

for each booking in bookings:
  geofence = createCircularGeofence(
    latitude: booking.delivery_latitude,
    longitude: booking.delivery_longitude,
    radius: 150  // meter
  )
  
  geofence.onEnter = () => {
    startTimer(booking.id)
    showNotification("Tidrapportering startad för " + booking.client)
  }
  
  geofence.onExit = () => {
    stopTimer(booking.id)
    promptForBreakTime()  // Fråga om rast
    submitTimeReport(booking.id)
    showNotification("Tidrapport sparad")
  }
\`\`\`

---

## HÄMTA BOKNINGAR

### get_bookings
Returnerar alla bokningar där användaren är schemalagd.

Request:
\`\`\`json
{
  "action": "get_bookings",
  "token": "SESSION_TOKEN"
}
\`\`\`

Response:
\`\`\`json
{
  "bookings": [
    {
      "id": "uuid",
      "client": "Kundnamn AB",
      "booking_number": "B2026-0042",
      "deliveryaddress": "Storgatan 1",
      "delivery_city": "Stockholm",
      "delivery_postal_code": "111 22",
      "delivery_latitude": 59.3293,    // GPS FÖR GEOFENCING
      "delivery_longitude": 18.0686,   // GPS FÖR GEOFENCING
      "rigdaydate": "2026-02-14",
      "eventdate": "2026-02-15",
      "rigdowndate": "2026-02-16",
      "rig_start_time": "08:00",
      "rig_end_time": "17:00",
      "event_start_time": "10:00",
      "event_end_time": "22:00",
      "rigdown_start_time": "09:00",
      "rigdown_end_time": "14:00",
      "internalnotes": "Parkering på baksidan",
      "status": "CONFIRMED",
      "assignment_dates": ["2026-02-14", "2026-02-15"]
    }
  ]
}
\`\`\`

---

## DETALJERAD JOBBINFORMATION

### get_booking_details
Hämtar ALLT om ett jobb: produkter, personal, filer, projekt, etc.

Request:
\`\`\`json
{
  "action": "get_booking_details",
  "token": "SESSION_TOKEN",
  "data": { "booking_id": "uuid" }
}
\`\`\`

Response innehåller:
- booking: All bokningsinfo med GPS-koordinater
- planning.assigned_staff: Lista med all schemalagd personal (namn, telefon, email, roll)
- planning.calendar_events: Alla kalenderhändelser
- project: Projektinfo med tasks, comments, files, purchases
- my_time_reports: Användarens egna tidrapporter för detta jobb

---

## SKAPA TIDRAPPORT

### create_time_report

Request:
\`\`\`json
{
  "action": "create_time_report",
  "token": "SESSION_TOKEN",
  "data": {
    "booking_id": "uuid",
    "report_date": "2026-02-14",
    "start_time": "08:00",
    "end_time": "17:00",
    "hours_worked": 8,
    "overtime_hours": 0,
    "break_time": 1,
    "description": "Riggning av scen och PA-system"
  }
}
\`\`\`

---

## UTLÄGG MED KVITTOFOTO

### create_purchase
Personalen kan fotografera kvitton som sparas automatiskt.

Request:
\`\`\`json
{
  "action": "create_purchase",
  "token": "SESSION_TOKEN",
  "data": {
    "booking_id": "uuid",
    "description": "Kablar och tejp",
    "amount": 450,
    "supplier": "Bauhaus",
    "category": "material",
    "purchase_date": "2026-02-14",
    "receipt_image": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  }
}
\`\`\`

Kategorier: material, transport, mat, övrigt
Max filstorlek: 10MB

---

## PROJEKTKOMMENTARER

### create_comment

Request:
\`\`\`json
{
  "action": "create_comment",
  "token": "SESSION_TOKEN",
  "data": {
    "booking_id": "uuid",
    "content": "Leverans försenad 1 timme, kunden informerad"
  }
}
\`\`\`

---

## FILUPPLADDNING

### upload_file
För att ladda upp foton från arbetsplatsen.

Request:
\`\`\`json
{
  "action": "upload_file",
  "token": "SESSION_TOKEN",
  "data": {
    "booking_id": "uuid",
    "file_name": "rigg-foto.jpg",
    "file_type": "image/jpeg",
    "file_data": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."
  }
}
\`\`\`

---

## ÖVRIGA ENDPOINTS

- \`me\` - Hämta inloggad användares profil
- \`get_time_reports\` - Hämta egna tidrapporter
- \`get_project_comments\` - Hämta projektkommentarer
- \`get_project_files\` - Hämta projektfiler
- \`get_project_purchases\` - Hämta projektutlägg

---

## FELHANTERING

Vid fel returneras:
\`\`\`json
{
  "success": false,
  "error": "Felbeskrivning"
}
\`\`\`

Statuskoder:
- 401: Ogiltig/utgången token
- 403: Ingen åtkomst till resursen
- 404: Resurs hittades inte
- 400: Ogiltiga parametrar

---

## MOBILAPP-FUNKTIONER ATT IMPLEMENTERA

### Startsida (efter login)
- Lista alla schemalagda jobb (sorterat på datum)
- Visa nästa jobb prominent med karta och ETA
- Indikator för aktiv GPS-spårning

### Jobbvy
- Fullständig jobbinformation
- Karta med leveransadress (använd GPS-koordinaterna)
- Navigation till platsen (öppna i Google Maps/Apple Maps)
- Lista med schemalagd personal + kontaktinfo
- Projektuppgifter (checklist)
- Kommentarer (läs/skriv)
- Filer/bilder

### Tidrapportering
- Automatisk start/stopp via GPS (HUVUDFUNKTION)
- Manuell override (om GPS misslyckas)
- Pausknapp för raster
- Historik över egna rapporter

### Utlägg
- Fotografera kvitto
- Ange belopp, leverantör, kategori
- Lista tidigare utlägg

### Inställningar
- GPS-radie för geofencing (standard 150m)
- Notifikationsinställningar
- Manuellt läge (stäng av auto-GPS)

---

## TEKNISKA KRAV

- HTTPS för alla anrop
- Spara token säkert (Keychain/Keystore)
- Bakgrunds-GPS för geofencing
- Push-notifikationer för påminnelser
- Offline-stöd: Spara tidrapporter lokalt och synka när online`;

  const handleCopyPrompt = () => {
    navigator.clipboard.writeText(implementationPrompt);
    setPromptCopied(true);
    toast.success('Hela prompten kopierad!');
    setTimeout(() => setPromptCopied(false), 3000);
  };

  const authEndpoints: EndpointProps[] = [
    {
      action: 'login',
      description: 'Logga in med användarnamn och lösenord',
      icon: <Key className="h-5 w-5" />,
      requiresAuth: false,
      requestExample: {
        action: 'login',
        data: {
          username: 'fornamn.efternamn',
          password: 'ditt_lösenord'
        }
      },
      responseExample: {
        success: true,
        token: 'eyJzdGFmZl9pZCI6IjM2NWY0ZDU1LWI0YTgtNDI0OC04ZTNhLThkNWI0MGFmMWUzYiIsImV4cCI6MTczODA...',
        staff: {
          id: '365f4d55-b4a8-4248-8e3a-8d5b40af1e3b',
          name: 'Anders Andersson',
          email: 'anders@example.com',
          phone: '070-123 45 67',
          role: 'Tekniker',
          hourly_rate: 350,
          overtime_rate: 525
        }
      },
      notes: [
        'Användarnamn är alltid i formatet fornamn.efternamn (gemener)',
        'Token är giltig i 24 timmar',
        'Spara token säkert (Keychain/Keystore) för efterföljande anrop',
        'hourly_rate och overtime_rate kan användas för att visa löneberäkning'
      ]
    },
    {
      action: 'me',
      description: 'Hämta information om inloggad användare',
      icon: <User className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'me',
        token: 'eyJzdGFmZl9pZCI6...'
      },
      responseExample: {
        success: true,
        staff: {
          id: '365f4d55-b4a8-4248-8e3a-8d5b40af1e3b',
          name: 'Anders Andersson',
          email: 'anders@example.com',
          phone: '070-123 45 67',
          role: 'Tekniker',
          department: 'Produktion',
          hourly_rate: 350,
          overtime_rate: 525
        }
      }
    }
  ];

  const bookingEndpoints: EndpointProps[] = [
    {
      action: 'get_bookings',
      description: 'Hämta alla bokningar där du är schemalagd (med GPS-koordinater)',
      icon: <Calendar className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_bookings',
        token: 'eyJzdGFmZl9pZCI6...'
      },
      responseExample: {
        success: true,
        bookings: [
          {
            id: 'abc-123-def',
            client: 'Företag AB',
            booking_number: 'B2026-0042',
            eventdate: '2026-02-15',
            rigdaydate: '2026-02-14',
            rigdowndate: '2026-02-16',
            deliveryaddress: 'Storgatan 1',
            delivery_city: 'Stockholm',
            delivery_postal_code: '111 22',
            delivery_latitude: 59.3293,
            delivery_longitude: 18.0686,
            rig_start_time: '08:00',
            rig_end_time: '17:00',
            event_start_time: '10:00',
            event_end_time: '22:00',
            rigdown_start_time: '09:00',
            rigdown_end_time: '14:00',
            internalnotes: 'Parkering på baksidan',
            status: 'CONFIRMED',
            assigned_project_id: 'proj-123',
            assigned_project_name: 'Företag AB - Event 2026',
            assignment_dates: ['2026-02-14', '2026-02-15']
          }
        ]
      },
      notes: [
        'Returnerar endast CONFIRMED bokningar där du är tilldelad',
        'delivery_latitude och delivery_longitude används för GPS-baserad geofencing',
        'assignment_dates visar alla dagar du är schemalagd på detta jobb',
        'Endast framtida/aktuella datum returneras'
      ]
    },
    {
      action: 'get_booking_details',
      description: 'Hämta KOMPLETT information om en bokning inkl. planering, projekt och personal',
      icon: <FileText className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_booking_details',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def'
        }
      },
      responseExample: {
        booking: {
          id: 'abc-123-def',
          client: 'Företag AB',
          booking_number: 'B2026-0042',
          eventdate: '2026-02-15',
          event_start_time: '10:00',
          event_end_time: '22:00',
          rigdaydate: '2026-02-14',
          rig_start_time: '08:00',
          rig_end_time: '17:00',
          rigdowndate: '2026-02-16',
          rigdown_start_time: '09:00',
          rigdown_end_time: '14:00',
          deliveryaddress: 'Storgatan 1',
          delivery_city: 'Stockholm',
          delivery_postal_code: '111 22',
          delivery_latitude: 59.3293,
          delivery_longitude: 18.0686,
          contact_name: 'Anna Kontaktsson',
          contact_phone: '08-123 45 67',
          contact_email: 'anna@foretag.se',
          carry_more_than_10m: false,
          ground_nails_allowed: true,
          exact_time_needed: true,
          exact_time_info: 'Exakt kl 10:00',
          internalnotes: 'Parkering på baksidan. Hiss finns.',
          status: 'CONFIRMED',
          products: [
            { id: 'p1', name: 'Scen 6x4m', quantity: 1, notes: 'Med tak' },
            { id: 'p2', name: 'PA-system', quantity: 2, notes: null }
          ],
          attachments: [
            { id: 'a1', file_name: 'ritning.pdf', url: 'https://...', file_type: 'application/pdf' }
          ]
        },
        planning: {
          assigned_staff: [
            {
              id: '365f4d55-...',
              name: 'Anders Andersson',
              role: 'Tekniker',
              phone: '070-123 45 67',
              email: 'anders@example.com',
              color: '#279B9E',
              assignments: [
                { date: '2026-02-14', team_id: 'team-1' },
                { date: '2026-02-15', team_id: 'team-1' }
              ]
            },
            {
              id: '789xyz...',
              name: 'Maria Johansson',
              role: 'Projektledare',
              phone: '070-987 65 43',
              email: 'maria@example.com',
              color: '#4A90D9',
              assignments: [
                { date: '2026-02-14', team_id: 'team-1' }
              ]
            }
          ],
          calendar_events: [
            {
              id: 'ev1',
              title: 'Rigg - Företag AB',
              event_type: 'rigg',
              start_time: '2026-02-14T08:00:00',
              end_time: '2026-02-14T17:00:00',
              delivery_address: 'Storgatan 1, Stockholm'
            }
          ]
        },
        project: {
          id: 'proj-123',
          name: 'Företag AB - Event 2026',
          status: 'active',
          project_leader: 'Maria Johansson',
          tasks: [
            { id: 't1', title: 'Förbereda material', completed: true, deadline: '2026-02-13', assigned_to: null },
            { id: 't2', title: 'Rigg på plats', completed: false, deadline: '2026-02-14', assigned_to: '365f4d55-...' }
          ],
          comments: [
            { id: 'c1', author_name: 'Maria Johansson', content: 'Kunden vill ha extra belysning', created_at: '2026-01-20T10:30:00' }
          ],
          files: [
            { id: 'f1', file_name: 'planlösning.pdf', url: 'https://...', file_type: 'application/pdf', uploaded_at: '2026-01-15T09:00:00' }
          ],
          purchases: [
            { id: 'pu1', description: 'Extra kablar', amount: 450, supplier: 'Elgiganten', category: 'material', receipt_url: 'https://...' }
          ]
        },
        my_time_reports: [
          { id: 'tr1', report_date: '2026-02-14', hours_worked: 8, start_time: '08:00', end_time: '17:00', break_time: 1 }
        ]
      },
      notes: [
        'Returnerar ALL information kopplad till bokningen i ett anrop',
        'planning.assigned_staff innehåller kontaktuppgifter till alla kollegor',
        'project innehåller tasks, comments, files och purchases',
        'my_time_reports innehåller endast DINA egna rapporter för detta jobb',
        'Använd delivery_latitude/longitude för att visa karta och navigering'
      ]
    }
  ];

  const timeReportEndpoints: EndpointProps[] = [
    {
      action: 'create_time_report',
      description: 'Skapa en ny tidrapport (anropas automatiskt vid GPS exit eller manuellt)',
      icon: <Clock className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'create_time_report',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def',
          report_date: '2026-02-14',
          start_time: '08:00',
          end_time: '17:00',
          hours_worked: 8,
          overtime_hours: 0,
          break_time: 1,
          description: 'Riggning av scen och PA-system'
        }
      },
      responseExample: {
        success: true,
        time_report: {
          id: 'tr-new-123',
          booking_id: 'abc-123-def',
          staff_id: '365f4d55-...',
          report_date: '2026-02-14',
          start_time: '08:00',
          end_time: '17:00',
          hours_worked: 8,
          overtime_hours: 0,
          break_time: 1,
          description: 'Riggning av scen och PA-system',
          created_at: '2026-02-14T17:30:00'
        }
      },
      notes: [
        'Anropas automatiskt när användaren lämnar geofence-zonen',
        'start_time och end_time loggas av appen vid GPS enter/exit',
        'break_time frågas användaren om vid exit',
        'hours_worked = (end_time - start_time - break_time)',
        'overtime_hours beräknas om arbetstid > 8 timmar',
        'Kontrollerar att användaren är tilldelad bokningen'
      ]
    },
    {
      action: 'get_time_reports',
      description: 'Hämta dina tidrapporter (valfritt filtrerat på bokning)',
      icon: <Clock className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_time_reports',
        token: 'eyJzdGFmZl9pZCI6...'
      },
      responseExample: {
        success: true,
        time_reports: [
          {
            id: 'tr1',
            booking_id: 'abc-123-def',
            report_date: '2026-02-14',
            start_time: '08:00',
            end_time: '17:00',
            hours_worked: 8,
            overtime_hours: 0,
            break_time: 1,
            description: 'Riggning av scen och PA',
            created_at: '2026-02-14T17:30:00',
            bookings: {
              id: 'abc-123-def',
              client: 'Företag AB',
              booking_number: 'B2026-0042'
            }
          }
        ]
      },
      notes: [
        'Returnerar de 50 senaste rapporterna',
        'Sorteras efter report_date (senaste först)',
        'Inkluderar bokningsinformation för varje rapport'
      ]
    }
  ];

  const projectEndpoints: EndpointProps[] = [
    {
      action: 'create_purchase',
      description: 'Skapa ett utlägg/inköp med kvittofoto från kameran',
      icon: <Camera className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'create_purchase',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def',
          description: 'Kablar och tejp',
          amount: 450,
          supplier: 'Bauhaus',
          category: 'material',
          purchase_date: '2026-02-14',
          receipt_image: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
        }
      },
      responseExample: {
        success: true,
        purchase: {
          id: 'pu-new-123',
          project_id: 'proj-123',
          description: 'Kablar och tejp',
          amount: 450,
          supplier: 'Bauhaus',
          category: 'material',
          receipt_url: 'https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/project-files/receipts/...',
          created_at: '2026-02-14T12:00:00',
          created_by: 'Anders Andersson'
        }
      },
      notes: [
        'receipt_image: Ta foto med kameran, konvertera till base64',
        'Stödda format: JPEG, PNG, WebP',
        'Max filstorlek: 10MB',
        'category: material, transport, mat, övrigt',
        'Kvittot sparas och visas i admin-systemets projektvy'
      ]
    },
    {
      action: 'create_comment',
      description: 'Lägg till en kommentar i projektet',
      icon: <MessageSquare className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'create_comment',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def',
          content: 'Leverans framflyttad 1 timme, kunden informerad'
        }
      },
      responseExample: {
        success: true,
        comment: {
          id: 'c-new-123',
          project_id: 'proj-123',
          author_name: 'Anders Andersson',
          content: 'Leverans framflyttad 1 timme, kunden informerad',
          created_at: '2026-02-14T09:15:00'
        }
      },
      notes: [
        'Kommentaren kopplas automatiskt till rätt projekt via booking_id',
        'Ditt namn hämtas från din profil',
        'Synkroniseras i realtid med admin-webben'
      ]
    },
    {
      action: 'upload_file',
      description: 'Ladda upp foto/fil från arbetsplatsen',
      icon: <Upload className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'upload_file',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def',
          file_name: 'rigg-foto-dag1.jpg',
          file_type: 'image/jpeg',
          file_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
        }
      },
      responseExample: {
        success: true,
        file: {
          id: 'f-new-123',
          project_id: 'proj-123',
          file_name: 'rigg-foto-dag1.jpg',
          file_type: 'image/jpeg',
          url: 'https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/project-files/...',
          uploaded_by: 'Anders Andersson',
          uploaded_at: '2026-02-14T14:30:00'
        }
      },
      notes: [
        'Stödda format: JPEG, PNG, WebP, PDF, HEIC',
        'Max filstorlek: 10MB',
        'Bilder syns direkt i admin-webbens projektvy',
        'Använd för att dokumentera arbetsplatsen, problem, eller färdigt resultat'
      ]
    },
    {
      action: 'get_project_comments',
      description: 'Hämta alla kommentarer för ett projekt',
      icon: <MessageSquare className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_project_comments',
        token: 'eyJzdGFmZl9pZCI6...',
        data: { booking_id: 'abc-123-def' }
      },
      responseExample: {
        success: true,
        comments: [
          { id: 'c1', author_name: 'Maria Johansson', content: 'Kunden vill ha extra belysning', created_at: '2026-01-20T10:30:00' },
          { id: 'c2', author_name: 'Anders Andersson', content: 'Noterat, tar med extra spots', created_at: '2026-01-20T11:15:00' }
        ]
      }
    },
    {
      action: 'get_project_files',
      description: 'Hämta alla filer för ett projekt',
      icon: <FileText className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_project_files',
        token: 'eyJzdGFmZl9pZCI6...',
        data: { booking_id: 'abc-123-def' }
      },
      responseExample: {
        success: true,
        files: [
          { id: 'f1', file_name: 'planlösning.pdf', url: 'https://...', file_type: 'application/pdf', uploaded_by: 'Maria Johansson', uploaded_at: '2026-01-15T09:00:00' },
          { id: 'f2', file_name: 'rigg-foto.jpg', url: 'https://...', file_type: 'image/jpeg', uploaded_by: 'Anders Andersson', uploaded_at: '2026-02-14T08:30:00' }
        ]
      }
    },
    {
      action: 'get_project_purchases',
      description: 'Hämta alla utlägg/inköp för ett projekt',
      icon: <FileText className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_project_purchases',
        token: 'eyJzdGFmZl9pZCI6...',
        data: { booking_id: 'abc-123-def' }
      },
      responseExample: {
        success: true,
        purchases: [
          { id: 'pu1', description: 'Extra kablar', amount: 450, supplier: 'Elgiganten', category: 'material', receipt_url: 'https://...', purchase_date: '2026-02-14', created_by: 'Anders Andersson' }
        ]
      }
    }
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">API-dokumentation för Tidrapporteringsappen</h1>
        <p className="text-muted-foreground mb-4">
          Komplett dokumentation med GPS-baserad automatisk tidrapportering
        </p>
        
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">POST</Badge>
              <code className="text-sm font-mono">{API_BASE_URL}</code>
            </div>
            <p className="text-sm text-muted-foreground">
              Alla anrop går till samma endpoint. Ange <code className="bg-muted px-1 rounded">action</code> för att specificera operation.
            </p>
          </CardContent>
        </Card>
      </div>

      {/* GPS Feature Highlight */}
      <Card className="mb-8 border-primary/50 bg-primary/5">
        <CardHeader>
          <div className="flex items-center gap-3">
            <div className="p-3 rounded-full bg-primary text-primary-foreground">
              <Navigation className="h-6 w-6" />
            </div>
            <div>
              <CardTitle className="flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                GPS-baserad Automatisk Tidrapportering
              </CardTitle>
              <CardDescription>
                Huvudfunktion: Automatisk start/stopp av tid baserat på platsdata
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-3 gap-4">
            <div className="flex items-start gap-3 p-4 bg-background rounded-lg">
              <Zap className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-medium">1. Geofencing</h4>
                <p className="text-sm text-muted-foreground">
                  Använd delivery_latitude/longitude för att skapa en virtuell zon (100-200m radie)
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-background rounded-lg">
              <Clock className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-medium">2. Auto-start</h4>
                <p className="text-sm text-muted-foreground">
                  När personal kommer inom zonen → starta timer automatiskt
                </p>
              </div>
            </div>
            <div className="flex items-start gap-3 p-4 bg-background rounded-lg">
              <FileText className="h-5 w-5 text-primary mt-0.5" />
              <div>
                <h4 className="font-medium">3. Auto-rapport</h4>
                <p className="text-sm text-muted-foreground">
                  När personal lämnar zonen → skapa tidrapport automatiskt
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Implementation Prompt */}
      <Card className="mb-8">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10 text-primary">
                <Smartphone className="h-5 w-5" />
              </div>
              <div>
                <CardTitle>Komplett Implementeringsprompt</CardTitle>
                <CardDescription>
                  Kopiera denna prompt för att bygga mobilappen
                </CardDescription>
              </div>
            </div>
            <Button onClick={handleCopyPrompt} variant="outline" className="gap-2">
              {promptCopied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
              {promptCopied ? 'Kopierat!' : 'Kopiera prompt'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="max-h-96 overflow-y-auto">
            <CodeBlock code={implementationPrompt} language="markdown" />
          </div>
        </CardContent>
      </Card>

      {/* Tabs with endpoints */}
      <Tabs defaultValue="auth" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="auth">Autentisering</TabsTrigger>
          <TabsTrigger value="bookings">Bokningar & GPS</TabsTrigger>
          <TabsTrigger value="time">Tidrapporter</TabsTrigger>
          <TabsTrigger value="project">Projekt & Media</TabsTrigger>
        </TabsList>

        <TabsContent value="auth" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Autentisering</h2>
            <p className="text-muted-foreground">
              Logga in för att få en token som används i alla efterföljande anrop.
            </p>
          </div>
          {authEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.action} endpoint={endpoint} />
          ))}
        </TabsContent>

        <TabsContent value="bookings" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Bokningar & GPS-koordinater</h2>
            <p className="text-muted-foreground">
              Hämta bokningar med GPS-koordinater för geofencing och automatisk tidrapportering.
            </p>
          </div>
          {bookingEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.action} endpoint={endpoint} />
          ))}
        </TabsContent>

        <TabsContent value="time" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Tidrapporter</h2>
            <p className="text-muted-foreground">
              Skapa och hämta tidrapporter. create_time_report anropas automatiskt vid GPS exit.
            </p>
          </div>
          {timeReportEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.action} endpoint={endpoint} />
          ))}
        </TabsContent>

        <TabsContent value="project" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Projekt & Media</h2>
            <p className="text-muted-foreground">
              Hantera utlägg med kvittofoton, kommentarer och filuppladdning.
            </p>
          </div>
          {projectEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.action} endpoint={endpoint} />
          ))}
        </TabsContent>
      </Tabs>

      {/* Error handling */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Felhantering</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground mb-4">
            Vid fel returneras alltid ett objekt med <code className="bg-muted px-1 rounded">success: false</code> och ett felmeddelande:
          </p>
          <CodeBlock code={JSON.stringify({
            success: false,
            error: "Invalid token or session expired"
          }, null, 2)} />
          
          <h4 className="font-semibold mt-6 mb-2">Statuskoder</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">401</Badge>
              <span className="text-sm">Ogiltig eller utgången token - be användaren logga in igen</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">403</Badge>
              <span className="text-sm">Ingen åtkomst till resursen - användaren är inte schemalagd på bokningen</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">404</Badge>
              <span className="text-sm">Bokning eller projekt hittades inte</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">400</Badge>
              <span className="text-sm">Ogiltiga parametrar - kontrollera request-format</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Technical requirements */}
      <Card className="mt-8">
        <CardHeader>
          <CardTitle>Tekniska Krav för Mobilappen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid md:grid-cols-2 gap-6">
            <div>
              <h4 className="font-semibold mb-3">Obligatoriskt</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <span>HTTPS för alla API-anrop</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <span>Säker tokenlagring (iOS Keychain / Android Keystore)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <span>Bakgrunds-GPS för geofencing</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <span>Kameraåtkomst för kvittofoton</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-primary mt-0.5" />
                  <span>Push-notifikationer för påminnelser</span>
                </li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold mb-3">Rekommenderat</h4>
              <ul className="space-y-2 text-sm">
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>Offline-stöd med lokal datalagring</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>Automatisk synkronisering när online</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>Manuell override för GPS-spårning</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>Konfigurerbar geofence-radie (50-500m)</span>
                </li>
                <li className="flex items-start gap-2">
                  <Check className="h-4 w-4 text-muted-foreground mt-0.5" />
                  <span>Integration med karttjänst för navigation</span>
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default APIDocumentation;
