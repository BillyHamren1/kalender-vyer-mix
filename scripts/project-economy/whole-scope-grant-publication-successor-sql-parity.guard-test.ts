/** TEST-only private FD/metadata boundary; no SQL/backend capability. */
import { readGrantedPublicationSqlVectors } from "./whole-scope-grant-publication-successor-sql-parity.ts";
const originalOpen = Deno.open;
function check(value: unknown): asserts value {
  if (!value) throw new Error("successor_private_fd_guard_failed");
}
async function denied(action: () => Promise<unknown>) {
  try {
    await action();
  } catch (error) {
    check(
      error instanceof Error &&
        error.message === "actual_successor_crosswire_failed",
    );
    return;
  }
  throw new Error("successor_private_fd_guard_failed");
}
async function fixture(
  action: (path: string, parent: string) => Promise<void>,
) {
  const parent = await Deno.makeTempDir({
    dir: "/tmp",
    prefix: "whole-scope-grant-publication-successor-private-",
  });
  await Deno.chmod(parent, 0o700);
  const path = `${parent}/sql-vectors.json`;
  await Deno.writeTextFile(path, "{}", { mode: 0o600 });
  try {
    await action(path, parent);
  } finally {
    Deno.open = originalOpen;
    await Deno.remove(parent, { recursive: true });
  }
}
Deno.test("private FD exact regular owned source is read", () =>
  fixture(async (path) => {
    check((await readGrantedPublicationSqlVectors(path)) === "{}");
  }),
);
Deno.test("private FD refuses file and parent permission broadening", () =>
  fixture(async (path, parent) => {
    await Deno.chmod(path, 0o644);
    await denied(() => readGrantedPublicationSqlVectors(path));
    await Deno.chmod(path, 0o600);
    await Deno.chmod(parent, 0o755);
    await denied(() => readGrantedPublicationSqlVectors(path));
  }),
);
Deno.test("private FD refuses links and other source namespaces", () =>
  fixture(async (path, parent) => {
    await Deno.link(path, `${parent}/other`);
    await denied(() => readGrantedPublicationSqlVectors(path));
    await Deno.remove(`${parent}/other`);
    await Deno.rename(path, `${parent}/real`);
    await Deno.symlink(`${parent}/real`, path);
    await denied(() => readGrantedPublicationSqlVectors(path));
    await denied(() => readGrantedPublicationSqlVectors(`${parent}/real`));
    await denied(() =>
      readGrantedPublicationSqlVectors(
        "/tmp/PRIVATE_TEST_SENTINEL/sql-vectors.json",
      ),
    );
  }),
);
Deno.test("private FD refuses oversized input before opening", () =>
  fixture(async (path) => {
    await Deno.truncate(path, 12582913);
    let opens = 0;
    Deno.open = (() => {
      opens++;
      throw new Error("PRIVATE_TEST_SENTINEL");
    }) as typeof Deno.open;
    await denied(() => readGrantedPublicationSqlVectors(path));
    check(opens === 0);
  }),
);
Deno.test("private FD detects path replacement between metadata and open", () =>
  fixture(async (path, parent) => {
    Deno.open = (async (name, options) => {
      await Deno.rename(path, `${parent}/old`);
      await Deno.writeTextFile(path, "{}", { mode: 0o600 });
      return await originalOpen(name, options);
    }) as typeof Deno.open;
    await denied(() => readGrantedPublicationSqlVectors(path));
  }),
);
Deno.test(
  "private FD detects path replacement or same-size change while reading",
  async () => {
    for (const replace of [true, false])
      await fixture(async (path, parent) => {
        Deno.open = (async (name, options) => {
          const file = await originalOpen(name, options);
          let changed = false;
          return {
            stat: () => file.stat(),
            close: () => file.close(),
            read: async (buffer: Uint8Array) => {
              if (!changed) {
                changed = true;
                if (replace) {
                  await Deno.rename(path, `${parent}/old`);
                  await Deno.writeTextFile(path, "[]", { mode: 0o600 });
                } else {
                  await Deno.writeTextFile(path, "[]");
                  await Deno.utime(path, new Date(1000000), new Date(1000000));
                }
              }
              return await file.read(buffer);
            },
          } as Deno.FsFile;
        }) as typeof Deno.open;
        await denied(() => readGrantedPublicationSqlVectors(path));
      });
  },
);
Deno.test("private FD denies nonprogressing reads and fatal UTF8", async () => {
  await fixture(async (path) => {
    await Deno.writeFile(path, new Uint8Array([0xff, 0xff]));
    await denied(() => readGrantedPublicationSqlVectors(path));
  });
  await fixture(async (path) => {
    Deno.open = (async (name, options) => {
      const file = await originalOpen(name, options);
      return {
        stat: () => file.stat(),
        close: () => file.close(),
        read: async () => 0,
      } as unknown as Deno.FsFile;
    }) as typeof Deno.open;
    await denied(() => readGrantedPublicationSqlVectors(path));
  });
});

Deno.test(
  "private FD rejects actual FIFO substitution without a blocking read-only open",
  () =>
    fixture(async (path) => {
      let safeOpen = false;
      Deno.open = (async (name, options) => {
        safeOpen = options?.read === true && options?.write === true;
        if (!safeOpen) throw new Error("PRIVATE_TEST_SENTINEL");
        await Deno.remove(path);
        const child = new Deno.Command("/usr/bin/mkfifo", {
          args: ["-m", "600", path],
          stdout: "null",
          stderr: "null",
        }).spawn();
        check((await child.status).success);
        return await originalOpen(name, options);
      }) as typeof Deno.open;
      const started = performance.now();
      await denied(() => readGrantedPublicationSqlVectors(path));
      check(safeOpen && performance.now() - started < 2000);
    }),
);
