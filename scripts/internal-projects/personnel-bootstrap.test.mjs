import {proveBootstrap} from './personnel-bootstrap-fixture.mjs';
let context;
globalThis.afterCausalIssuer=async c=>{await proveBootstrap(c);context=c;};
if(process.env.INTERNAL_PROJECTS_TEST_DSN)globalThis.afterPersonnelCallerBaseline=async()=>{
 const {proveBootstrapOverlap}=await import('./personnel-bootstrap-native.mjs');await proveBootstrapOverlap(context);
};
process.env.PERSONNEL_METADATA_TEST='1';
await import('./personnel-issuer.test.mjs');
