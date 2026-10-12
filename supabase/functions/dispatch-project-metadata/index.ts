import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.57.4';
import { createHandler } from './handler.ts';
const env=(name:string)=>Deno.env.get(name)??'';
const config={enabled:env('PROJECT_METADATA_DISPATCH_ENABLED')==='true',triggerSecret:env('PROJECT_METADATA_DISPATCH_TRIGGER_SECRET'),issuer:env('PROJECT_METADATA_ISSUER'),signingSecret:env('PROJECT_METADATA_SIGNING_SECRET'),destinationUrl:env('PROJECT_METADATA_FINANCE_URL'),allowedUrl:env('PROJECT_METADATA_FINANCE_ALLOWED_URL')};
// Client creation is lazy: absent configuration makes no DB/HTTP calls.
function client(){return createClient(env('SUPABASE_URL'),env('SUPABASE_SERVICE_ROLE_KEY'),{auth:{persistSession:false,autoRefreshToken:false}});}
Deno.serve(createHandler({config,fetch,
  claim:async()=>{const {data,error}=await client().rpc('claim_operations_project_metadata_delivery');if(error)throw error;return data;},
  finish:async(token,ack,failure)=>{const {data,error}=await client().rpc('finish_operations_project_metadata_delivery',{p_lease_token:token,p_ack:ack,p_failure:failure});if(error)throw error;return data===true;},
}));
