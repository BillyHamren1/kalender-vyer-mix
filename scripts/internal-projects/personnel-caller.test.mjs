import {provePersonnelCaller} from './personnel-caller-fixture.mjs';
let context;
globalThis.afterCausalIssuer=async c=>{await provePersonnelCaller(c);context=c;};
if(process.env.INTERNAL_PROJECTS_TEST_DSN)globalThis.afterPersonnelCallerBaseline=async()=>{
 const {provePersonnelOwnershipOverlap}=await import('./personnel-caller-native.mjs');
 await provePersonnelOwnershipOverlap(context);
};
process.env.PERSONNEL_METADATA_TEST='1';
await import('./personnel-issuer.test.mjs');
