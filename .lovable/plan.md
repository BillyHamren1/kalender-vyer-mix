

## Plan: Rensa alla icke-bekräftade bokningar från Planning

### Problem
Det finns 12 lokala bokningar som inte är CONFIRMED (10 DRAFT + 2 CANCELLED). Dessa ska bort.

### Approach
En enkel approach: radera alla lokala bokningar som INTE har status CONFIRMED. Inget behov av att hämta från Booking — vi vet redan att bara CONFIRMED ska finnas lokalt.

### Steg

**1. Migration: Radera alla icke-CONFIRMED bokningar**
- Disable triggers (samma mönster som tidigare)
- Radera booking_changes som refererar dessa bokningar
- `DELETE FROM bookings WHERE UPPER(status) != 'CONFIRMED' AND organization_id = 'f5e5cade-...'`
- Re-enable triggers

Detta tar bort alla 12 bokningar (10 DRAFT, 2 CANCELLED).

**2. Verifiera**
- Kör `SELECT UPPER(status), COUNT(*) FROM bookings GROUP BY UPPER(status)` — ska bara visa CONFIRMED.

### Men du sa "mappas mot bekräftad i Booking"?
Om du även vill att vi kollar att varje lokal CONFIRMED-bokning faktiskt finns som CONFIRMED i Booking (och tar bort de som inte gör det), behöver vi köra en sync mot det externa API:t. Det är ett extra steg — säg till om du vill ha det också, men det kräver att vi anropar edge-funktionen.

Enklaste första steget: radera de 12 icke-CONFIRMED nu.

