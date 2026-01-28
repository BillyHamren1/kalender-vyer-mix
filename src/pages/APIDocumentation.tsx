import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, Copy, Check, Key, Calendar, FileText, MessageSquare, Upload, Clock, User } from 'lucide-react';
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
          role: 'Tekniker'
        }
      },
      notes: [
        'Användarnamn är alltid i formatet fornamn.efternamn (gemener)',
        'Token är giltig i 7 dagar',
        'Spara token säkert för efterföljande anrop'
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
          department: 'Produktion'
        }
      }
    }
  ];

  const bookingEndpoints: EndpointProps[] = [
    {
      action: 'get_bookings',
      description: 'Hämta alla bokningar där du är schemalagd',
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
            deliveryaddress: 'Storgatan 1, Stockholm',
            status: 'confirmed',
            assignment_date: '2026-02-14'
          }
        ]
      },
      notes: [
        'Returnerar endast bokningar där du är tilldelad',
        'Inkluderar alla datum: riggdag, eventdag, nedriggdag'
      ]
    },
    {
      action: 'get_booking_details',
      description: 'Hämta komplett information om en bokning inkl. planering, projekt och personal',
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
        success: true,
        booking: {
          id: 'abc-123-def',
          client: 'Företag AB',
          booking_number: 'B2026-0042',
          eventdate: '2026-02-15',
          event_start_time: '10:00',
          event_end_time: '18:00',
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
          internalnotes: 'Parkering på baksidan',
          status: 'confirmed'
        },
        products: [
          { id: 'p1', name: 'Scen 6x4m', quantity: 1, notes: 'Med tak' },
          { id: 'p2', name: 'PA-system', quantity: 2, notes: null }
        ],
        attachments: [
          { id: 'a1', file_name: 'ritning.pdf', url: 'https://...', file_type: 'application/pdf' }
        ],
        assigned_staff: [
          {
            staff_id: '365f4d55-...',
            staff_name: 'Anders Andersson',
            staff_role: 'Tekniker',
            staff_phone: '070-123 45 67',
            staff_email: 'anders@example.com',
            assignment_date: '2026-02-14',
            team_id: 'team-1'
          }
        ],
        calendar_events: [
          {
            id: 'ev1',
            title: 'Rigg - Företag AB',
            start_time: '2026-02-14T08:00:00',
            end_time: '2026-02-14T17:00:00',
            event_type: 'rigg'
          }
        ],
        project: {
          id: 'proj-123',
          name: 'Företag AB - Event 2026',
          status: 'active',
          project_leader: 'Maria Ledare'
        },
        project_tasks: [
          { id: 't1', title: 'Förbereda material', completed: true, deadline: '2026-02-13' },
          { id: 't2', title: 'Rigg på plats', completed: false, deadline: '2026-02-14' }
        ],
        project_comments: [
          { id: 'c1', author_name: 'Maria Ledare', content: 'Kunden vill ha extra belysning', created_at: '2026-01-20T10:30:00' }
        ],
        project_files: [
          { id: 'f1', file_name: 'planlösning.pdf', url: 'https://...', file_type: 'application/pdf' }
        ],
        project_purchases: [
          { id: 'pu1', description: 'Extra kablar', amount: 450, supplier: 'Elgiganten', receipt_url: 'https://...' }
        ],
        my_time_reports: [
          { id: 'tr1', report_date: '2026-02-14', hours_worked: 8, start_time: '08:00', end_time: '17:00' }
        ]
      },
      notes: [
        'Returnerar ALL information kopplad till bokningen',
        'Inkluderar schemalagd personal med kontaktuppgifter',
        'my_time_reports innehåller endast dina egna rapporter'
      ]
    }
  ];

  const timeReportEndpoints: EndpointProps[] = [
    {
      action: 'create_time_report',
      description: 'Skapa en ny tidrapport för en bokning',
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
          description: 'Riggning av scen och PA'
        }
      },
      responseExample: {
        success: true,
        time_report: {
          id: 'tr-new-123',
          booking_id: 'abc-123-def',
          staff_id: '365f4d55-...',
          report_date: '2026-02-14',
          hours_worked: 8,
          created_at: '2026-02-14T17:30:00'
        }
      },
      notes: [
        'hours_worked beräknas automatiskt om start_time och end_time anges',
        'break_time dras av från total arbetstid',
        'overtime_hours är frivilligt fält'
      ]
    },
    {
      action: 'get_time_reports',
      description: 'Hämta dina tidrapporter (valfritt filtrerat på bokning)',
      icon: <Clock className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'get_time_reports',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def'
        }
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
            created_at: '2026-02-14T17:30:00'
          }
        ]
      },
      notes: [
        'booking_id är valfritt - utan det returneras alla dina rapporter',
        'Sorteras efter report_date (senaste först)'
      ]
    }
  ];

  const projectEndpoints: EndpointProps[] = [
    {
      action: 'create_purchase',
      description: 'Skapa ett utlägg/inköp med valfri kvittobild',
      icon: <FileText className="h-5 w-5" />,
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
          receipt_url: 'https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/project-files/...',
          created_at: '2026-02-14T12:00:00'
        }
      },
      notes: [
        'receipt_image är valfritt - skicka som base64-kodad bild',
        'Stödda format: JPEG, PNG, WebP, PDF',
        'Max filstorlek: 10MB',
        'category kan vara: material, transport, mat, övrigt'
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
          content: 'Kunden vill flytta fram leveransen 1 timme'
        }
      },
      responseExample: {
        success: true,
        comment: {
          id: 'c-new-123',
          project_id: 'proj-123',
          author_name: 'Anders Andersson',
          content: 'Kunden vill flytta fram leveransen 1 timme',
          created_at: '2026-02-14T09:15:00'
        }
      },
      notes: [
        'Kommentaren kopplas automatiskt till rätt projekt via booking_id',
        'Ditt namn hämtas från din profil'
      ]
    },
    {
      action: 'upload_file',
      description: 'Ladda upp en fil/bild till projektet',
      icon: <Upload className="h-5 w-5" />,
      requiresAuth: true,
      requestExample: {
        action: 'upload_file',
        token: 'eyJzdGFmZl9pZCI6...',
        data: {
          booking_id: 'abc-123-def',
          file_name: 'rigg-foto.jpg',
          file_type: 'image/jpeg',
          file_data: 'data:image/jpeg;base64,/9j/4AAQSkZJRg...'
        }
      },
      responseExample: {
        success: true,
        file: {
          id: 'f-new-123',
          project_id: 'proj-123',
          file_name: 'rigg-foto.jpg',
          url: 'https://pihrhltinhewhoxefjxv.supabase.co/storage/v1/object/public/project-files/...',
          uploaded_at: '2026-02-14T14:30:00'
        }
      },
      notes: [
        'Stödda format: JPEG, PNG, WebP, PDF, HEIC',
        'Max filstorlek: 10MB',
        'Filen sparas i projektets filmapp och syns i admin-webben'
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
        data: {
          booking_id: 'abc-123-def'
        }
      },
      responseExample: {
        success: true,
        comments: [
          {
            id: 'c1',
            author_name: 'Maria Ledare',
            content: 'Kunden vill ha extra belysning',
            created_at: '2026-01-20T10:30:00'
          }
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
        data: {
          booking_id: 'abc-123-def'
        }
      },
      responseExample: {
        success: true,
        files: [
          {
            id: 'f1',
            file_name: 'planlösning.pdf',
            url: 'https://...',
            file_type: 'application/pdf',
            uploaded_at: '2026-01-15T09:00:00'
          }
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
        data: {
          booking_id: 'abc-123-def'
        }
      },
      responseExample: {
        success: true,
        purchases: [
          {
            id: 'pu1',
            description: 'Extra kablar',
            amount: 450,
            supplier: 'Elgiganten',
            category: 'material',
            purchase_date: '2026-02-14',
            receipt_url: 'https://...',
            created_at: '2026-02-14T12:00:00'
          }
        ]
      }
    }
  ];

  return (
    <div className="container mx-auto py-8 px-4 max-w-5xl">
      <div className="mb-8">
        <h1 className="text-3xl font-bold mb-2">API-dokumentation</h1>
        <p className="text-muted-foreground mb-4">
          Komplett dokumentation för tidrapporteringsappens API
        </p>
        
        <Card className="bg-muted/50">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-2">
              <Badge variant="outline">POST</Badge>
              <code className="text-sm font-mono">{API_BASE_URL}</code>
            </div>
            <p className="text-sm text-muted-foreground">
              Alla anrop går till samma endpoint. Ange <code className="bg-muted px-1 rounded">action</code> för att specificera vilken operation som ska utföras.
            </p>
          </CardContent>
        </Card>
      </div>

      <Tabs defaultValue="auth" className="space-y-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="auth">Autentisering</TabsTrigger>
          <TabsTrigger value="bookings">Bokningar</TabsTrigger>
          <TabsTrigger value="time">Tidrapporter</TabsTrigger>
          <TabsTrigger value="project">Projekt</TabsTrigger>
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
            <h2 className="text-xl font-semibold mb-2">Bokningar & Planering</h2>
            <p className="text-muted-foreground">
              Hämta bokningar du är schemalagd på och detaljerad information om varje jobb.
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
              Skapa och hämta tidrapporter för dina arbetade timmar.
            </p>
          </div>
          {timeReportEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.action} endpoint={endpoint} />
          ))}
        </TabsContent>

        <TabsContent value="project" className="space-y-4">
          <div className="mb-4">
            <h2 className="text-xl font-semibold mb-2">Projekt & Ekonomi</h2>
            <p className="text-muted-foreground">
              Hantera utlägg, kommentarer och filer kopplade till projekt.
            </p>
          </div>
          {projectEndpoints.map((endpoint) => (
            <EndpointCard key={endpoint.action} endpoint={endpoint} />
          ))}
        </TabsContent>
      </Tabs>

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
          
          <h4 className="font-semibold mt-6 mb-2">Vanliga felkoder</h4>
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="destructive">401</Badge>
              <span className="text-sm">Ogiltig eller utgången token</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">403</Badge>
              <span className="text-sm">Ingen åtkomst till resursen</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">404</Badge>
              <span className="text-sm">Bokning eller projekt hittades inte</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="destructive">400</Badge>
              <span className="text-sm">Ogiltiga parametrar</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default APIDocumentation;
