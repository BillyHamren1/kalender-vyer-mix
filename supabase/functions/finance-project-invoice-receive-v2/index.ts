import { handleFinanceProjectCreditV2Destination } from "./handler.ts";
Deno.serve((request) =>
  handleFinanceProjectCreditV2Destination(request, {
    env: (name) => Deno.env.get(name),
  })
);
