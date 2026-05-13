import { assertEquals } from "https://deno.land/std@0.224.0/assert/mod.ts";
import { normalizeBookingStatus } from "../_shared/booking-status.ts";

Deno.test("normalizeBookingStatus maps utkast variants to OFFER", () => {
  assertEquals(normalizeBookingStatus("UTKAST"), "OFFER");
  assertEquals(normalizeBookingStatus("utkast!"), "OFFER");
  assertEquals(normalizeBookingStatus("DRAFT"), "OFFER");
  assertEquals(normalizeBookingStatus("Offert"), "OFFER");
});

Deno.test("normalizeBookingStatus keeps confirmed and cancelled stable", () => {
  assertEquals(normalizeBookingStatus("Bekräftad"), "CONFIRMED");
  assertEquals(normalizeBookingStatus("CONFIRMED"), "CONFIRMED");
  assertEquals(normalizeBookingStatus("Avbokad"), "CANCELLED");
  assertEquals(normalizeBookingStatus("cancelled!"), "CANCELLED");
});