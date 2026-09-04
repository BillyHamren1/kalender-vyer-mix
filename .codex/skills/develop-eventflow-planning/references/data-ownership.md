# EventFlow ownership and integration contract

Use one authoritative owner per information area. Other modules consume projections or references; they do not create competing masters.

| Area | Owner | Planning behavior |
| --- | --- | --- |
| Customer, quote, commercial booking, price | Booking | Read the booking and link to it; do not create a second commercial order. |
| Delivery address/contact, event and rig dates, booking rows, booking attachments | Booking | Present the full operational read model. Write only through an agreed Booking contract where editing is allowed. |
| Articles, bundles, availability, reservations, packlists, scan/return | WMS/Bundle | Read the authoritative WMS projection. Never copy it into a Planning master. |
| Project, simple tasks, operational moments, staffing/calendar, execution status | Planning | Own and update these operational records. `booking_staff_assignments` is the team/assignment truth for ordinary booking projects. |
| Supplier and supplier contacts | Central WMS supplier registry | Search and create through the registry. Planning stores only project links and transaction references. |
| Transport request and status | Planning transport assignment | Link to the central supplier. Preserve legacy vehicle-based records as a read fallback until explicitly migrated. |
| Hours, GPS evidence, expenses, submission and approval | Time | Planning supplies project/work context and reads status; it does not own time evidence or payroll truth. |
| Communication intelligence, decisions, commitments, next-step control | BRAIN | Planning may initiate a basic transactional supplier request and save its thread on the booking; broader mail intelligence remains with BRAIN. |

## Supplier rules

- The shared registry contract is `suppliers` plus `supplier_contacts`, isolated by `organization_id`.
- A project stores `project_supplier_links`; it does not create a private supplier master.
- New suppliers created from Planning must be created in the central registry and then linked to the project.
- A transport assignment may reference the linked supplier/contact and store transactional cargo/request fields, not duplicate the supplier profile.

## Email rules

- Resolve sender identity from the authenticated organization/user and the organization's verified mail configuration. Never use a global hardcoded organization, person, or fallback UUID.
- If the authenticated context is Frans August, the visible sender identity must be Frans August according to the verified sender contract.
- The user reviews the premade email before sending.
- Save outgoing request, provider/message identifiers, delivery state, reply, response time, and status against the booking/project thread.
- An inbound reply must update the booking/project context without relying on manual copy-paste.

## Safety and compatibility

- Every read and write is organization-scoped. Cross-organization identifiers fail closed.
- Before schema work, inspect existing production rows and foreign keys.
- Add nullable linkage for an incremental migration when historical rows lack the new relation.
- Keep an explicit, tested legacy read path until migration is complete; do not silently reinterpret historical data.
- Test sync against representative historical records with rollback or read-only queries. Never mass-repair production data as part of feature delivery.
