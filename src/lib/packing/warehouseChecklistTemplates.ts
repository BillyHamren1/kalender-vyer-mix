export interface WarehouseChecklistTemplate {
  id: string;
  name: string;
  description: string;
  items: string[];
}

export const WAREHOUSE_CHECKLIST_TEMPLATES: WarehouseChecklistTemplate[] = [
  {
    id: 'packstart',
    name: 'Inför packstart',
    description: 'Kontroll av underlag och förberedelser innan fysisk packning börjar.',
    items: [
      'Kontrollera att packlistan matchar bokningen',
      'Kontrollera WMS-koppling och eventuella avvikelser',
      'Bekräfta packdatum och planerad utlastningstid',
      'Förbered emballage, kolli och märkning',
      'Kontrollera särskilda instruktioner och intern information',
    ],
  },
  {
    id: 'loading',
    name: 'Inför utlastning',
    description: 'Slutkontroll före materialet lämnar lagret.',
    items: [
      'Packningen är signerad och stängd',
      'Kontrollräkning är genomförd utan öppna avvikelser',
      'Samtliga kollin är märkta',
      'Lastordning och transporttid är bekräftad',
      'PM, fraktdokument och övriga handlingar följer med',
      'Fotodokumentera lasten före avgång vid behov',
    ],
  },
  {
    id: 'return',
    name: 'Retur & inleverans',
    description: 'Kontroll när materialet kommer tillbaka till lagret.',
    items: [
      'Matcha returen mot aktuell bokning och packlista',
      'Registrera saknat eller skadat material',
      'Separera material som kräver rengöring eller service',
      'Återställ godkänt material på rätt lagerplats',
      'Dokumentera öppna avvikelser innan lagerärendet avslutas',
    ],
  },
];
