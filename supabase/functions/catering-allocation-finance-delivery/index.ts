import { handleCateringAllocationDelivery } from "./handler.ts";
Deno.serve((request: Request) =>
  handleCateringAllocationDelivery(request, { env: (name) => Deno.env.get(name) }),
);
