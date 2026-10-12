import assert from 'node:assert/strict';import{writeFileSync}from'node:fs';
import {captureSourcePins} from './source-pins.mjs';
import {runMixedFinance} from './mixed-finance-oracle.mjs';
const pins=captureSourcePins();
globalThis.afterMixedSource=runMixedFinance;
await import('./source-oracle-runtime.mjs');
assert.deepEqual(captureSourcePins(),pins,'Source changed during composition; frozen rerun required');
writeFileSync(new URL(process.env.ACCEPTED_FIRST_DAY==='1'?'./FIRST_DAY_SOURCE_MANIFEST.json':'./ACCEPTANCE_SOURCE_MANIFEST.json',import.meta.url),JSON.stringify({...pins,hosted:false,activated:false},null,2)+'\n');
console.log('PASS full mixed actual-source composition (isolated synthetic databases, no hosted authentication)');
