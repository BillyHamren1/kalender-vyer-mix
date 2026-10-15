// Types for Deno handlers imported by Node-based Scanner contract tests.
// Runtime values are provided by Deno in production and vi.stubGlobal in tests.
declare namespace Deno {
  namespace env {
    function get(name: string): string | undefined;
  }
  function serve(handler: (request: Request) => Response | Promise<Response>): unknown;
}
declare module "https://esm.sh/@supabase/supabase-js@2.116.0" {
  export { createClient } from "@supabase/supabase-js";
}
