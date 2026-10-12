import{readFileSync,readdirSync}from'node:fs';import{resolve}from'node:path';import{createHash}from'node:crypto';
export function captureSourcePins(){
 const roots={operations:resolve('.'),finance:resolve(process.env.FINANCE_SOURCE_ROOT??'../recovery-finance-customer'),text:resolve(process.env.TEXT_BOOKING_SOURCE_ROOT??'../recovery-text-booking')},files=[];
 const add=(root,path)=>files.push({root,path,sha256:createHash('sha256').update(readFileSync(roots[root]+'/'+path)).digest('hex')});
 for(const name of readdirSync(roots.operations+'/supabase/migrations').filter(x=>/operations_personnel|internal_project_(classification|metadata)|atomic_internal_project/.test(x)))add('operations','supabase/migrations/'+name);
 for(const name of ['accepted-rate-provenance.test.mjs','accepted-rate-test-db.mjs','personnel-issuer.test.mjs','personnel-issuer-fixture.mjs','personnel-review-issuance.mjs','personnel-metadata-v2-fixture.mjs','personnel-classification-bootstrap.sql','accepted-personnel-issuer.sql','accepted-personnel-transport.sql','accepted-personnel-metadata-v2.sql','accepted-personnel-review-metadata-v2.sql','customer-identity-metadata.sql'])add('operations','scripts/internal-projects/'+name);
 add('operations','scripts/project-economy/operations-project-review-bootstrap.sql');
 for(const name of ['project-personnel-cost.ts','project-personnel-cost.test.ts','project-personnel-ingestion-store.ts','project-personnel-ingestion-transport.ts','project-personnel-accepted-transport.ts'])add('operations','supabase/functions/_shared/'+name);
 add('operations','supabase/functions/dispatch-project-metadata/handler.ts');
 for(const name of readdirSync(roots.finance+'/supabase/migrations').filter(x=>x.endsWith('.sql')))add('finance','supabase/migrations/'+name);
 for(const name of ['accepted-cost-receipt.sql','atomic-cost-receiver.sql','customer-identity-metadata.sql','customer-cost-booking-text.sql'])add('finance','scripts/internal-projects/'+name);
 for(const name of readdirSync(roots.finance+'/scripts/internal-projects/accepted-cost-sources').filter(x=>x.endsWith('.sql')))add('finance','scripts/internal-projects/accepted-cost-sources/'+name);
 for(const name of ['_shared/operations-accepted-cost-receive.ts','_shared/operations-project-metadata-contract.ts','operations-project-metadata/index.ts'])add('finance','supabase/functions/'+name);
 add('text','supabase/functions/_shared/project-personnel-cost.ts');add('text','scripts/internal-projects/personnel-text-booking.sql');
 return {roots,files};
}
