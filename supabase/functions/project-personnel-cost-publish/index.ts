import { createPersonnelPublishHandler } from './handler.ts';
const env=(name:string)=>Deno.env.get(name)??'';
Deno.serve(createPersonnelPublishHandler({enabled:env('OPERATIONS_PERSONNEL_PUBLISH_ENABLED')==='true',
  internalSecret:env('OPERATIONS_PERSONNEL_INGEST_SECRET'),databaseUrl:env('SUPABASE_URL'),databaseServiceKey:env('SUPABASE_SERVICE_ROLE_KEY'),
  timeEndpoint:env('OPERATIONS_PERSONNEL_TIME_READ_URL'),timeSigningSeed:env('TIME_ADAPTER_SIGNING_SEED'),
  finance:{enabled:env('OPERATIONS_PERSONNEL_FINANCE_TRANSPORT_ENABLED')==='true',endpoint:env('OPERATIONS_PERSONNEL_FINANCE_URL'),
    keyId:env('OPERATIONS_PERSONNEL_FINANCE_KEY_ID'),secret:env('OPERATIONS_PERSONNEL_FINANCE_HMAC_SECRET')}}));
