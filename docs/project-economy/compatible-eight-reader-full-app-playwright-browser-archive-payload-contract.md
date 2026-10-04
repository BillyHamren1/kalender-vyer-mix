# Playwright Chromium archive payload validation — streaming held-FD successor

Status: **source-only payload validator; transport, import and native browser remain blocked**.

This additive successor first calls the independently reviewed narrow held-FD archive boundary. It then reparses the same bounded central/local metadata and streams every declared payload from the held archive FD. Stored entries must have identical compressed and expanded lengths. DEFLATE entries pass through Node's raw inflater into a bounded sink; neither compressed input nor expanded output is retained as a whole. CRC32 and exact expanded byte count are checked for every entry. Only UTF-8 and data-descriptor flag bits are admitted. Signed and unsigned 32-bit data descriptors are parsed and matched to central CRC, compressed size and expanded size. Descriptor-inclusive local ranges must be ordered and nonoverlapping. The archive FD identity and deadline are rebound around the complete operation.

The narrow verifier returns a frozen receipt synchronously. This successor copies
its verified SHA-256 and byte count into local primitives before the first
asynchronous DEFLATE boundary and uses only those snapshots for all later
offset calculations and emitted receipt fields. Mutating the caller-owned
evidence object during an `await` therefore cannot alter the verified identity.

The resulting receipt may report payload CRC, compression streams and data descriptors verified, but continues to report `transport_provenance_verified:false` and `imported:false`. No file is created or extracted. No URL, network library, child process, provider, authentication, database or browser is touched. Exact browser archive bytes/SHA and authenticated downloader evidence are still absent; an independently reviewed held-private-directory importer and real exact-Node24.21/native chain are still required. The CLI always exits 78.
