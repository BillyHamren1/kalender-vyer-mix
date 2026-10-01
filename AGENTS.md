# Architecture rules

- Customer-facing order rows in Planning project views must be read live from Booking; never fall back to local WMS projection rows because Booking is the source of truth.
- Package members (e.g. tent frame parts) are shown under their Booking main row before its accessories, taken from Booking package_components or else only from WMS package-component rows matched by inventory_package_id, because they are package definition, not order rows.