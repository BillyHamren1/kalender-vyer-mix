// Reuse the actual accepted-rate/review fixture, preserving all existing assertions.
import {readFileSync} from 'node:fs';
const base=new URL('./accepted-rate-provenance.test.mjs',import.meta.url);
let code=readFileSync(base,'utf8');
code=code.replace("createRequire(import.meta.url)",`createRequire(${JSON.stringify(base.href)})`)
 .replace("import('./accepted-rate-test-db.mjs')",`import(${JSON.stringify(new URL('./accepted-rate-test-db.mjs',base).href)})`)
 .replace("import('./personnel-review-issuance.mjs')",`import(${JSON.stringify(new URL('./personnel-review-issuance.mjs',base).href)})`)
 .replace("new URL('../../'+p,import.meta.url)",`new URL('../../'+p,${JSON.stringify(base.href)})`)
 .replace('const db=await openTestDatabase();',`const db=process.env.INTERNAL_PROJECTS_TEST_DSN?await openTestDatabase():new (require('@electric-sql/pglite').PGlite)({extensions:{pgcrypto:require('@electric-sql/pglite/contrib/pgcrypto').pgcrypto}});`);
const hook="const tamperedRetry=structuredClone(snapshot);";
if(!code.includes(hook))throw new Error('fixture hook moved');
code=code.replace(hook,`const {provePersonnelIssuer}=await import(${JSON.stringify(new URL('./personnel-issuer-fixture.mjs',base).href)});const {proveAcceptedReviews}=await import(${JSON.stringify(new URL('./accepted-personnel-review-fixture.mjs',base).href)});await provePersonnelIssuer({db,read,as,org,worker,raw,snapshot,evidence,pass,fixture,engine,ctx,afterIssuer:proveAcceptedReviews});\n${hook}`);
await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
