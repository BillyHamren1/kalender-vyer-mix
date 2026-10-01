# Architecture rules

- Customer-facing order rows in Planning project views must be read live from Booking; never fall back to local WMS projection rows because Booking is the source of truth.
- Package members (e.g. tent frame parts) are shown under their Booking main row before its accessories, taken from Booking package_components or else only from WMS package-component rows matched by inventory_package_id, because they are package definition, not order rows.

- The current live Booking and local Lager paths remain active during the first transition stage. `order-shadow-v1` is a separate comparison, not a fallback product source. Show the actual current route separately; a successful legacy sync or shadow readback does not verify Lager or authorize cutover.
- Future canonical product relations use stable occurrence parent IDs, with customer and internal sorting independent. Ambiguous legacy associations must block migration rather than be inferred by package name or position.
