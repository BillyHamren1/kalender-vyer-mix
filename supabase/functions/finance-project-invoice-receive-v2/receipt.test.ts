import { fetchCreditV2Receipt } from "./receipt.ts";
function assert(value: boolean) {
  if (!value) throw new Error("Assertion failed");
}
async function rejects(operation: () => Promise<unknown>, message: string) {
  let denied = false;
  try {
    await operation();
  } catch (error) {
    denied = error instanceof Error && error.message === message;
  }
  assert(denied);
}
Deno.test("unit receipt deadline bounds abort-ignoring fetch and cancels late response", async () => {
  let complete!: (value: Response) => void, cancelled = false;
  const fetchImpl: typeof fetch = () =>
    new Promise((resolve) => complete = resolve);
  await rejects(
    () => fetchCreditV2Receipt(fetchImpl, "http://127.0.0.1:1", {}, 10),
    "receipt_deadline",
  );
  complete(
    new Response(
      new ReadableStream({
        cancel() {
          cancelled = true;
        },
      }),
    ),
  );
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert(cancelled);
});
Deno.test("unit deadline rejects stream cancel-success race without awaiting cancellation", async () => {
  let cancelled = false;
  const fetchImpl: typeof fetch = () =>
    Promise.resolve(
      new Response(
        new ReadableStream({
          cancel() {
            cancelled = true;
            return new Promise(() => {});
          },
        }),
      ),
    );
  await rejects(
    () => fetchCreditV2Receipt(fetchImpl, "http://127.0.0.1:1", {}, 10),
    "receipt_deadline",
  );
  assert(cancelled);
});
Deno.test("unit expired flag rejects response synchronously completed by abort", async () => {
  let cancelled = false;
  const fetchImpl: typeof fetch = (_url, init) =>
    new Promise((resolve) => {
      init?.signal?.addEventListener("abort", () =>
        resolve(
          new Response(
            new ReadableStream({
              cancel() {
                cancelled = true;
              },
            }),
          ),
        ), { once: true });
    });
  await rejects(
    () => fetchCreditV2Receipt(fetchImpl, "http://127.0.0.1:1", {}, 10),
    "receipt_deadline",
  );
  await Promise.resolve();
  assert(cancelled);
});
Deno.test("unit receipt rejects declared/chunked oversize and corrupt UTF8", async () => {
  for (const declared of [false, true]) {
    let cancelled = false;
    const stream = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(16385));
      },
      cancel() {
        cancelled = true;
      },
    });
    await rejects(
      () =>
        fetchCreditV2Receipt(
          () =>
            Promise.resolve(
              new Response(stream, {
                headers: declared ? { "content-length": "16385" } : {},
              }),
            ),
          "http://127.0.0.1:1",
          {},
          50,
        ),
      "receipt_too_large",
    );
    assert(cancelled);
  }
  let denied = false;
  try {
    await fetchCreditV2Receipt(
      () => Promise.resolve(new Response(new Uint8Array([0xc3, 0x28]))),
      "http://127.0.0.1:1",
      {},
      50,
    );
  } catch {
    denied = true;
  }
  assert(denied);
});
Deno.test("unit empty-chunk microtask stream cannot starve the receipt deadline", async () => {
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    pull(controller) {
      controller.enqueue(new Uint8Array());
    },
    cancel() {
      cancelled = true;
    },
  });
  await rejects(
    () =>
      fetchCreditV2Receipt(
        () => Promise.resolve(new Response(stream)),
        "http://127.0.0.1:1",
        {},
        1,
      ),
    "receipt_deadline",
  );
  assert(cancelled);
});
