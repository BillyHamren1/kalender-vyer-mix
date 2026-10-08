import { handleCateringFinanceDelivery } from "./handler.ts";
Deno.serve((request) =>
  handleCateringFinanceDelivery(request, { env: (name) => Deno.env.get(name) }),
);
