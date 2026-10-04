import { handleProjectEconomyStep8ServiceRead } from "./handler.ts";

Deno.serve((request) =>
  handleProjectEconomyStep8ServiceRead(request, {
    env: (name) => Deno.env.get(name),
  })
);
