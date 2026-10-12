import { createPersonnelPublishHandler } from './handler.ts';
const env=(name:string)=>Deno.env.get(name)??'';
Deno.serve(createPersonnelPublishHandler({enabled:env('OPERATIONS_PERSONNEL_PUBLISH_ENABLED')==='true',
  internalSecret:env('OPERATIONS_PERSONNEL_INGEST_SECRET'),databaseUrl:env('SUPABASE_URL'),databaseServiceKey:env('SUPABASE_SERVICE_ROLE_KEY'),
  timeEndpoint:env('OPERATIONS_PERSONNEL_TIME_READ_URL'),timeSigningSeed:env('TIME_ADAPTER_SIGNING_SEED'),
  accepted:{enabled:env('OPERATIONS_PERSONNEL_ACCEPTED_ISSUER_ENABLED')==='true',issuerId:env('OPERATIONS_PERSONNEL_ACCEPTED_ISSUER_ID'),enrollmentEpoch:env('OPERATIONS_PERSONNEL_ACCEPTED_EPOCH'),
    destinationOrganizationId:env('OPERATIONS_PERSONNEL_ACCEPTED_DESTINATION_ORG'),issuerSecret:env('OPERATIONS_PERSONNEL_SOURCE_HMAC_SECRET'),
    transport:{enabled:env('OPERATIONS_PERSONNEL_ACCEPTED_TRANSPORT_ENABLED')==='true',issuerId:env('OPERATIONS_PERSONNEL_ACCEPTED_ISSUER_ID'),enrollmentEpoch:env('OPERATIONS_PERSONNEL_ACCEPTED_EPOCH'),
      endpoint:env('OPERATIONS_PERSONNEL_ACCEPTED_FINANCE_URL'),secret:env('OPERATIONS_PERSONNEL_ACCEPTED_DELIVERY_HMAC_SECRET')}},
  finance:{enabled:env('OPERATIONS_PERSONNEL_FINANCE_TRANSPORT_ENABLED')==='true',endpoint:env('OPERATIONS_PERSONNEL_FINANCE_URL'),
    keyId:env('OPERATIONS_PERSONNEL_FINANCE_KEY_ID'),secret:env('OPERATIONS_PERSONNEL_FINANCE_HMAC_SECRET')}}));
