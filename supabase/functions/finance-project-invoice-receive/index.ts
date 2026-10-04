import { handleFinanceProjectInvoiceDestination } from "./handler.ts";
Deno.serve((request) =>
  handleFinanceProjectInvoiceDestination(request, {
    env: (name) => Deno.env.get(name),
  })
);
