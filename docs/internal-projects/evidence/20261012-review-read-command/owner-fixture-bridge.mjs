import{readFileSync}from'node:fs';import{resolve}from'node:path';import{pathToFileURL}from'node:url';
export async function proveAcceptedPersonnelTransport(c){
 await c.db.exec(readFileSync(resolve(process.env.TEXT_BOOKING_SOURCE_ROOT??'../recovery-text-booking')+'/scripts/internal-projects/personnel-text-booking.sql','utf8'));
 const owner=await import(pathToFileURL(resolve('scripts/internal-projects/personnel-metadata-v2-fixture.mjs')).href);
 return owner.proveAcceptedPersonnelTransport(c);
}
