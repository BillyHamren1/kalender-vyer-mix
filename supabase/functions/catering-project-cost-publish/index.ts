import { createCateringPublishHandler } from "./handler.ts";
const env = (name: string) => Deno.env.get(name) ?? "";
Deno.serve(
  createCateringPublishHandler({
    enabled: env("OPERATIONS_CATERING_PUBLISH_ENABLED") === "true",
    internalSecret: env("OPERATIONS_CATERING_INGEST_SECRET"),
    databaseUrl: env("SUPABASE_URL"),
    databaseServiceKey: env("SUPABASE_SERVICE_ROLE_KEY"),
    cateringSigningSeed: env("OPERATIONS_CATERING_SIGNING_SEED"),
  }),
);
