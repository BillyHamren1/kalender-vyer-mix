import {request,ROUTES,stableReply} from './operations-compatible-catalog-http-journey.ts';
const base='http://127.0.0.1:55783';
const assert=(value:unknown)=>{if(!value)throw new Error('closed_http_test_failure');};
const pause=(ms:number)=>new Promise<void>(resolve=>setTimeout(resolve,ms));
async function rejects(work:Promise<unknown>){let denied=false;try{await work;}catch{denied=true;}assert(denied);}
function fixture(stream:ReadableStream<Uint8Array>,headers:Record<string,string>={'content-type':'application/json'}){return new Response(stream,{status:200,headers});}
Deno.test('whole deadline ends abort-ignoring pending fetch',async()=>{
 const before=performance.now();await rejects(request(base,ROUTES[0],{},'synthetic',undefined,{timeoutMs:10,fetcher:()=>new Promise<Response>(()=>{})}));assert(performance.now()-before<500);
});
Deno.test('late headers canceled before body reader begins',async()=>{
 let canceled=0,pulled=0;
 const stream=new ReadableStream<Uint8Array>({pull(){pulled++;return new Promise<void>(()=>{});},cancel(){canceled++;}});
 const before=performance.now();await rejects(request(base,ROUTES[0],{},null,undefined,{timeoutMs:5,fetcher:async()=>{await pause(25);return fixture(stream);}}));
 assert(performance.now()-before<500);await pause(40);assert(canceled===1&&pulled<=1);
});
Deno.test('stalled response stream bounded and canceled',async()=>{
 let canceled=false;
 const stream=new ReadableStream<Uint8Array>({pull(){return new Promise<void>(()=>{});},cancel(){canceled=true;}});
 const before=performance.now();await rejects(request(base,ROUTES[0],{},null,undefined,{timeoutMs:10,fetcher:async()=>fixture(stream)}));assert(performance.now()-before<500&&canceled);
});
Deno.test('endless empty chunks fail finite chunk cap',async()=>{
 let canceled=false,pulls=0;
 const stream=new ReadableStream<Uint8Array>({pull(c){pulls++;c.enqueue(new Uint8Array());},cancel(){canceled=true;}});
 await rejects(request(base,ROUTES[0],{},null,undefined,{timeoutMs:100,fetcher:async()=>fixture(stream)}));assert(canceled&&pulls<=4098);
});
Deno.test('header rejects cancel unassigned stream with no awaited cancel',async()=>{
 const cases:Record<string,string>[]=[{'content-type':'text/html'},{'content-type':'application/json','content-length':'262145'},{'content-type':'application/json','content-length':'1e6'}];
 for(const headers of cases){
  let canceled=false;const stream=new ReadableStream<Uint8Array>({cancel(){canceled=true;return new Promise<void>(()=>{});}});
  const before=performance.now();await rejects(request(base,ROUTES[0],{},null,undefined,{fetcher:async()=>fixture(stream,headers)}));assert(canceled&&performance.now()-before<500);
 }
});
Deno.test('oversize streamed body cancels without awaiting hung cancellation',async()=>{
 let canceled=false;const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array(262145));},cancel(){canceled=true;return new Promise<void>(()=>{});}});
 const before=performance.now();await rejects(request(base,ROUTES[0],{},null,undefined,{fetcher:async()=>fixture(stream)}));assert(canceled&&performance.now()-before<500);
});
Deno.test('redirect error and exact caller arguments preserved',async()=>{
 let observed:RequestInit|undefined;const args={p_request:{exact:'opaque'}};
 const result=await request(base,ROUTES[0],args,'synthetic',undefined,{fetcher:async(_input,init)=>{observed=init;return new Response('{"copied":true}',{headers:{'content-type':'application/json; charset=utf-8'}});}});
 assert(result.status===200&&result.data.copied===true&&observed?.redirect==='error'&&observed.body===JSON.stringify(args)&&new Headers(observed.headers).get('authorization')==='Bearer synthetic');
});
Deno.test('named timestamp stripping retains every unrelated field',()=>{
 const evidence={as_of:'top',unrelated:{as_of:'retain'},members:[{kernel_evidence:{as_of:'child',opaque:'retained'}}]};
 const result=stableReply(ROUTES[0],evidence) as {unrelated:{as_of:string};members:{kernel_evidence:{opaque:string}}[]};
 assert(result.unrelated.as_of==='retain'&&result.members[0].kernel_evidence.opaque==='retained'&&evidence.as_of==='top');
 assert(JSON.stringify(stableReply(ROUTES[4],{as_of:'immutable_other_abi'}))==='{"as_of":"immutable_other_abi"}');
});
