# Architecture rules

- Customer-facing order rows in Planning project views must be read live from Booking; never fall back to local WMS projection rows because Booking is the source of truth.