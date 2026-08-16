/**
 * STEG 4Y — Targeted release scope för Booking → Planning-sync.
 *
 * Detta är den enda auktoritativa listan över de migrationer som ingår i
 * release scope. Ändras listan MÅSTE den uppdateras explicit här och
 * provenance-auditen (reports/sync-release-migration-provenance.json) göras om.
 *
 * OBS: listan är endast scope-integritet — den utgör INGEN grön gate.
 */
export const SYNC_RELEASE_MIGRATIONS: readonly string[] = [
  '20260813214815_4f49979a-8ac0-466f-959b-0f9fac8ea0e7.sql',
  '20260813224629_2143f24d-bb1a-4b06-b459-121ee69f1486.sql',
  '20260813225323_a121653b-529f-402b-bf34-73d141a611be.sql',
  '20260813225837_e5cb68e8-a74e-4685-a8a5-7d9e8ffae3dc.sql',
  '20260814094528_cee710c4-0784-4b66-9ae4-86179ee1a1a7.sql',
  '20260814115650_52304ea5-5aee-4cef-9883-9f73a086fedb.sql',
  '20260814120056_e1872eb9-c729-4858-b8b4-5e5bbed5f2ff.sql',
  '20260815193400_82bfea28-51d8-4ad7-a124-845b96af0d1f.sql',
  '20260815193913_f211bdb1-9dc0-405e-9139-c6f81c228ec2.sql',
  '20260815193951_6d64a99b-07eb-405f-86e4-b85375907074.sql',
  '20260816081411_fb502ec8-39cf-4c6c-8fb4-0c2cf2aac152.sql',
  '20260816081439_b569f5a2-847e-460d-bf65-d18d90870b75.sql',
] as const;

export const SYNC_RELEASE_SCOPE_SIZE = 12;
