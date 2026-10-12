// Compose owner assertions unchanged; native peers run after original causal
// overlap and all rate assertions; final source deletion assertions are deferred intact.
import {readFileSync} from 'node:fs';
import {provePersonnelReviewCaller} from './personnel-review-caller-fixture.mjs';
import {proveReviewCallerNative} from './personnel-review-caller-native.mjs';
let context;
globalThis.afterCausalIssuer=async c=>{await provePersonnelReviewCaller(c);context=c;};
globalThis.afterPersonnelCallerBaseline=async()=>{if(process.env.INTERNAL_PROJECTS_TEST_DSN)await proveReviewCallerNative(context);if(globalThis.reviewCallerTerminal)await globalThis.reviewCallerTerminal();};
const metadata=new URL('./personnel-metadata-v2-fixture.mjs',import.meta.url);
let code=readFileSync(metadata,'utf8');const hook=" await db.query('delete from projects where id=$1',[project]);";
const terminal=code.split('\n').find(line=>line.startsWith(hook));
if(!terminal)throw new Error('review fixture seam changed');
// Keep every original terminal assertion, only defer teardown until native peers.
code=code.replace(terminal,` globalThis.reviewCallerTerminal=async()=>{${terminal}};`).replace("import('./personnel-metadata-v2-native.mjs')",`import(${JSON.stringify(new URL('./personnel-metadata-v2-native.mjs',import.meta.url).href)})`);
const metadataURL='data:text/javascript;base64,'+Buffer.from(code).toString('base64');
const issuer=new URL('./personnel-issuer.test.mjs',import.meta.url);let driver=readFileSync(issuer,'utf8');driver=driver.replace("new URL('./accepted-rate-provenance.test.mjs',import.meta.url)",`new URL('./accepted-rate-provenance.test.mjs',${JSON.stringify(issuer.href)})`).replace(/const afterIssuer=.*?;\n/,`const afterIssuer=${JSON.stringify(metadataURL)};\n`);
process.env.PERSONNEL_METADATA_TEST='1';await import('data:text/javascript;base64,'+Buffer.from(driver).toString('base64'));
