

## Problem: Dubbel staff_member-post för Joel Habegger

Det finns **två** rader i `staff_members` med namnet "Joel Habegger":

| ID | Email | Har staff_account | Bokningsuppdrag |
|----|-------|-------------------|-----------------|
| `a6765273...` | joel@fransaugust.se | Nej | 2 st |
| `e640091d...` | (saknas) | Ja (joel.habegger) | 0 st |

Joel försöker logga in med sin e-post `joel@fransaugust.se`. Systemet hittar staff_member `a6765273`, men den posten saknar `staff_account` → returnerar 403 "Kontot saknar inloggning".

Den andra posten (`e640091d`) har kontot men saknar e-post och har inga uppdrag kopplade.

## Plan: Merge till en enda post

1. **Flytta staff_account** från `e640091d` till `a6765273` (den post som har e-post och uppdrag)
2. **Ta bort dubblettposten** `e640091d` från `staff_members`

Konkreta SQL-steg:
- `UPDATE staff_accounts SET staff_id = 'a6765273-4452-4cb0-a03b-e84a2c5a5df1' WHERE staff_id = 'e640091d-09d0-4c05-92bb-c26bbd294743'`
- `DELETE FROM staff_members WHERE id = 'e640091d-09d0-4c05-92bb-c26bbd294743'`

Efter detta kan Joel logga in med antingen `joel@fransaugust.se` eller `joel.habegger` och få tillgång till sina bokningar.

