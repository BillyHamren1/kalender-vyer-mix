# Receipt-bound full-App browser network successor

Status: **additive source-only candidate; local protocol support tests only; no native browser, provider, fixture, release or product acceptance**.

This NEW helper removes the prior browser helper's externally visible fixed-port assumption without changing that helper. It imports the existing reviewed browser isolation source at SHA-256 `3b88a4acea11f9305f0049e04b37e6fb6359616311060698decdf9a80af23511` (10,627 bytes) and supplies a narrow Browser/Context/Route adapter. The root publication closure must outer-pin that exact dependency. This successor does not edit, replace or weaken its request count, concurrency, byte, header, body, timeout, frame, target, service-worker, WebSocket, provider, RPC, table or response controls.

## Exact static origin, not a caller URL

The caller passes the bytes read from the already-held owner-only static-server receipt FD, not a URL or port. The helper accepts at most 1,024 ASCII bytes and requires byte-for-byte equality with the fixed server's sorted compact JSON serialization. This rejects whitespace variants, duplicate or unknown members and alternate encodings. The exact receipt schema is `compatible-full-app-static-server.v1` with only `dist_dev`, `dist_ino`, `host`, `pgid`, `pid`, `port`, `project_route`, `schema` and `sid`. Host is exactly `127.0.0.1`, the project route is exactly `/project/55555555-5555-4555-8555-555555555555/economy`, and the port is a positive OS-returned TCP port. The expected static-server source remains SHA-256 `73ac24417f4de80c1020afb7a4ad1a12c3d0c610ca797b1dc32bca001d71b578`.

The same call supplies an exact `auth-chain-command-owner.v1` record with only PID, start time, process group and session identity. PID, PGID and SID must be one positive leader identity in both records. The returned binding is privately branded inside this module; a caller-fabricated frozen object cannot enter the network constructor. Its origin, fixed page URL and receipt SHA-256 are derived values.

For requests whose real origin equals the receipt origin, the adapter presents the old helper with its private historical loopback marker while preserving the original path and query. Requests to the retired `127.0.0.1:55784` literal are converted to a denied origin whenever that literal is not the actual receipt origin. Thus the old literal cannot remain a second allowed server. If the kernel itself assigns port 55784, it is valid only because the canonical held receipt names it. No wildcard host, alternate loopback spelling, HTTPS origin, credentials, fragment or caller-selected URL is admitted.

## Daemon epoch and ownership are retained

The binding includes the exact lowercase 64-hex witness returned by the independently reviewed read-only parent facade. A required callback must revalidate the real persisted Docker daemon/socket epoch and return the same witness. The successor calls it before context creation, before page preparation, before and after accepting the three settled read replies, and after context close. Drift is retained as failure and closes the owned context. This opaque witness is not a substitute for the facade's live daemon checks; a callback that merely echoes a string is not native evidence.

The static-server receipt grants no signal authority. The root controller must still retain the frozen b901 custody source SHA-256 `b9011bfd85b7af59057892bef9b628514367e84cd12a2c5b8d168a2b77721c7a`, compare its stronger PID/start-time record to the receipt before browser creation, keep its lease and process handle, and prove the exact process group absent after close. This JavaScript module neither starts nor signals the server. It does not read `/proc`, reopen a receipt pathname or claim that an owner is still live.

## Preserved browser and provider boundary

The exact project route and only manifest-derived static paths may continue to the receipt origin. Hosted `GET /auth/v1/user` remains explicitly aborted. Only the three established read RPC names and the existing bounded table GET surface may reach the unchanged native adapters. Foreign origins, provider mutations, login, publish, deploy, functions, arbitrary RPCs, child frames, extra pages, popups, workers, service workers and real WebSocket handshakes remain refused. Adapter response bytes and content type are handed to the browser without manufactured JSON. The helper creates no user, session, token, fixture, invoice, approval, payment, customer message or deployment.

## Required native-chain order

1. Outer-pin and verify this source, its existing browser-helper dependency, the static server, the frozen b901 custody kernel, adapters and the independently reviewed daemon-epoch facade.
2. Start the exact static server through the reviewed long-running owned-process boundary with its fresh held `0600` receipt FD and exact cold-build `dist` directory.
3. Read the receipt bytes from that held FD, acquire the b901 PID/start-time record, compare PID/PGID/SID and revalidate the daemon epoch before constructing this binding.
4. Create a fresh native browser/context, navigate only to the binding's fixed `projectUrl`, execute the real cached-auth read chain and collect the separately specified UI assertions and transport evidence.
5. Close the bridge and native browser, revalidate the daemon epoch, stop only the b901-owned static-server process group and prove browser, context, server and other owned resources absent. Preserve failure if any check, deadline or cleanup proof fails.

Local Node tests use protocol doubles to verify canonical receipt and owner admission, derived random-port routing, denial of the retired literal, provider/login/mutation refusal, unchanged three-RPC byte handoff, daemon-witness bracketing and drift cleanup, unforgeable binding admission and normalized browser failures. They do not run Chrome, the exact `809f64e0fd98322c53d9c4e9697df5b515303812` App build, real b901 process custody, Docker, Supabase, a cached actor or the native adapters. Native Linux evidence for the complete ordered chain remains an explicit integration gate.
