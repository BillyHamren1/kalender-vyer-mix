/** Bounded backend transport only. No returned receipt authorizes local credit/EAC. */
export async function fetchCreditV2Receipt(
  fetchImpl: typeof fetch,
  url: string,
  init: RequestInit,
  deadlineMs = 15000,
): Promise<{ response: Response; value: unknown }> {
  if (!Number.isInteger(deadlineMs) || deadlineMs < 1 || deadlineMs > 15000) {
    throw new Error("invalid_receipt_deadline");
  }
  const deadlineAt = performance.now() + deadlineMs;
  const controller = new AbortController();
  let expired = false;
  let response: Response | undefined;
  let reader: ReadableStreamDefaultReader<Uint8Array> | undefined;
  const cancel = () => {
    try {
      const operation = reader ? reader.cancel() : response?.body?.cancel();
      if (operation) void operation.catch(() => {});
    } catch { /* Cancellation must never block the deadline. */ }
  };
  const ensureCurrent = () => {
    if (expired || performance.now() >= deadlineAt) {
      expired = true;
      controller.abort();
      cancel();
      throw new Error("receipt_deadline");
    }
  };
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      expired = true;
      reject(new Error("receipt_deadline"));
      controller.abort();
      cancel();
    }, deadlineMs);
  });
  const work = (async () => {
    response = await fetchImpl(url, {
      ...init,
      redirect: "error",
      signal: controller.signal,
    });
    ensureCurrent();
    const length = response.headers.get("content-length");
    if (length && /^\d+$/.test(length) && Number(length) > 16384) {
      cancel();
      throw new Error("receipt_too_large");
    }
    if (!response.body) throw new Error("receipt_missing");
    reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let size = 0;
    let count = 0;
    try {
      while (true) {
        const next = await reader.read();
        ensureCurrent();
        if (next.done) break;
        if (!(next.value instanceof Uint8Array)) {
          throw new Error("invalid_receipt_bytes");
        }
        if (++count > 16384) throw new Error("receipt_too_fragmented");
        if (next.value.byteLength === 0) continue;
        size += next.value.byteLength;
        if (size > 16384) {
          cancel();
          throw new Error("receipt_too_large");
        }
        chunks.push(next.value);
      }
      const bytes = new Uint8Array(size);
      let offset = 0;
      for (const chunk of chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const value: unknown = JSON.parse(
        new TextDecoder("utf-8", { fatal: true }).decode(bytes),
      );
      ensureCurrent();
      return { response, value };
    } finally {
      try {
        reader.releaseLock();
      } catch { /* Outstanding cancellation may still finish. */ }
    }
  })();
  try {
    const result = await Promise.race([work, timeout]);
    ensureCurrent();
    return result;
  } catch (error) {
    expired = true;
    controller.abort();
    cancel();
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
