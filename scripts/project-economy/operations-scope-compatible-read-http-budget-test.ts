import {request} from './operations-scope-compatible-read-http-journey.ts';
const origin='http://127.0.0.1:55407';
function assert(value:unknown):asserts value{if(!value)throw new Error('isolated_http_budget_assertion');}
async function rejected(work:Promise<unknown>){let denied=false;try{await work;}catch{denied=true;}assert(denied);}
Deno.test('ignored-abort fetch settles bounded; late response is cancelled before reading',async()=>{
 let resolveFetch:(value:Response)=>void=()=>{},cancelled=0;
 const fetcher=(()=>new Promise<Response>(resolve=>{resolveFetch=resolve;})) as typeof fetch;
 const began=performance.now();await rejected(request(origin,null,null,undefined,undefined,undefined,{fetcher,timeoutMs:15}));assert(performance.now()-began<1000);
 resolveFetch(new Response(new ReadableStream<Uint8Array>({cancel(){cancelled++;}})));
 await Promise.resolve();await Promise.resolve();await Promise.resolve();assert(cancelled===1);
});
Deno.test('stalled response read and abort-ignoring cancellation cannot hold request open',async()=>{
 let cancelled=0;const stream=new ReadableStream<Uint8Array>({pull(){return new Promise<void>(()=>{});},cancel(){cancelled++;return new Promise<void>(()=>{});}});
 const fetcher=(async()=>new Response(stream)) as typeof fetch;
 const began=performance.now();await rejected(request(origin,null,null,undefined,undefined,undefined,{fetcher,timeoutMs:15}));assert(performance.now()-began<1000);assert(cancelled===1);
});
Deno.test('endless empty chunks are refused by finite chunk bound',async()=>{
 let pulls=0,cancelled=0;const stream=new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array());},cancel(){cancelled++;}});
 const fetcher=(async()=>new Response(stream)) as typeof fetch;
 await rejected(request(origin,null,null,undefined,undefined,undefined,{fetcher,timeoutMs:1000}));assert(pulls<=4098&&cancelled===1);
});
Deno.test('external abort settles even when fetch ignores signal',async()=>{
 const controller=new AbortController();let observed:AbortSignal|undefined;
 const fetcher=((_url:unknown,init?:RequestInit)=>{observed=init?.signal??undefined;queueMicrotask(()=>controller.abort());return new Promise<Response>(()=>{});}) as typeof fetch;
 await rejected(request(origin,null,null,controller.signal,undefined,undefined,{fetcher,timeoutMs:1000}));assert(observed?.aborted===true);
});
Deno.test('normal bounded JSON preserves role body and refuses redirects',async()=>{
 let checked=false;const fetcher=((_url:unknown,init?:RequestInit)=>{assert(init?.redirect==='error'&&init?.method==='POST'&&init?.body==='{"p_request":{"fixed":"scope"}}');checked=true;return Promise.resolve(new Response('{"ok":true}',{status:200}));}) as typeof fetch;
 const reply=await request(origin,{fixed:'scope'},null,undefined,undefined,undefined,{fetcher,timeoutMs:1000});assert(checked&&reply.status===200&&reply.data.ok===true);
});
